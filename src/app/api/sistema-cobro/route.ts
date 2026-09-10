import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cuentas, empresas, movimientosCuenta, prestamos } from '@/lib/schema'
import { eq, and, desc } from 'drizzle-orm'

function checkApiKey(req: Request) {
  return req.headers.get('x-api-key') === process.env.MEDIAPAGO_API_KEY
}

async function prestamoVigente(empresaId: number | null) {
  if (!empresaId) return null
  const [p] = await db.select({
    monto: prestamos.monto,
    saldoPendiente: prestamos.saldoPendiente,
    cuotas: prestamos.cuotas,
    cuotasPagadas: prestamos.cuotasPagadas,
    montoCuota: prestamos.montoCuota,
    estado: prestamos.estado,
  }).from(prestamos)
    .where(and(eq(prestamos.empresaId, empresaId), eq(prestamos.estado, 'vigente')))
    .orderBy(desc(prestamos.createdAt)).limit(1)
  return p ?? null
}

// GET /api/sistema-cobro?cbu=XXX  → saldo y datos de cuenta
export async function GET(req: Request) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const cbu = searchParams.get('cbu')
  const empresaId = searchParams.get('empresaId')

  let query = db.select({
    id: cuentas.id,
    cbu: cuentas.cbu,
    alias: cuentas.alias,
    saldo: cuentas.saldo,
    tipo: cuentas.tipo,
    empresaId: cuentas.empresaId,
    razonSocial: empresas.razonSocial,
  }).from(cuentas).leftJoin(empresas, eq(cuentas.empresaId, empresas.id))

  if (cbu) {
    const [cuenta] = await query.where(eq(cuentas.cbu, cbu)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ...cuenta, prestamo: await prestamoVigente(cuenta.empresaId) })
  }

  if (empresaId) {
    const [cuenta] = await query.where(and(
      eq(cuentas.empresaId, parseInt(empresaId)),
      eq(cuentas.estado, 'activa')
    )).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    return NextResponse.json({ ...cuenta, prestamo: await prestamoVigente(cuenta.empresaId) })
  }

  // Listar todas las cuentas de empresas
  const todas = await query.where(eq(cuentas.estado, 'activa'))
  return NextResponse.json(todas.filter(c => c.empresaId))
}

// POST /api/sistema-cobro  → depositar venta electrónica
export async function POST(req: Request) {
  if (!checkApiKey(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { cbu, monto, concepto, tipo } = body

  if (!cbu || !monto || monto <= 0)
    return NextResponse.json({ error: 'cbu y monto requeridos' }, { status: 400 })

  const [cuenta] = await db.select().from(cuentas).where(
    and(eq(cuentas.cbu, cbu), eq(cuentas.estado, 'activa'))
  ).limit(1)

  if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
  if (!cuenta.empresaId) return NextResponse.json({ error: 'Solo cuentas de empresa' }, { status: 400 })

  const nuevoSaldo = cuenta.saldo + monto
  await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuenta.id))
  await db.insert(movimientosCuenta).values({
    cuentaId: cuenta.id,
    tipo: 'credito',
    monto,
    concepto: concepto || `Venta ${tipo || 'electrónica'}`,
    saldoPosterior: nuevoSaldo,
  })

  return NextResponse.json({ ok: true, saldo: nuevoSaldo })
}
