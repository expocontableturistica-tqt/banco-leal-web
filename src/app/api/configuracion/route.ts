import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { users, empresas, socios } from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

const ROLES_INTERNOS = ['admin', 'cajero', 'operador'] as const
const ROLES_EXTERNOS = ['empresa', 'socio'] as const
const TODOS_ROLES = [...ROLES_INTERNOS, ...ROLES_EXTERNOS] as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') ?? 'internos'

  const roles = tipo === 'externos'
    ? [...ROLES_EXTERNOS]
    : tipo === 'todos'
    ? [...TODOS_ROLES]
    : [...ROLES_INTERNOS]

  const rows = await db.select({
    id: users.id,
    email: users.email,
    name: users.name,
    role: users.role,
    numeroCaja: users.numeroCaja,
    entityId: users.entityId,
    activo: users.activo,
    createdAt: users.createdAt,
  }).from(users).where(inArray(users.role, roles as ('admin' | 'cajero' | 'operador' | 'empresa' | 'socio')[]))

  // Para externos, enriquecer con la entidad vinculada
  if (tipo === 'externos') {
    const empIds = rows.filter(r => r.role === 'empresa' && r.entityId).map(r => r.entityId!)
    const socIds = rows.filter(r => r.role === 'socio' && r.entityId).map(r => r.entityId!)

    const emps = empIds.length
      ? await db.select({ id: empresas.id, razonSocial: empresas.razonSocial, numeroEmpresa: empresas.numeroEmpresa })
          .from(empresas).where(inArray(empresas.id, empIds))
      : []
    const socs = socIds.length
      ? await db.select({ id: socios.id, nombre: socios.nombre, apellido: socios.apellido, numeroSocio: socios.numeroSocio })
          .from(socios).where(inArray(socios.id, socIds))
      : []

    const empMap = Object.fromEntries(emps.map(e => [e.id, e]))
    const socMap = Object.fromEntries(socs.map(s => [s.id, s]))

    return NextResponse.json(rows.map(r => ({
      ...r,
      entidad: r.role === 'empresa' ? empMap[r.entityId!] : r.role === 'socio' ? socMap[r.entityId!] : null,
    })))
  }

  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { email, name, password, role, numeroCaja, entityId } = await req.json()

  if (!email || !name || !password || !role)
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  if (!([...TODOS_ROLES] as string[]).includes(role))
    return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
  if (password.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  if ((role === 'empresa' || role === 'socio') && !entityId)
    return NextResponse.json({ error: 'Debe vincular una empresa o socio' }, { status: 400 })

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
    entityId: (role === 'empresa' || role === 'socio') ? parseInt(entityId) : null,
    activo: true,
  }).returning()

  return NextResponse.json(creado, { status: 201 })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()

  // Reset de contraseña
  if (body.resetPassword) {
    const { id, newPassword } = body
    if (!id || !newPassword || newPassword.length < 6)
      return NextResponse.json({ error: 'Contraseña inválida (mín. 6 caracteres)' }, { status: 400 })
    const passwordHash = await bcrypt.hash(newPassword, 10)
    await db.update(users).set({ passwordHash }).where(eq(users.id, id))
    return NextResponse.json({ ok: true })
  }

  // Toggle activo
  const { id, activo } = body
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
