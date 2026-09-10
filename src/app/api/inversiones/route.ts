import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { cuentas, movimientosCuenta, inversiones } from '@/lib/schema'
import { and, desc, eq } from 'drizzle-orm'
import { getCotizaciones, fciActualById, type Cotizaciones, type Divisa } from '@/lib/cotizaciones'

const DIVISAS: Divisa[] = ['USD', 'EUR', 'BRL']
const PLAZOS_PF = [30, 60, 90, 180]

function hoyISO() {
  return new Date().toISOString().slice(0, 10)
}
function sumarDias(dias: number) {
  return new Date(Date.now() + dias * 86_400_000).toISOString().slice(0, 10)
}
function r2(n: number) {
  return Math.round(n * 100) / 100
}
function r6(n: number) {
  return Math.round(n * 1e6) / 1e6
}

type Inv = typeof inversiones.$inferSelect

// Valor actual de rescate de una posición abierta, con las cotizaciones dadas.
function valorActual(inv: Inv, cot: Cotizaciones): number {
  if (inv.tipo === 'divisa') {
    const d = cot.divisas[inv.activo as Divisa]
    return d ? r2(inv.cantidad * d.compra) : inv.montoInvertido
  }
  if (inv.tipo === 'accion') {
    const found = [...cot.acciones, ...cot.cedears].find(a => a.symbol === inv.activo)
    return found ? r2(inv.cantidad * found.precio) : inv.montoInvertido
  }
  if (inv.tipo === 'fci') {
    const f = fciActualById(inv.activo, cot.pfTna)
    return f ? r2(inv.cantidad * f.valorCuota) : inv.montoInvertido
  }
  if (inv.tipo === 'plazo_fijo') {
    if (inv.fechaVencimiento && hoyISO() >= inv.fechaVencimiento) return inv.montoFinal ?? inv.montoInvertido
    return inv.montoInvertido // precancelación: solo capital
  }
  return inv.montoInvertido
}

async function getCuenta(entityId: number | undefined, role: string | undefined) {
  if (!entityId) return null
  const col = role === 'empresa' ? cuentas.empresaId : cuentas.socioId
  const [c] = await db.select().from(cuentas)
    .where(and(eq(col, entityId), eq(cuentas.estado, 'activa')))
    .limit(1)
  return c ?? null
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session || !['empresa', 'socio'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cuenta = await getCuenta(session.user?.entityId as number | undefined, session.user?.role)
  if (!cuenta)
    return NextResponse.json({ error: 'No tiene cuenta bancaria activa' }, { status: 400 })

  const [cotizaciones, rows] = await Promise.all([
    getCotizaciones(),
    db.select().from(inversiones)
      .where(eq(inversiones.cuentaId, cuenta.id))
      .orderBy(desc(inversiones.id)),
  ])

  const abiertas = rows.filter(i => i.estado === 'abierta').map(i => {
    const va = valorActual(i, cotizaciones)
    return {
      ...i,
      valorActual: va,
      resultadoNoRealizado: r2(va - i.montoInvertido),
      vencido: i.tipo === 'plazo_fijo' && !!i.fechaVencimiento && hoyISO() >= i.fechaVencimiento,
    }
  })
  const cerradas = rows.filter(i => i.estado === 'cerrada').slice(0, 30)

  const totalInvertido = r2(abiertas.reduce((a, i) => a + i.montoInvertido, 0))
  const totalValor = r2(abiertas.reduce((a, i) => a + i.valorActual, 0))

  return NextResponse.json({
    cuenta: { id: cuenta.id, saldo: cuenta.saldo },
    cotizaciones,
    posiciones: abiertas,
    cerradas,
    resumen: {
      totalInvertido,
      valorActual: totalValor,
      resultado: r2(totalValor - totalInvertido),
    },
  })
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['empresa', 'socio'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const cuenta = await getCuenta(session.user?.entityId as number | undefined, session.user?.role)
  if (!cuenta)
    return NextResponse.json({ error: 'No tiene cuenta bancaria activa' }, { status: 400 })

  const body = await req.json()
  const { action } = body

  // ── Invertir ───────────────────────────────────────────────────────────────
  if (action === 'invertir') {
    const tipo = body.tipo as Inv['tipo']
    const activo = String(body.activo ?? '')
    const montoARS = Number(body.montoARS)

    if (!['divisa', 'plazo_fijo', 'fci', 'accion'].includes(tipo))
      return NextResponse.json({ error: 'Tipo de inversión inválido' }, { status: 400 })
    if (!montoARS || montoARS <= 0)
      return NextResponse.json({ error: 'Ingresá un monto válido' }, { status: 400 })
    if (montoARS > cuenta.saldo)
      return NextResponse.json({ error: 'Saldo insuficiente en tu cuenta' }, { status: 400 })

    const cot = await getCotizaciones()

    let cantidad: number
    let precioUnitario: number
    let nombre: string
    let tna: number | null = null
    let fechaVencimiento: string | null = null
    let montoFinal: number | null = null

    if (tipo === 'divisa') {
      if (!DIVISAS.includes(activo as Divisa))
        return NextResponse.json({ error: 'Divisa no soportada' }, { status: 400 })
      const d = cot.divisas[activo as Divisa]
      precioUnitario = d.venta // se compra al precio de venta del mercado
      cantidad = r6(montoARS / precioUnitario)
      nombre = d.nombre
    } else if (tipo === 'accion') {
      const found = [...cot.acciones, ...cot.cedears].find(a => a.symbol === activo)
      if (!found)
        return NextResponse.json({ error: 'No se pudo obtener la cotización de ese activo' }, { status: 400 })
      precioUnitario = found.precio
      cantidad = r6(montoARS / precioUnitario)
      nombre = `${found.nombre} (${found.symbol})`
    } else if (tipo === 'fci') {
      const f = fciActualById(activo, cot.pfTna)
      if (!f) return NextResponse.json({ error: 'Fondo inválido' }, { status: 400 })
      precioUnitario = f.valorCuota
      cantidad = r6(montoARS / precioUnitario)
      nombre = f.nombre
    } else {
      // plazo_fijo
      const plazoDias = Number(body.plazoDias)
      if (!PLAZOS_PF.includes(plazoDias))
        return NextResponse.json({ error: 'Plazo inválido' }, { status: 400 })
      tna = cot.pfTna
      fechaVencimiento = sumarDias(plazoDias)
      montoFinal = r2(montoARS * (1 + tna * (plazoDias / 365)))
      cantidad = 1
      precioUnitario = montoARS
      nombre = `Plazo fijo ${plazoDias} días`
    }

    const nuevoSaldo = r2(cuenta.saldo - montoARS)
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuenta.id,
      tipo: 'debito',
      monto: montoARS,
      concepto: `Inversión — ${nombre}`,
      saldoPosterior: nuevoSaldo,
    })
    const [inv] = await db.insert(inversiones).values({
      cuentaId: cuenta.id,
      tipo, activo, nombre, cantidad, precioUnitario,
      montoInvertido: montoARS,
      tna, fechaVencimiento, montoFinal,
    }).returning()

    return NextResponse.json({ ok: true, nuevoSaldo, inversion: inv }, { status: 201 })
  }

  // ── Rescatar ───────────────────────────────────────────────────────────────
  if (action === 'rescatar') {
    const inversionId = Number(body.inversionId)
    if (!inversionId)
      return NextResponse.json({ error: 'Falta el id de la inversión' }, { status: 400 })

    const [inv] = await db.select().from(inversiones)
      .where(and(eq(inversiones.id, inversionId), eq(inversiones.cuentaId, cuenta.id)))
      .limit(1)
    if (!inv || inv.estado !== 'abierta')
      return NextResponse.json({ error: 'Inversión no encontrada o ya rescatada' }, { status: 400 })

    const cot = await getCotizaciones()
    const va = valorActual(inv, cot)
    const resultado = r2(va - inv.montoInvertido)

    const nuevoSaldo = r2(cuenta.saldo + va)
    const signo = resultado >= 0 ? '+' : '−'
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuenta.id,
      tipo: 'credito',
      monto: va,
      concepto: `Rescate ${inv.nombre} · resultado ${signo}$${Math.abs(resultado).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`,
      saldoPosterior: nuevoSaldo,
    })
    await db.update(inversiones).set({
      estado: 'cerrada',
      resultado,
      montoRescatado: va,
      closedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
    }).where(eq(inversiones.id, inv.id))

    return NextResponse.json({ ok: true, nuevoSaldo, valorRescatado: va, resultado })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
