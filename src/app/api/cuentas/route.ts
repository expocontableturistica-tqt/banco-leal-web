import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { cuentas, movimientosCuenta } from '@/lib/schema'
import { eq, sql } from 'drizzle-orm'
import { generarCBU } from '@/lib/qr'

export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const socioId = searchParams.get('socioId')
  const empresaId = searchParams.get('empresaId')

  let rows
  if (socioId) {
    rows = await db.select().from(cuentas).where(eq(cuentas.socioId, parseInt(socioId)))
  } else if (empresaId) {
    rows = await db.select().from(cuentas).where(eq(cuentas.empresaId, parseInt(empresaId)))
  } else {
    rows = await db.select().from(cuentas)
  }

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { socioId, empresaId, tipo } = await req.json()

  // Obtener el próximo id para el CBU (Turso no lo expone antes del insert)
  const [{ maxId }] = await db.select({ maxId: sql<number>`COALESCE(MAX(id), 0)` }).from(cuentas)
  const nextId = (maxId ?? 0) + 1

  const [creada] = await db.insert(cuentas).values({
    socioId: socioId ?? null,
    empresaId: empresaId ?? null,
    tipo: tipo ?? 'CA',
    cbu: generarCBU(nextId),
    alias: `BANCO.FICTICIO.${String(nextId).padStart(6, '0')}`,
    saldo: 0,
    estado: 'activa',
  }).returning()

  return NextResponse.json(creada, { status: 201 })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, accion, monto, concepto } = await req.json()

  if (accion === 'toggle') {
    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, id)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    const [updated] = await db.update(cuentas)
      .set({ estado: cuenta.estado === 'activa' ? 'inactiva' : 'activa' })
      .where(eq(cuentas.id, id))
      .returning()
    return NextResponse.json(updated)
  }

  if (accion === 'acreditar') {
    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, id)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    if (cuenta.estado === 'inactiva') return NextResponse.json({ error: 'Cuenta inactiva' }, { status: 400 })
    const nuevoSaldo = Math.round((cuenta.saldo + monto) * 100) / 100
    const [updated] = await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, id)).returning()
    await db.insert(movimientosCuenta).values({
      cuentaId: id, tipo: 'credito', monto, concepto: concepto ?? 'Acreditación', saldoPosterior: nuevoSaldo,
    })
    return NextResponse.json(updated)
  }

  if (accion === 'debitar') {
    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, id)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    if (cuenta.estado === 'inactiva') return NextResponse.json({ error: 'Cuenta inactiva' }, { status: 400 })
    if (cuenta.saldo < monto) return NextResponse.json({ error: 'Saldo insuficiente' }, { status: 400 })
    const nuevoSaldo = Math.round((cuenta.saldo - monto) * 100) / 100
    const [updated] = await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, id)).returning()
    await db.insert(movimientosCuenta).values({
      cuentaId: id, tipo: 'debito', monto: -monto, concepto: concepto ?? 'Débito', saldoPosterior: nuevoSaldo,
    })
    return NextResponse.json(updated)
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
