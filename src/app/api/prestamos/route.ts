import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { prestamos, cuentas, empresas, socios, movimientosCuenta, movimientosCaja, caja } from '@/lib/schema'
import { eq, and, isNull, desc, gte, sql } from 'drizzle-orm'
import { leerEntrega, r2 } from '@/lib/prestamos'
import { qrDesdePayload, qrPrestamoMediaPago } from '@/lib/qr'

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ?qr=ID → volver a mostrar el QR MediaPago de un préstamo
  const qrDe = parseInt(new URL(req.url).searchParams.get('qr') ?? '')
  if (qrDe) {
    const [p] = await db.select({ monto: prestamos.monto, entrega: prestamos.entrega })
      .from(prestamos).where(eq(prestamos.id, qrDe)).limit(1)
    const entrega = p ? leerEntrega(p.entrega, p.monto) : null
    if (!entrega?.qrPayload) return NextResponse.json({ error: 'Este préstamo no tiene QR' }, { status: 404 })
    const venceTs = entrega.qrPayload.ts + 86400
    return NextResponse.json({
      dataUrl: await qrDesdePayload(entrega.qrPayload),
      monto: entrega.qr,
      venceTs,
      vencido: venceTs * 1000 < Date.now(),
    })
  }

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
      socioId: prestamos.socioId,
      cuentaId: prestamos.cuentaId,
      entrega: prestamos.entrega,
      razonSocial: empresas.razonSocial,
      socioNombre: socios.nombre,
      socioApellido: socios.apellido,
      numeroSocio: socios.numeroSocio,
      cbu: cuentas.cbu,
    })
    .from(prestamos)
    .leftJoin(empresas, eq(prestamos.empresaId, empresas.id))
    .leftJoin(socios, eq(prestamos.socioId, socios.id))
    .leftJoin(cuentas, eq(prestamos.cuentaId, cuentas.id))
    .orderBy(desc(prestamos.createdAt))

  return NextResponse.json(rows.map(({ entrega, ...r }) => {
    const e = leerEntrega(entrega, r.monto)
    return {
      ...r,
      titular: r.razonSocial ?? (r.socioApellido ? `${r.socioApellido}, ${r.socioNombre}` : '—'),
      entrega: { cuenta: e.cuenta, efectivo: e.efectivo, qr: e.qr, tieneQr: !!e.qrPayload },
    }
  }))
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { action } = body

  if (action === 'otorgar') {
    const esSocio = body.destinatario === 'socio'
    const titularId = parseInt(esSocio ? body.socioId : body.empresaId)
    const monto = r2(Number(body.monto))
    const concepto = String(body.concepto ?? '').trim() || 'Préstamo inicial'
    if (!titularId || !(monto > 0))
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const cuotasNum = Math.max(1, parseInt(body.cuotas) || 1)
    const montoCuotaCalc = r2(monto / cuotasNum)

    // Cómo se entrega: sin detalle va todo a la cuenta, como antes.
    const parte = (v: unknown) => r2(Math.max(0, Number(v) || 0))
    const entrega = body.entrega
      ? { cuenta: parte(body.entrega.cuenta), efectivo: parte(body.entrega.efectivo), qr: parte(body.entrega.qr) }
      : { cuenta: monto, efectivo: 0, qr: 0 }
    const suma = r2(entrega.cuenta + entrega.efectivo + entrega.qr)
    if (Math.abs(suma - monto) > 0.009)
      return NextResponse.json({ error: `Las formas de entrega suman $${fmt(suma)} y el préstamo es de $${fmt(monto)}` }, { status: 400 })

    let nombreTitular: string
    if (esSocio) {
      const [s] = await db.select().from(socios).where(eq(socios.id, titularId)).limit(1)
      if (!s) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })
      nombreTitular = `${s.apellido}, ${s.nombre}`
    } else {
      const [e] = await db.select().from(empresas).where(eq(empresas.id, titularId)).limit(1)
      if (!e) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })
      nombreTitular = e.razonSocial
    }

    // Cuenta del titular: la elegida o la primera activa. Queda asociada para cobrar las cuotas.
    const cuentasTitular = await db.select().from(cuentas)
      .where(and(eq(esSocio ? cuentas.socioId : cuentas.empresaId, titularId), eq(cuentas.estado, 'activa')))
      .orderBy(cuentas.id)
    const cuentaSel = body.cuentaId
      ? cuentasTitular.find(c => c.id === Number(body.cuentaId))
      : cuentasTitular[0]
    if (body.cuentaId && !cuentaSel)
      return NextResponse.json({ error: 'La cuenta elegida no es del titular o está inactiva' }, { status: 400 })
    if (entrega.cuenta > 0 && !cuentaSel)
      return NextResponse.json({ error: `${esSocio ? 'El socio' : 'La empresa'} no tiene una cuenta activa. Creala en Cuentas o entregá el préstamo en efectivo o por QR.` }, { status: 400 })

    const [boveda] = await db.select().from(caja)
      .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
      .orderBy(desc(caja.id)).limit(1)
    if (!boveda)
      return NextResponse.json({ error: 'La bóveda está cerrada. Abrila desde el menú Caja.' }, { status: 400 })
    if (boveda.saldoEfectivo + 0.001 < monto)
      return NextResponse.json({ error: `Saldo insuficiente en bóveda (disponible: $${fmt(boveda.saldoEfectivo)})` }, { status: 400 })

    const qr = entrega.qr > 0 ? await qrPrestamoMediaPago(entrega.qr, cuotasNum) : null

    // Todo el préstamo sale de la bóveda; el descuento controla el saldo en la misma operación.
    const [bovedaAct] = await db.update(caja)
      .set({ saldoEfectivo: sql`round(${caja.saldoEfectivo} - ${monto}, 2)` })
      .where(and(eq(caja.id, boveda.id), eq(caja.estado, 'abierta'), gte(caja.saldoEfectivo, monto - 0.001)))
      .returning()
    if (!bovedaAct)
      return NextResponse.json({ error: 'Saldo insuficiente en bóveda' }, { status: 400 })

    const [prestamo] = await db.insert(prestamos).values({
      empresaId: esSocio ? null : titularId,
      socioId: esSocio ? titularId : null,
      cuentaId: cuentaSel?.id ?? null,
      monto,
      saldoPendiente: monto,
      cuotas: cuotasNum,
      cuotasPagadas: 0,
      montoCuota: montoCuotaCalc,
      concepto,
      estado: 'vigente',
      entrega: JSON.stringify(qr ? { ...entrega, qrPayload: qr.payload } : entrega),
    }).returning()

    if (entrega.cuenta > 0 && cuentaSel) {
      const [cuentaAct] = await db.update(cuentas)
        .set({ saldo: sql`round(${cuentas.saldo} + ${entrega.cuenta}, 2)` })
        .where(eq(cuentas.id, cuentaSel.id))
        .returning()
      await db.insert(movimientosCuenta).values({
        cuentaId: cuentaSel.id,
        tipo: 'credito',
        monto: entrega.cuenta,
        concepto: `Préstamo otorgado: ${concepto} (${cuotasNum} cuota${cuotasNum > 1 ? 's' : ''})`,
        saldoPosterior: cuentaAct.saldo,
      })
    }

    // Un movimiento de bóveda por cada forma de entrega
    let saldoBoveda = r2(bovedaAct.saldoEfectivo + monto)
    const salidas: [number, string][] = [
      [entrega.cuenta, 'depositado en cuenta'],
      [entrega.efectivo, 'entregado en efectivo'],
      [entrega.qr, 'entregado por QR MediaPago'],
    ]
    for (const [parteMonto, forma] of salidas) {
      if (parteMonto <= 0) continue
      saldoBoveda = r2(saldoBoveda - parteMonto)
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id,
        tipo: 'egreso',
        monto: parteMonto,
        concepto: `Préstamo #${prestamo.id} a ${nombreTitular}: ${forma}`,
        saldoPosterior: saldoBoveda,
      })
    }

    return NextResponse.json({ ...prestamo, qrDataUrl: qr?.dataUrl ?? null }, { status: 201 })
  }

  if (action === 'pagar') {
    const prestamoId = Number(body.prestamoId)
    const monto = Number(body.monto)
    const enEfectivo = body.forma === 'efectivo'
    if (!prestamoId || !(monto > 0))
      return NextResponse.json({ error: 'Datos inválidos' }, { status: 400 })

    const [prestamo] = await db.select().from(prestamos).where(eq(prestamos.id, prestamoId)).limit(1)
    if (!prestamo || prestamo.estado === 'pagado')
      return NextResponse.json({ error: 'Préstamo no encontrado o ya pagado' }, { status: 400 })

    const pagoReal = r2(Math.min(monto, prestamo.saldoPendiente))
    const [boveda] = await db.select().from(caja)
      .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
      .orderBy(desc(caja.id)).limit(1)

    if (enEfectivo) {
      if (!boveda)
        return NextResponse.json({ error: 'La bóveda está cerrada: abrila para recibir el efectivo' }, { status: 400 })
    } else {
      if (!prestamo.cuentaId)
        return NextResponse.json({ error: 'El préstamo no tiene cuenta asociada: registrá el pago en efectivo' }, { status: 400 })
      const [cuentaAct] = await db.update(cuentas)
        .set({ saldo: sql`round(${cuentas.saldo} - ${pagoReal}, 2)` })
        .where(and(eq(cuentas.id, prestamo.cuentaId), gte(cuentas.saldo, pagoReal - 0.001)))
        .returning()
      if (!cuentaAct)
        return NextResponse.json({ error: 'Saldo insuficiente en la cuenta' }, { status: 400 })
      await db.insert(movimientosCuenta).values({
        cuentaId: prestamo.cuentaId,
        tipo: 'debito',
        monto: pagoReal,
        concepto: `Pago préstamo #${prestamoId}`,
        saldoPosterior: cuentaAct.saldo,
      })
    }

    const nuevoSaldoPendiente = Math.max(0, r2(prestamo.saldoPendiente - pagoReal))
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

    if (boveda) {
      const [bovedaAct] = await db.update(caja)
        .set({ saldoEfectivo: sql`round(${caja.saldoEfectivo} + ${pagoReal}, 2)` })
        .where(eq(caja.id, boveda.id))
        .returning()
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id,
        tipo: 'ingreso',
        monto: pagoReal,
        // "Cobro en efectivo préstamo #" lo usa Libros para registrar el cobro
        concepto: enEfectivo ? `Cobro en efectivo préstamo #${prestamoId}` : `Pago préstamo #${prestamoId} (débito en cuenta)`,
        saldoPosterior: bovedaAct.saldoEfectivo,
      })
    }

    return NextResponse.json({ ok: true, nuevoSaldoPendiente, estado: nuevoEstado, cuotasPagadas: nuevasCuotasPagadas })
  }

  return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
}
