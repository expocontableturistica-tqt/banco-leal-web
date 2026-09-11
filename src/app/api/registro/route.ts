import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users, socios, empresas, cuentas } from '@/lib/schema'
import { crearCuentaSocio } from '@/lib/cuenta-utils'
import { generarNumeroSocio } from '@/lib/numeros'

// Alta pública de usuarios del homebanking (solo roles socio y empresa):
// - socio: se da de alta solo, o vincula el socio que ya cargó el banco (N° de socio + DNI)
// - empresa: vincula una empresa ya cargada por el banco (N° de empresa + CBU)

const soloDigitos = (s: unknown) => String(s ?? '').replace(/\D/g, '')
const normNumEmpresa = (s: unknown) => {
  const t = String(s ?? '').trim().toUpperCase()
  return /^\d+$/.test(t) ? `EMP-${t}` : t
}
const fallo = (msg: string) => NextResponse.json({ error: msg }, { status: 400 })

async function validarCredenciales(email: string, password: string) {
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) return 'Ingresá un email válido'
  if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres'
  const [existe] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1)
  if (existe) return 'Ya existe un usuario con ese email'
  return null
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const email = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '')

  const errCred = await validarCredenciales(email, password)
  if (errCred) return fallo(errCred)

  if (body.tipo === 'socio') {
    const nombre = String(body.nombre ?? '').trim()
    const apellido = String(body.apellido ?? '').trim()
    const dni = soloDigitos(body.dni)
    const numeroSocio = soloDigitos(body.numeroSocio)
    if (!nombre || !apellido) return fallo('Completá nombre y apellido')
    if (dni.length < 7 || dni.length > 8) return fallo('El DNI debe tener 7 u 8 números')

    let socio: typeof socios.$inferSelect

    if (numeroSocio) {
      const [existente] = await db.select().from(socios).where(eq(socios.numeroSocio, numeroSocio)).limit(1)
      if (!existente || (soloDigitos(existente.dni) && soloDigitos(existente.dni) !== dni))
        return fallo('El N° de socio y el DNI no coinciden')
      const [conUsuario] = await db.select({ id: users.id }).from(users)
        .where(and(eq(users.role, 'socio'), eq(users.entityId, existente.id))).limit(1)
      if (conUsuario) return fallo('Ese socio ya tiene usuario. Si olvidaste la clave, usá "¿Olvidaste tu contraseña?".')
      if (!soloDigitos(existente.dni)) await db.update(socios).set({ dni }).where(eq(socios.id, existente.id))
      socio = existente
    } else {
      const todos = await db.select({ numero: socios.numeroSocio, dni: socios.dni }).from(socios)
      if (todos.some(s => soloDigitos(s.dni) === dni))
        return fallo('Ya hay un socio con ese DNI. Ingresá también tu N° de socio para vincularlo.')
      const [nuevo] = await db.insert(socios).values({
        numeroSocio: generarNumeroSocio(new Set(todos.map(s => s.numero))),
        nombre, apellido, dni, montoAsignado: 0,
      }).returning()
      socio = nuevo
    }

    const [cuenta] = await db.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.socioId, socio.id)).limit(1)
    if (!cuenta) await crearCuentaSocio(socio.id)

    await db.insert(users).values({
      email, passwordHash: await bcrypt.hash(password, 10),
      name: `${socio.nombre} ${socio.apellido}`, role: 'socio', entityId: socio.id, activo: true,
    })
    return NextResponse.json({ ok: true, tipo: 'socio', numero: socio.numeroSocio, nombre: `${socio.nombre} ${socio.apellido}` }, { status: 201 })
  }

  if (body.tipo === 'empresa') {
    const numeroEmpresa = normNumEmpresa(body.numeroEmpresa)
    const cbu = soloDigitos(body.cbu)
    if (!numeroEmpresa || cbu.length !== 22) return fallo('Ingresá el N° de empresa y el CBU de 22 números')

    const [emp] = await db.select().from(empresas).where(eq(empresas.numeroEmpresa, numeroEmpresa)).limit(1)
    const [cuenta] = emp
      ? await db.select({ id: cuentas.id }).from(cuentas)
          .where(and(eq(cuentas.empresaId, emp.id), eq(cuentas.cbu, cbu))).limit(1)
      : []
    if (!emp || !cuenta) return fallo('Los datos no coinciden con ninguna empresa del banco')

    const [conUsuario] = await db.select({ id: users.id }).from(users)
      .where(and(eq(users.role, 'empresa'), eq(users.entityId, emp.id))).limit(1)
    if (conUsuario) return fallo('Esa empresa ya tiene usuario. Si olvidaron la clave, usen "¿Olvidaste tu contraseña?".')

    await db.insert(users).values({
      email, passwordHash: await bcrypt.hash(password, 10),
      name: emp.razonSocial, role: 'empresa', entityId: emp.id, activo: true,
    })
    return NextResponse.json({ ok: true, tipo: 'empresa', numero: emp.numeroEmpresa, nombre: emp.razonSocial }, { status: 201 })
  }

  return fallo('Tipo de registro inválido')
}
