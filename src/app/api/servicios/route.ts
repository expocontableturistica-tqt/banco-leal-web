import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { pagosServicios, socios, caja, movimientosCaja } from '@/lib/schema'
import { and, desc, eq, isNull, gte } from 'drizzle-orm'

async function getCajaAbierta(userId: string) {
  // Primero la ventanilla del cajero, si no la bóveda
  const ventanilla = await db.select().from(caja)
    .where(and(eq(caja.userId, userId), eq(caja.estado, 'abierta')))
    .orderBy(desc(caja.id)).limit(1)
  if (ventanilla[0]) return ventanilla[0]

  const boveda = await db.select().from(caja)
    .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
    .orderBy(desc(caja.id)).limit(1)
  return boveda[0] ?? null
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const hoy = searchParams.get('hoy') === '1'

  const hoyISO = new Date()
  hoyISO.setHours(0, 0, 0, 0)

  const [pagos, sociosRows] = await Promise.all([
    db.select({
      id: pagosServicios.id,
      servicio: pagosServicios.servicio,
      monto: pagosServicios.monto,
      nroComprobante: pagosServicios.nroComprobante,
      createdAt: pagosServicios.createdAt,
      socioNombre: socios.nombre,
      socioApellido: socios.apellido,
      socioNumero: socios.numeroSocio,
    })
    .from(pagosServicios)
    .leftJoin(socios, eq(pagosServicios.socioId, socios.id))
    .where(hoy ? gte(pagosServicios.createdAt, hoyISO.toISOString()) : undefined)
    .orderBy(desc(pagosServicios.id))
    .limit(100),
    db.select({ id: socios.id, nombre: socios.nombre, apellido: socios.apellido, numeroSocio: socios.numeroSocio })
      .from(socios).orderBy(socios.apellido),
  ])

  return NextResponse.json({ pagos, socios: sociosRows })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { servicio, monto, nroComprobante, socioId } = await req.json()

  if (!servicio || !servicio.trim())
    return NextResponse.json({ error: 'El servicio es requerido' }, { status: 400 })
  if (!monto || monto <= 0)
    return NextResponse.json({ error: 'El monto debe ser mayor a cero' }, { status: 400 })

  const userId = session.user?.id ?? ''
  const cajaAbierta = await getCajaAbierta(userId)

  // Registrar el pago
  const [pago] = await db.insert(pagosServicios).values({
    servicio: servicio.trim(),
    monto,
    nroComprobante: nroComprobante?.trim() ?? '',
    socioId: socioId ? parseInt(socioId) : null,
  }).returning()

  // Impactar la caja con un ingreso
  if (cajaAbierta?.id) {
    const nuevoSaldo = Math.round((cajaAbierta.saldoEfectivo + monto) * 100) / 100
    await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, cajaAbierta.id))
    await db.insert(movimientosCaja).values({
      cajaId: cajaAbierta.id,
      tipo: 'ingreso',
      monto,
      concepto: `Pago servicio: ${servicio.trim()}${nroComprobante ? ` (comp. ${nroComprobante})` : ''}`,
      saldoPosterior: nuevoSaldo,
    })
  }

  return NextResponse.json(pago, { status: 201 })
}
