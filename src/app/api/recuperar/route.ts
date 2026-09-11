import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, socios, empresas, cuentas } from '@/lib/schema'

// Recuperación de clave sin mail, solo para usuarios socio/empresa:
// el socio se identifica con N° de socio + DNI, la empresa con N° de empresa + CBU.

const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const normNumEmpresa = (s: unknown) => {
  const t = String(s ?? '').trim().toUpperCase()
  return /^\d+$/.test(t) ? `EMP-${t}` : t
}

// Espera ante cada rechazo para frenar a quien pruebe DNIs/CBUs al azar.
async function rechazo(msg = 'Los datos no coinciden. Revisalos e intentá de nuevo.') {
  await new Promise(r => setTimeout(r, 800))
  return NextResponse.json({ error: msg }, { status: 400 })
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const password = String(body.password ?? '')
  if (password.length < 6)
    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })

  let role: 'socio' | 'empresa'
  let entityId: number

  if (body.tipo === 'socio') {
    const numeroSocio = soloDigitos(body.numeroSocio)
    const dni = soloDigitos(body.dni)
    if (!numeroSocio || !dni) return rechazo('Completá N° de socio y DNI')
    const [s] = await db.select().from(socios).where(eq(socios.numeroSocio, numeroSocio)).limit(1)
    if (!s) return rechazo()
    if (!soloDigitos(s.dni)) return rechazo('Tu socio no tiene DNI cargado. Pedile al banco que te cambie la clave.')
    if (soloDigitos(s.dni) !== dni) return rechazo()
    role = 'socio'
    entityId = s.id
  } else if (body.tipo === 'empresa') {
    const numeroEmpresa = normNumEmpresa(body.numeroEmpresa)
    const cbu = soloDigitos(body.cbu)
    if (!numeroEmpresa || !cbu) return rechazo('Completá N° de empresa y CBU')
    const [emp] = await db.select({ id: empresas.id }).from(empresas)
      .where(eq(empresas.numeroEmpresa, numeroEmpresa)).limit(1)
    if (!emp) return rechazo()
    const [cta] = await db.select({ id: cuentas.id }).from(cuentas)
      .where(and(eq(cuentas.empresaId, emp.id), eq(cuentas.cbu, cbu))).limit(1)
    if (!cta) return rechazo()
    role = 'empresa'
    entityId = emp.id
  } else {
    return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
  }

  const [user] = await db.select({ id: users.id, email: users.email, activo: users.activo }).from(users)
    .where(and(eq(users.role, role), eq(users.entityId, entityId))).limit(1)
  if (!user) return rechazo('Todavía no tenés usuario. Creálo desde "Registrate".')
  if (!user.activo) return rechazo('Tu usuario está desactivado. Consultá al banco.')

  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10) }).where(eq(users.id, user.id))
  return NextResponse.json({ ok: true, usuario: user.email })
}
