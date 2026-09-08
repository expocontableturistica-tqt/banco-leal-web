import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { socios } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { randomBytes } from 'crypto'

function generarNumeroSocio(usados: Set<string>): string {
  let n: string
  do { n = String(Math.floor(100000 + Math.random() * 900000)) } while (usados.has(n))
  return n
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(socios).orderBy(socios.apellido)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { nombre, apellido, dni, montoAsignado } = await req.json()
  if (!nombre || !apellido) return NextResponse.json({ error: 'Nombre y apellido requeridos' }, { status: 400 })

  const existing = await db.select({ ns: socios.numeroSocio }).from(socios)
  const usados = new Set(existing.map(r => r.ns))

  const [creado] = await db.insert(socios).values({
    numeroSocio: generarNumeroSocio(usados),
    nombre: nombre.trim(),
    apellido: apellido.trim(),
    dni: (dni ?? '').trim(),
    montoAsignado: montoAsignado ?? 0,
  }).returning()

  return NextResponse.json(creado, { status: 201 })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, nombre, apellido, dni, montoAsignado } = await req.json()
  if (!id || !nombre || !apellido) return NextResponse.json({ error: 'Nombre y apellido requeridos' }, { status: 400 })

  const [updated] = await db.update(socios)
    .set({
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      dni: (dni ?? '').trim(),
      montoAsignado: montoAsignado ?? 0,
    })
    .where(eq(socios.id, id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  await db.delete(socios).where(eq(socios.id, id))
  return NextResponse.json({ ok: true })
}
