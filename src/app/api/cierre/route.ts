import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  movimientosCuenta, movimientosCaja, pagosServicios,
  operacionesCambio, prestaciones, caja, config, users,
} from '@/lib/schema'
import { and, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm'

import { comienzoDelDia } from '@/lib/fechas'

// ── GET — resumen del día ─────────────────────────────────────────────────────
export async function GET() {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const desde = comienzoDelDia()

  const [
    movCuenta,
    movCajaRows,
    arqueoRows,
    serviciosRows,
    cambioRows,
    prestRows,
    ventanillasAbiertas,
    bovedaRows,
    ultimoCierreRow,
  ] = await Promise.all([
    // Movimientos de cuentas hoy
    db.select({
      tipo: movimientosCuenta.tipo,
      total: sql<number>`SUM(monto)`,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(movimientosCuenta)
    .where(gte(movimientosCuenta.createdAt, desde))
    .groupBy(movimientosCuenta.tipo),

    // Movimientos de caja hoy
    db.select({
      tipo: movimientosCaja.tipo,
      total: sql<number>`SUM(monto)`,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(movimientosCaja)
    .where(gte(movimientosCaja.createdAt, desde))
    .groupBy(movimientosCaja.tipo),

    // Movimientos de hoy separados por caja, para el arqueo
    db.select({
      cajaId: movimientosCaja.cajaId,
      tipo: movimientosCaja.tipo,
      total: sql<number>`SUM(monto)`,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(movimientosCaja)
    .where(gte(movimientosCaja.createdAt, desde))
    .groupBy(movimientosCaja.cajaId, movimientosCaja.tipo),

    // Servicios hoy
    db.select({
      total: sql<number>`SUM(monto)`,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(pagosServicios)
    .where(gte(pagosServicios.createdAt, desde)),

    // Cambio hoy
    db.select({
      operacion: operacionesCambio.operacion,
      totalARS: sql<number>`SUM(monto_ars)`,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(operacionesCambio)
    .where(gte(operacionesCambio.createdAt, desde))
    .groupBy(operacionesCambio.operacion),

    // Prestaciones hoy
    db.select({
      tipo: prestaciones.tipo,
      cantidad: sql<number>`COUNT(*)`,
    })
    .from(prestaciones)
    .where(gte(prestaciones.createdAt, desde))
    .groupBy(prestaciones.tipo),

    // Ventanillas abiertas (cajeros)
    db.select().from(caja)
      .where(and(eq(caja.estado, 'abierta'), sql`user_id IS NOT NULL`))
      .orderBy(caja.numeroCaja),

    // Bóveda
    db.select().from(caja)
      .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
      .orderBy(desc(caja.id)).limit(1),

    // Último cierre registrado
    db.select().from(config).where(eq(config.key, 'ultimo_cierre')).limit(1),
  ])

  // ── Arqueo: una fila por caja que trabajó hoy (más las que están abiertas) ──
  const idsConMovimientos = [...new Set(arqueoRows.map(r => r.cajaId).filter((id): id is number => !!id))]
  const cajasDelDia = idsConMovimientos.length
    ? await db.select({
        id: caja.id, userId: caja.userId, numeroCaja: caja.numeroCaja,
        saldoEfectivo: caja.saldoEfectivo, estado: caja.estado,
        fechaApertura: caja.fechaApertura, fechaCierre: caja.fechaCierre,
        cajero: users.name,
      }).from(caja).leftJoin(users, eq(caja.userId, users.id)).where(inArray(caja.id, idsConMovimientos))
    : []

  const ENTRADAS = ['ingreso', 'transferencia_entrada']
  const SALIDAS  = ['egreso', 'transferencia_salida']
  const arqueo = cajasDelDia.map(c => {
    const suyos = arqueoRows.filter(r => r.cajaId === c.id)
    const sumar = (tipos: string[]) => suyos.filter(r => tipos.includes(r.tipo)).reduce((a, r) => ({
      monto: a.monto + Number(r.total ?? 0),
      cantidad: a.cantidad + Number(r.cantidad ?? 0),
    }), { monto: 0, cantidad: 0 })
    const ingresos = sumar(ENTRADAS)
    const egresos  = sumar(SALIDAS)
    return {
      id: c.id,
      esBoveda: c.userId === null,
      numeroCaja: c.numeroCaja,
      cajero: c.cajero ?? null,
      estado: c.estado,
      // Saldo con el que empezó el día: lo que hay ahora menos lo que se movió hoy
      saldoInicial: Math.round((c.saldoEfectivo - ingresos.monto + egresos.monto) * 100) / 100,
      ingresos,
      egresos,
      saldoActual: c.saldoEfectivo,
    }
  }).sort((a, b) => Number(b.esBoveda) - Number(a.esBoveda) || (a.numeroCaja ?? 0) - (b.numeroCaja ?? 0))

  const creditos   = movCuenta.find(m => m.tipo === 'credito')
  const debitos    = movCuenta.find(m => m.tipo === 'debito')
  const ingresosCaja = movCajaRows.find(m => m.tipo === 'ingreso')
  const egresosCaja  = movCajaRows.find(m => m.tipo === 'egreso')
  const ventasCambio  = cambioRows.find(c => c.operacion === 'venta')
  const comprasCambio = cambioRows.find(c => c.operacion === 'compra')

  return NextResponse.json({
    fecha: new Date().toISOString(),
    ultimoCierre: ultimoCierreRow[0]?.value ?? null,
    cuentas: {
      creditos:  { monto: Number(creditos?.total  ?? 0), cantidad: Number(creditos?.cantidad  ?? 0) },
      debitos:   { monto: Number(debitos?.total   ?? 0), cantidad: Number(debitos?.cantidad   ?? 0) },
    },
    caja: {
      ingresos:  { monto: Number(ingresosCaja?.total ?? 0), cantidad: Number(ingresosCaja?.cantidad ?? 0) },
      egresos:   { monto: Number(egresosCaja?.total  ?? 0), cantidad: Number(egresosCaja?.cantidad  ?? 0) },
    },
    servicios: {
      monto: Number(serviciosRows[0]?.total ?? 0),
      cantidad: Number(serviciosRows[0]?.cantidad ?? 0),
    },
    cambio: {
      ventas:  { montoARS: Number(ventasCambio?.totalARS  ?? 0), cantidad: Number(ventasCambio?.cantidad  ?? 0) },
      compras: { montoARS: Number(comprasCambio?.totalARS ?? 0), cantidad: Number(comprasCambio?.cantidad ?? 0) },
    },
    prestaciones: prestRows.map(p => ({ tipo: p.tipo, cantidad: Number(p.cantidad) })),
    arqueo,
    cajaActual: {
      bovedaAbierta: bovedaRows.length > 0,
      bovedaSaldo:   bovedaRows[0]?.saldoEfectivo ?? 0,
      ventanillas:   ventanillasAbiertas,
    },
  })
}

// ── POST — acciones de cierre ─────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { accion } = await req.json()

  // Cerrar todas las ventanillas abiertas
  if (accion === 'cerrar_ventanillas') {
    const abiertas = await db.select().from(caja)
      .where(and(eq(caja.estado, 'abierta'), sql`user_id IS NOT NULL`))

    for (const v of abiertas) {
      const saldo = v.saldoEfectivo
      await db.update(caja)
        .set({ estado: 'cerrada', fechaCierre: new Date().toISOString() })
        .where(eq(caja.id, v.id))
      await db.insert(movimientosCaja).values({
        cajaId: v.id, tipo: 'cierre', monto: saldo,
        concepto: `Cierre automático ventanilla ${v.numeroCaja} — Cierre del día`,
        saldoPosterior: saldo,
      })
      // Reintegrar a la bóveda si está abierta
      const boveda = await db.select().from(caja)
        .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
        .orderBy(desc(caja.id)).limit(1)
      if (boveda[0] && saldo > 0) {
        const nuevoSaldo = Math.round((boveda[0].saldoEfectivo + saldo) * 100) / 100
        await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, boveda[0].id))
        await db.insert(movimientosCaja).values({
          cajaId: boveda[0].id, tipo: 'transferencia_entrada', monto: saldo,
          concepto: `Reintegro cierre día — ventanilla ${v.numeroCaja}`,
          saldoPosterior: nuevoSaldo,
        })
      }
    }
    return NextResponse.json({ cerradas: abiertas.length })
  }

  // Cerrar bóveda
  if (accion === 'cerrar_boveda') {
    const boveda = await db.select().from(caja)
      .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
      .orderBy(desc(caja.id)).limit(1)
    if (!boveda[0]) return NextResponse.json({ error: 'La bóveda ya está cerrada' }, { status: 400 })

    const saldo = boveda[0].saldoEfectivo
    await db.update(caja)
      .set({ estado: 'cerrada', fechaCierre: new Date().toISOString() })
      .where(eq(caja.id, boveda[0].id))
    await db.insert(movimientosCaja).values({
      cajaId: boveda[0].id, tipo: 'cierre', monto: saldo,
      concepto: 'Cierre de bóveda — Cierre del día',
      saldoPosterior: saldo,
    })
    return NextResponse.json({ ok: true, saldo })
  }

  // Registrar cierre del día en config
  if (accion === 'registrar') {
    const now = new Date().toISOString()
    await db.insert(config).values({ key: 'ultimo_cierre', value: now })
      .onConflictDoUpdate({ target: config.key, set: { value: now } })
    return NextResponse.json({ ok: true, fecha: now })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
