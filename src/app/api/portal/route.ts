import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { cuentas, movimientosCuenta, prestamos, empresas, socios, caja, movimientosCaja } from '@/lib/schema'
import { eq, and, desc, isNull } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session || !['empresa', 'socio'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const entityId = session.user?.entityId as number | undefined
  const role = session.user?.role

  let cuenta = null
  let prestamo = null
  let movimientos = []
  let entidad = null

  if (role === 'empresa' && entityId) {
    const [emp] = await db.select().from(empresas).where(eq(empresas.id, entityId)).limit(1)
    entidad = emp

    const [c] = await db.select().from(cuentas)
      .where(and(eq(cuentas.empresaId, entityId), eq(cuentas.estado, 'activa')))
      .limit(1)
    cuenta = c

    if (cuenta) {
      movimientos = await db.select().from(movimientosCuenta)
        .where(eq(movimientosCuenta.cuentaId, cuenta.id))
        .orderBy(desc(movimientosCuenta.createdAt))
        .limit(20)

      const [p] = await db.select().from(prestamos)
        .where(and(eq(prestamos.empresaId, entityId), eq(prestamos.estado, 'vigente')))
        .orderBy(desc(prestamos.createdAt))
        .limit(1)
      prestamo = p ?? null
    }
  }

  if (role === 'socio' && entityId) {
    const [soc] = await db.select().from(socios).where(eq(socios.id, entityId)).limit(1)
    entidad = soc

    const [c] = await db.select().from(cuentas)
      .where(and(eq(cuentas.socioId, entityId), eq(cuentas.estado, 'activa')))
      .limit(1)
    cuenta = c

    if (cuenta) {
      movimientos = await db.select().from(movimientosCuenta)
        .where(eq(movimientosCuenta.cuentaId, cuenta.id))
        .orderBy(desc(movimientosCuenta.createdAt))
        .limit(20)
    }
  }

  return NextResponse.json({ entidad, cuenta, movimientos, prestamo })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'empresa')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { action, prestamoId, monto } = await req.json()

  if (action === 'pagar') {
    if (!prestamoId || !monto || monto <= 0)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const entityId = session.user?.entityId as number
    const [prestamo] = await db.select().from(prestamos)
      .where(and(eq(prestamos.id, prestamoId), eq(prestamos.empresaId, entityId)))
      .limit(1)
    if (!prestamo || prestamo.estado === 'pagado')
      return NextResponse.json({ error: 'Préstamo no encontrado o ya pagado' }, { status: 400 })

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, prestamo.cuentaId)).limit(1)
    const pagoReal = Math.min(monto, prestamo.saldoPendiente)

    if (!cuenta || cuenta.saldo < pagoReal)
      return NextResponse.json({ error: 'Saldo insuficiente en su cuenta' }, { status: 400 })

    const nuevoSaldo = cuenta.saldo - pagoReal
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuenta.id,
      tipo: 'debito',
      monto: pagoReal,
      concepto: `Pago préstamo #${prestamoId}`,
      saldoPosterior: nuevoSaldo,
    })

    const nuevoSaldoPendiente = Math.max(0, prestamo.saldoPendiente - pagoReal)
    const nuevoEstado = nuevoSaldoPendiente <= 0.001 ? 'pagado' : 'vigente'
    await db.update(prestamos).set({ saldoPendiente: nuevoSaldoPendiente, estado: nuevoEstado })
      .where(eq(prestamos.id, prestamoId))

    const [boveda] = await db.select().from(caja).where(isNull(caja.userId)).limit(1)
    if (boveda) {
      const nuevoSaldoBoveda = boveda.saldoEfectivo + pagoReal
      await db.update(caja).set({ saldoEfectivo: nuevoSaldoBoveda }).where(eq(caja.id, boveda.id))
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id, tipo: 'ingreso', monto: pagoReal,
        concepto: `Pago préstamo empresa (portal)`,
        saldoPosterior: nuevoSaldoBoveda,
      })
    }

    return NextResponse.json({ ok: true, nuevoSaldo, nuevoSaldoPendiente, estado: nuevoEstado })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
