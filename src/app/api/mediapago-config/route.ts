import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { empresas, cuentas } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      empresaId: empresas.id,
      razonSocial: empresas.razonSocial,
      nombreFantasia: empresas.nombreFantasia,
      numeroEmpresa: empresas.numeroEmpresa,
      cbu: cuentas.cbu,
      alias: cuentas.alias,
      estado: cuentas.estado,
    })
    .from(empresas)
    .leftJoin(cuentas, eq(cuentas.empresaId, empresas.id))
    .orderBy(empresas.razonSocial)

  return NextResponse.json({
    apiKey: process.env.MEDIAPAGO_API_KEY ?? '',
    empresas: rows,
  })
}
