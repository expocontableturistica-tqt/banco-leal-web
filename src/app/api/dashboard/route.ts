import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { socios, empresas, cuentas, caja, movimientosCaja, movimientosCuenta, prestaciones, transacciones } from '@/lib/schema'
import { and, count, desc, eq, gte, isNull, sql, sum } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const hoyISO = hoy.toISOString()

  const [
    [totalSocios],
    [totalEmpresas],
    [cuentasActivas],
    [saldoTotal],
    boveda,
    ventanillasAbiertas,
    movCajaHoy,
    movCuentaHoy,
    prestacionesHoy,
    transaccionesHoy,
  ] = await Promise.all([
    db.select({ n: count() }).from(socios),
    db.select({ n: count() }).from(empresas),
    db.select({ n: count() }).from(cuentas).where(eq(cuentas.estado, 'activa')),
    db.select({ total: sum(cuentas.saldo) }).from(cuentas).where(eq(cuentas.estado, 'activa')),
    db.select().from(caja).where(and(isNull(caja.userId), eq(caja.estado, 'abierta'))).orderBy(desc(caja.id)).limit(1),
    db.select().from(caja).where(and(eq(caja.estado, 'abierta'), sql`user_id IS NOT NULL`)),
    db.select({ n: count(), egreso: sum(sql<number>`CASE WHEN tipo='egreso' THEN monto ELSE 0 END`), ingreso: sum(sql<number>`CASE WHEN tipo='ingreso' THEN monto ELSE 0 END`) })
      .from(movimientosCaja).where(gte(movimientosCaja.createdAt, hoyISO)),
    db.select({ n: count() }).from(movimientosCuenta).where(gte(movimientosCuenta.createdAt, hoyISO)),
    db.select({ n: count() }).from(prestaciones).where(gte(prestaciones.createdAt, hoyISO)),
    db.select({ n: count() }).from(transacciones).where(gte(transacciones.createdAt, hoyISO)),
  ])

  // Últimos movimientos de cuentas del día
  const ultimosMovimientos = await db
    .select({
      id: movimientosCuenta.id,
      tipo: movimientosCuenta.tipo,
      monto: movimientosCuenta.monto,
      concepto: movimientosCuenta.concepto,
      createdAt: movimientosCuenta.createdAt,
    })
    .from(movimientosCuenta)
    .where(gte(movimientosCuenta.createdAt, hoyISO))
    .orderBy(desc(movimientosCuenta.id))
    .limit(8)

  const totalEfectivo =
    (boveda[0]?.saldoEfectivo ?? 0) +
    ventanillasAbiertas.filter(v => v.userId).reduce((a, v) => a + v.saldoEfectivo, 0)

  return NextResponse.json({
    socios: totalSocios.n,
    empresas: totalEmpresas.n,
    cuentasActivas: cuentasActivas.n,
    saldoEnCuentas: Number(saldoTotal.total ?? 0),
    caja: {
      bovedaAbierta: boveda.length > 0,
      bovedaSaldo: boveda[0]?.saldoEfectivo ?? 0,
      ventanillas: ventanillasAbiertas.filter(v => v.userId).length,
      totalEfectivo,
    },
    hoy: {
      movCaja: Number(movCajaHoy[0]?.n ?? 0),
      egresosCaja: Number(movCajaHoy[0]?.egreso ?? 0),
      ingresosCaja: Number(movCajaHoy[0]?.ingreso ?? 0),
      movCuenta: Number(movCuentaHoy[0]?.n ?? 0),
      prestaciones: Number(prestacionesHoy[0]?.n ?? 0),
      qrMediaPago: Number(transaccionesHoy[0]?.n ?? 0),
    },
    ultimosMovimientos,
  })
}
