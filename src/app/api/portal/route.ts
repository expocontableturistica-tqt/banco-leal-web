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

  let cuenta: typeof cuentas.$inferSelect | null = null
  let prestamo: typeof prestamos.$inferSelect | null = null
  let movimientos: (typeof movimientosCuenta.$inferSelect)[] = []
  let entidad: typeof empresas.$inferSelect | typeof socios.$inferSelect | null = null

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

  const body = await req.json()
  const { action } = body
  const entityId = session.user?.entityId as number

  // ── Depositar fondos ────────────────────────────────────────────────────────
  if (action === 'depositar') {
    const { monto, tipo, concepto } = body
    const TIPOS_VALIDOS = ['efectivo', 'cheque', 'transferencia', 'mediapago']
    if (!monto || monto <= 0 || !tipo || !TIPOS_VALIDOS.includes(tipo))
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const [cuenta] = await db.select().from(cuentas)
      .where(and(eq(cuentas.empresaId, entityId), eq(cuentas.estado, 'activa')))
      .limit(1)
    if (!cuenta)
      return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 400 })

    const tipoLabel: Record<string, string> = {
      efectivo: 'Depósito en efectivo',
      cheque: 'Depósito de cheque',
      transferencia: 'Transferencia recibida',
      mediapago: 'Cobro MediaPago',
    }

    const nuevoSaldo = cuenta.saldo + monto
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuenta.id,
      tipo: 'credito',
      monto,
      concepto: concepto ? `${tipoLabel[tipo]}: ${concepto}` : tipoLabel[tipo],
      saldoPosterior: nuevoSaldo,
    })

    return NextResponse.json({ ok: true, nuevoSaldo })
  }

  // ── Pagar cuota ─────────────────────────────────────────────────────────────
  if (action === 'pagarCuota') {
    const { prestamoId } = body
    if (!prestamoId)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const [prestamo] = await db.select().from(prestamos)
      .where(and(eq(prestamos.id, prestamoId), eq(prestamos.empresaId, entityId)))
      .limit(1)
    if (!prestamo || prestamo.estado === 'pagado')
      return NextResponse.json({ error: 'Préstamo no encontrado o ya pagado' }, { status: 400 })

    const montoCuota = prestamo.montoCuota ?? (prestamo.monto / prestamo.cuotas)
    const pagoReal = Math.min(montoCuota, prestamo.saldoPendiente)

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, prestamo.cuentaId)).limit(1)
    if (!cuenta || cuenta.saldo < pagoReal)
      return NextResponse.json({ error: 'Saldo insuficiente en su cuenta' }, { status: 400 })

    const nuevoSaldo = cuenta.saldo - pagoReal
    const nuevoSaldoPendiente = Math.max(0, prestamo.saldoPendiente - pagoReal)
    const nuevoEstado = nuevoSaldoPendiente <= 0.001 ? 'pagado' : 'vigente'
    const nuevasCuotasPagadas = Math.min(prestamo.cuotas, prestamo.cuotasPagadas + 1)

    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuenta.id,
      tipo: 'debito',
      monto: pagoReal,
      concepto: `Cuota ${nuevasCuotasPagadas}/${prestamo.cuotas} préstamo #${prestamoId}`,
      saldoPosterior: nuevoSaldo,
    })
    await db.update(prestamos).set({
      saldoPendiente: nuevoSaldoPendiente,
      estado: nuevoEstado,
      cuotasPagadas: nuevasCuotasPagadas,
    }).where(eq(prestamos.id, prestamoId))

    const [boveda] = await db.select().from(caja).where(isNull(caja.userId)).limit(1)
    if (boveda) {
      const nuevoSaldoBoveda = boveda.saldoEfectivo + pagoReal
      await db.update(caja).set({ saldoEfectivo: nuevoSaldoBoveda }).where(eq(caja.id, boveda.id))
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id, tipo: 'ingreso', monto: pagoReal,
        concepto: `Cuota préstamo empresa (portal)`,
        saldoPosterior: nuevoSaldoBoveda,
      })
    }

    return NextResponse.json({ ok: true, nuevoSaldo, nuevoSaldoPendiente, estado: nuevoEstado, cuotasPagadas: nuevasCuotasPagadas })
  }

  // ── Pago libre ──────────────────────────────────────────────────────────────
  if (action === 'pagar') {
    const { prestamoId, monto } = body
    if (!prestamoId || !monto || monto <= 0)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

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
    const montoCuota = prestamo.montoCuota ?? (prestamo.monto / prestamo.cuotas)
    const nuevasCuotasPagadas = nuevoEstado === 'pagado'
      ? prestamo.cuotas
      : Math.min(prestamo.cuotas, Math.floor((prestamo.monto - nuevoSaldoPendiente) / montoCuota + 0.01))

    await db.update(prestamos).set({
      saldoPendiente: nuevoSaldoPendiente,
      estado: nuevoEstado,
      cuotasPagadas: nuevasCuotasPagadas,
    }).where(eq(prestamos.id, prestamoId))

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
