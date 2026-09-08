import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { empresas, cuentas, prestamos, movimientosCuenta, codigosExternos } from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'
import { crearCuentaEmpresa } from '@/lib/cuenta-utils'

function generarNumeroEmpresa(usados: Set<string>): string {
  let n: string
  do { n = 'EMP-' + String(Math.floor(100000 + Math.random() * 900000)) } while (usados.has(n))
  return n
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await db.select().from(empresas).orderBy(empresas.razonSocial)
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { razonSocial, nombreFantasia, cuit, actividad } = await req.json()
  if (!razonSocial) return NextResponse.json({ error: 'Razón social requerida' }, { status: 400 })

  if (cuit && cuit.replace(/\D/g, '').length > 0) {
    const digits = cuit.replace(/\D/g, '')
    if (digits.length !== 11) return NextResponse.json({ error: 'El CUIT debe tener 11 dígitos' }, { status: 400 })
  }

  const existing = await db.select({ ne: empresas.numeroEmpresa }).from(empresas)
  const usados = new Set(existing.map(r => r.ne))

  const [creada] = await db.insert(empresas).values({
    numeroEmpresa: generarNumeroEmpresa(usados),
    razonSocial: razonSocial.trim(),
    nombreFantasia: (nombreFantasia ?? '').trim(),
    cuit: (cuit ?? '').replace(/\D/g, ''),
    actividad: (actividad ?? '').trim(),
  }).returning()

  await crearCuentaEmpresa(creada.id)

  return NextResponse.json(creada, { status: 201 })
}

export async function PUT(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, razonSocial, nombreFantasia, cuit, actividad } = await req.json()
  if (!id || !razonSocial) return NextResponse.json({ error: 'Razón social requerida' }, { status: 400 })

  const digits = cuit ? String(cuit).replace(/\D/g, '') : ''
  if (digits && digits.length !== 11)
    return NextResponse.json({ error: 'El CUIT debe tener 11 dígitos' }, { status: 400 })

  const [updated] = await db.update(empresas)
    .set({
      razonSocial: razonSocial.trim(),
      nombreFantasia: (nombreFantasia ?? '').trim(),
      cuit: digits,
      actividad: (actividad ?? '').trim(),
    })
    .where(eq(empresas.id, id))
    .returning()

  return NextResponse.json(updated)
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await req.json()

  // Cascade: movimientos → codigos_externos → prestamos → cuentas → empresa
  const cuentasEmpresa = await db.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.empresaId, id))
  const cuentaIds = cuentasEmpresa.map(c => c.id)

  if (cuentaIds.length) {
    await db.delete(movimientosCuenta).where(inArray(movimientosCuenta.cuentaId, cuentaIds))
    await db.delete(codigosExternos).where(inArray(codigosExternos.cuentaId, cuentaIds))
  }
  await db.delete(prestamos).where(eq(prestamos.empresaId, id))
  if (cuentaIds.length) {
    await db.delete(cuentas).where(inArray(cuentas.id, cuentaIds))
  }
  await db.delete(empresas).where(eq(empresas.id, id))

  return NextResponse.json({ ok: true })
}
