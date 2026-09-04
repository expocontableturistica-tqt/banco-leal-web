import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { caja, movimientosCaja } from '@/lib/schema'
import { desc, eq } from 'drizzle-orm'

async function getCajaActual() {
  const rows = await db.select().from(caja).orderBy(desc(caja.id)).limit(1)
  return rows[0] ?? { id: null, saldoEfectivo: 0, estado: 'cerrada', fechaApertura: null }
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getCajaActual())
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { accion, monto, concepto } = await req.json()
  const actual = await getCajaActual()

  if (accion === 'abrir') {
    if (actual.estado === 'abierta') return NextResponse.json({ error: 'La caja ya está abierta' }, { status: 400 })
    const saldo = monto ?? 0
    const [nueva] = await db.insert(caja).values({
      saldoEfectivo: saldo, estado: 'abierta', fechaApertura: new Date().toISOString(),
    }).returning()
    await db.insert(movimientosCaja).values({
      tipo: 'apertura', monto: saldo, concepto: 'Apertura del día', saldoPosterior: saldo,
    })
    return NextResponse.json(nueva)
  }

  if (accion === 'cerrar') {
    if (!actual.id || actual.estado === 'cerrada') return NextResponse.json({ error: 'La caja no está abierta' }, { status: 400 })
    const [updated] = await db.update(caja)
      .set({ estado: 'cerrada', fechaCierre: new Date().toISOString() })
      .where(eq(caja.id, actual.id!))
      .returning()
    await db.insert(movimientosCaja).values({
      tipo: 'cierre', monto: actual.saldoEfectivo, concepto: 'Cierre del día', saldoPosterior: actual.saldoEfectivo,
    })
    return NextResponse.json(updated)
  }

  if (accion === 'movimiento') {
    if (!actual.id || actual.estado === 'cerrada') return NextResponse.json({ error: 'La caja está cerrada' }, { status: 400 })
    const tipo = body_tipo(concepto, monto)
    const nuevoSaldo = tipo === 'ingreso'
      ? actual.saldoEfectivo + monto
      : Math.max(0, actual.saldoEfectivo - monto)
    await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, actual.id!))
    await db.insert(movimientosCaja).values({
      tipo, monto, concepto: concepto ?? tipo, saldoPosterior: nuevoSaldo,
    })
    return NextResponse.json({ saldoEfectivo: nuevoSaldo, estado: 'abierta' })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}

function body_tipo(concepto: string, monto: number): 'ingreso' | 'egreso' {
  // El caller pasa accion='movimiento' y el tipo va en concepto
  // Para simplificar: si monto > 0 es ingreso, si < 0 es egreso
  return monto >= 0 ? 'ingreso' : 'egreso'
}
