import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  movimientosCuenta, pagosServicios, operacionesCambio,
  asientosManuales, cuentas, socios, empresas, transacciones,
} from '@/lib/schema'
import { and, desc, eq, gte, lte } from 'drizzle-orm'

// ── Plan de cuentas simplificado ─────────────────────────────────────────────
export const PLAN: Record<string, { nombre: string; tipo: 'activo' | 'pasivo' | 'ingreso' | 'egreso' }> = {
  '1.1.1': { nombre: 'Caja y Efectivo',              tipo: 'activo'  },
  '1.1.2': { nombre: 'Reservas de Divisas',          tipo: 'activo'  },
  '2.1.1': { nombre: 'Depósitos a la vista',         tipo: 'pasivo'  },
  '4.1.1': { nombre: 'Ingresos por servicios',       tipo: 'ingreso' },
  '4.1.2': { nombre: 'Ingresos por cambio',          tipo: 'ingreso' },
  '5.1.1': { nombre: 'Egresos por cambio',           tipo: 'egreso'  },
  '5.1.2': { nombre: 'Otros egresos',                tipo: 'egreso'  },
  '9.9.9': { nombre: 'Cuenta general / varios',      tipo: 'activo'  },
}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export interface Asiento {
  id: string
  fecha: string
  concepto: string
  debe:  { codigo: string; cuenta: string; monto: number }
  haber: { codigo: string; cuenta: string; monto: number }
  origen: 'auto' | 'manual'
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde')
  const hasta = searchParams.get('hasta')

  const desdeISO = desde ? `${desde}T00:00:00` : undefined
  const hastaISO = hasta ? `${hasta}T23:59:59` : undefined

  const makeFilter = (col: Parameters<typeof gte>[0]) => {
    const f = [
      desdeISO ? gte(col, desdeISO) : undefined,
      hastaISO ? lte(col, hastaISO) : undefined,
    ].filter(Boolean)
    return f.length ? and(...(f as Parameters<typeof and>)) : undefined
  }

  const [movCuentaRows, serviciosRows, cambioRows, transaccionesRows, manualesRows] = await Promise.all([
    db.select({
      id: movimientosCuenta.id,
      tipo: movimientosCuenta.tipo,
      monto: movimientosCuenta.monto,
      concepto: movimientosCuenta.concepto,
      createdAt: movimientosCuenta.createdAt,
      // titular para el concepto
      socioNombre: socios.nombre,
      socioApellido: socios.apellido,
      razonSocial: empresas.razonSocial,
      cbu: cuentas.cbu,
    })
    .from(movimientosCuenta)
    .innerJoin(cuentas, eq(movimientosCuenta.cuentaId, cuentas.id))
    .leftJoin(socios, eq(cuentas.socioId, socios.id))
    .leftJoin(empresas, eq(cuentas.empresaId, empresas.id))
    .where(makeFilter(movimientosCuenta.createdAt))
    .orderBy(desc(movimientosCuenta.id)),

    db.select().from(pagosServicios)
      .where(makeFilter(pagosServicios.createdAt))
      .orderBy(desc(pagosServicios.id)),

    db.select().from(operacionesCambio)
      .where(makeFilter(operacionesCambio.createdAt))
      .orderBy(desc(operacionesCambio.id)),

    db.select().from(transacciones)
      .where(makeFilter(transacciones.createdAt))
      .orderBy(desc(transacciones.id)),

    db.select().from(asientosManuales)
      .where(
        desdeISO || hastaISO
          ? and(
              desdeISO ? gte(asientosManuales.fecha, desde!) : undefined,
              hastaISO ? lte(asientosManuales.fecha, hasta!) : undefined,
            )
          : undefined
      )
      .orderBy(desc(asientosManuales.id)),
  ])

  // ── Derivar asientos automáticos ──────────────────────────────────────────
  const asientos: Asiento[] = []

  for (const m of movCuentaRows) {
    const titular = m.razonSocial
      ? m.razonSocial
      : m.socioApellido ? `${m.socioApellido}` : m.cbu
    const concepto = `${m.tipo === 'credito' ? 'Depósito' : 'Extracción'} — ${titular}${m.concepto ? ` (${m.concepto})` : ''}`
    asientos.push({
      id: `MC-${m.id}`,
      fecha: m.createdAt,
      concepto,
      debe:  m.tipo === 'credito'
        ? { codigo: '1.1.1', cuenta: 'Caja y Efectivo',      monto: m.monto }
        : { codigo: '2.1.1', cuenta: 'Depósitos a la vista', monto: m.monto },
      haber: m.tipo === 'credito'
        ? { codigo: '2.1.1', cuenta: 'Depósitos a la vista', monto: m.monto }
        : { codigo: '1.1.1', cuenta: 'Caja y Efectivo',      monto: m.monto },
      origen: 'auto',
    })
  }

  for (const s of serviciosRows) {
    asientos.push({
      id: `SV-${s.id}`,
      fecha: s.createdAt,
      concepto: `Cobro servicio: ${s.servicio}${s.nroComprobante ? ` (comp. ${s.nroComprobante})` : ''}`,
      debe:  { codigo: '1.1.1', cuenta: 'Caja y Efectivo',        monto: s.monto },
      haber: { codigo: '4.1.1', cuenta: 'Ingresos por servicios', monto: s.monto },
      origen: 'auto',
    })
  }

  for (const c of cambioRows) {
    if (c.operacion === 'venta') {
      // banco vende divisas → recibe ARS, entrega divisas
      asientos.push({
        id: `CC-${c.id}`,
        fecha: c.createdAt,
        concepto: `Venta ${c.monto} ${c.divisa} @ $${c.tasaCambio}`,
        debe:  { codigo: '1.1.1', cuenta: 'Caja y Efectivo',    monto: c.montoARS },
        haber: { codigo: '1.1.2', cuenta: 'Reservas de Divisas', monto: c.montoARS },
        origen: 'auto',
      })
    } else {
      // banco compra divisas → paga ARS, recibe divisas
      asientos.push({
        id: `CC-${c.id}`,
        fecha: c.createdAt,
        concepto: `Compra ${c.monto} ${c.divisa} @ $${c.tasaCambio}`,
        debe:  { codigo: '1.1.2', cuenta: 'Reservas de Divisas', monto: c.montoARS },
        haber: { codigo: '1.1.1', cuenta: 'Caja y Efectivo',    monto: c.montoARS },
        origen: 'auto',
      })
    }
  }

  // ── Retiros por QR / MediaPago ───────────────────────────────────────────
  for (const t of transaccionesRows) {
    asientos.push({
      id: `TX-${t.id}`,
      fecha: t.createdAt,
      concepto: `Retiro QR MediaPago${t.socioId ? ` — socio #${t.socioId}` : ''}`,
      debe:  { codigo: '9.9.9', cuenta: 'Cuenta general / varios', monto: t.monto },
      haber: { codigo: '1.1.1', cuenta: 'Caja y Efectivo',         monto: t.monto },
      origen: 'auto',
    })
  }

  // ── Asientos manuales ─────────────────────────────────────────────────────
  for (const m of manualesRows) {
    asientos.push({
      id: `AM-${m.id}`,
      fecha: m.createdAt,
      concepto: m.concepto,
      debe:  { codigo: m.codigoDebe,  cuenta: m.cuentaDebe,  monto: m.montoDebe  },
      haber: { codigo: m.codigoHaber, cuenta: m.cuentaHaber, monto: m.montoHaber },
      origen: 'manual',
    })
  }

  // Ordenar por fecha descendente
  asientos.sort((a, b) => b.fecha.localeCompare(a.fecha))

  // ── Mayor: totales por cuenta ──────────────────────────────────────────────
  const mayor: Record<string, { nombre: string; tipo: string; debe: number; haber: number }> = {}
  function addMayor(codigo: string, cuenta: string, debe: number, haber: number) {
    if (!mayor[codigo]) mayor[codigo] = { nombre: cuenta, tipo: PLAN[codigo]?.tipo ?? 'activo', debe: 0, haber: 0 }
    mayor[codigo].debe  += debe
    mayor[codigo].haber += haber
  }
  for (const a of asientos) {
    addMayor(a.debe.codigo,  a.debe.cuenta,  a.debe.monto,  0)
    addMayor(a.haber.codigo, a.haber.cuenta, 0, a.haber.monto)
  }

  return NextResponse.json({ asientos, mayor, plan: PLAN })
}

// ── POST — asiento manual ─────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { fecha, concepto, codigoDebe, cuentaDebe, montoDebe, codigoHaber, cuentaHaber, montoHaber } = await req.json()

  if (!fecha || !concepto || !codigoDebe || !cuentaDebe || !montoDebe || !codigoHaber || !cuentaHaber || !montoHaber)
    return NextResponse.json({ error: 'Todos los campos son requeridos' }, { status: 400 })
  if (montoDebe <= 0 || montoHaber <= 0)
    return NextResponse.json({ error: 'Los montos deben ser mayores a cero' }, { status: 400 })
  if (Math.abs(montoDebe - montoHaber) > 0.001)
    return NextResponse.json({ error: 'El asiento no cuadra: Debe ≠ Haber' }, { status: 400 })

  const [row] = await db.insert(asientosManuales).values({
    fecha, concepto, codigoDebe, cuentaDebe, montoDebe, codigoHaber, cuentaHaber, montoHaber,
  }).returning()

  return NextResponse.json(row, { status: 201 })
}

// ── DELETE — eliminar asiento manual ─────────────────────────────────────────
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = parseInt(searchParams.get('id') ?? '')
  if (!id) return NextResponse.json({ error: 'ID requerido' }, { status: 400 })

  await db.delete(asientosManuales).where(eq(asientosManuales.id, id))
  return NextResponse.json({ ok: true })
}
