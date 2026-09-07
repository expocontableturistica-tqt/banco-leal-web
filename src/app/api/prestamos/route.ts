import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { prestamos, cuentas, empresas, movimientosCuenta, movimientosCaja, caja } from '@/lib/schema'
import { eq, and, isNull, desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      id: prestamos.id,
      monto: prestamos.monto,
      saldoPendiente: prestamos.saldoPendiente,
      cuotas: prestamos.cuotas,
      cuotasPagadas: prestamos.cuotasPagadas,
      montoCuota: prestamos.montoCuota,
      concepto: prestamos.concepto,
      estado: prestamos.estado,
      createdAt: prestamos.createdAt,
      empresaId: prestamos.empresaId,
      cuentaId: prestamos.cuentaId,
      razonSocial: empresas.razonSocial,
      cbu: cuentas.cbu,
    })
    .from(prestamos)
    .leftJoin(empresas, eq(prestamos.empresaId, empresas.id))
    .leftJoin(cuentas, eq(prestamos.cuentaId, cuentas.id))
    .orderBy(desc(prestamos.createdAt))

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { action } = body

  if (action === 'otorgar') {
    const { empresaId, monto, concepto, cuotas } = body
    if (!empresaId || !monto || monto <= 0)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const cuotasNum = Math.max(1, parseInt(cuotas) || 1)
    const montoCuotaCalc = Math.round((monto / cuotasNum) * 100) / 100

    const [cuentaEmpresa] = await db.select().from(cuentas)
      .where(and(eq(cuentas.empresaId, empresaId), eq(cuentas.estado, 'activa')))
      .limit(1)
    if (!cuentaEmpresa)
      return NextResponse.json({ error: 'La empresa no tiene cuenta activa' }, { status: 400 })

    const [boveda] = await db.select().from(caja).where(isNull(caja.userId)).limit(1)
    if (!boveda || boveda.saldoEfectivo < monto)
      return NextResponse.json({ error: 'Saldo insuficiente en bóveda' }, { status: 400 })

    const [prestamo] = await db.insert(prestamos).values({
      empresaId,
      cuentaId: cuentaEmpresa.id,
      monto,
      saldoPendiente: monto,
      cuotas: cuotasNum,
      cuotasPagadas: 0,
      montoCuota: montoCuotaCalc,
      concepto: concepto || 'Préstamo inicial',
      estado: 'vigente',
    }).returning()

    const nuevoSaldo = cuentaEmpresa.saldo + monto
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuentaEmpresa.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuentaEmpresa.id,
      tipo: 'credito',
      monto,
      concepto: `Préstamo otorgado: ${concepto || 'Préstamo inicial'} (${cuotasNum} cuota${cuotasNum > 1 ? 's' : ''})`,
      saldoPosterior: nuevoSaldo,
    })

    const nuevoSaldoBoveda = boveda.saldoEfectivo - monto
    await db.update(caja).set({ saldoEfectivo: nuevoSaldoBoveda }).where(eq(caja.id, boveda.id))
    await db.insert(movimientosCaja).values({
      cajaId: boveda.id,
      tipo: 'egreso',
      monto,
      concepto: `Préstamo a empresa ID ${empresaId}: ${concepto || 'Préstamo inicial'}`,
      saldoPosterior: nuevoSaldoBoveda,
    })

    return NextResponse.json(prestamo, { status: 201 })
  }

  if (action === 'pagar') {
    const { prestamoId, monto } = body
    if (!prestamoId || !monto || monto <= 0)
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const [prestamo] = await db.select().from(prestamos).where(eq(prestamos.id, prestamoId)).limit(1)
    if (!prestamo || prestamo.estado === 'pagado')
      return NextResponse.json({ error: 'Préstamo no encontrado o ya pagado' }, { status: 400 })

    const pagoReal = Math.min(monto, prestamo.saldoPendiente)
    const [cuentaEmpresa] = await db.select().from(cuentas).where(eq(cuentas.id, prestamo.cuentaId)).limit(1)

    if (!cuentaEmpresa || cuentaEmpresa.saldo < pagoReal)
      return NextResponse.json({ error: 'Saldo insuficiente en la cuenta' }, { status: 400 })

    const nuevoSaldo = cuentaEmpresa.saldo - pagoReal
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuentaEmpresa.id))
    await db.insert(movimientosCuenta).values({
      cuentaId: cuentaEmpresa.id,
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
        cajaId: boveda.id,
        tipo: 'ingreso',
        monto: pagoReal,
        concepto: `Pago préstamo empresa: ${pagoReal}`,
        saldoPosterior: nuevoSaldoBoveda,
      })
    }

    return NextResponse.json({ ok: true, nuevoSaldoPendiente, estado: nuevoEstado, cuotasPagadas: nuevasCuotasPagadas })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
