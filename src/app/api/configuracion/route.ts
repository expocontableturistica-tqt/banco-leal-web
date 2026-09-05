import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

const ROLES_INTERNOS = ['admin', 'cajero', 'operador'] as const

export async function GET() {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    numeroCaja: users.numeroCaja,
    activo: users.activo,
    createdAt: users.createdAt,
  }).from(users).where(inArray(users.role, [...ROLES_INTERNOS]))

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, name, password, role, numeroCaja } = await req.json()

  if (!email || !name || !password || !role)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (!ROLES_INTERNOS.includes(role))
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (password.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

  const existe = await db.select({ id: users.id }).from(users).where(eq(users.email, email.toLowerCase())).limit(1)
  if (existe.length > 0)
    return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 })

  const passwordHash = await bcrypt.hash(password, 10)
  const [creado] = await db.insert(users).values({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash,
    role,
    numeroCaja: role === 'cajero' ? (numeroCaja ?? null) : null,
    activo: true,
  }).returning({ id: users.id, email: users.email, name: users.name, role: users.role, numeroCaja: users.numeroCaja, activo: users.activo, createdAt: users.createdAt })

  return NextResponse.json(creado, { status: 201 })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, activo } = await req.json()
  if (id === session.user?.id)
    return NextResponse.json({ error: 'No podés desactivarte a vos mismo' }, { status: 400 })

  const [updated] = await db.update(users).set({ activo }).where(eq(users.id, id)).returning({ id: users.id, activo: users.activo })
  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()
  if (id === session.user?.id)
    return NextResponse.json({ error: 'No podés eliminarte a vos mismo' }, { status: 400 })

  await db.delete(users).where(eq(users.id, id))
  return NextResponse.json({ ok: true })
}
