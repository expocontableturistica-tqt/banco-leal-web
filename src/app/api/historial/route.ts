import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { movimientosCuenta, movimientosCaja, cuentas, socios, empresas, caja, users } from '@/lib/schema'
import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero', 'operador'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = session.user?.role
  const userId = session.user?.id ?? ''
  const { searchParams } = new URL(req.url)

  const desde = searchParams.get('desde') // YYYY-MM-DD
  const hasta = searchParams.get('hasta') // YYYY-MM-DD
  const seccion = searchParams.get('seccion') ?? 'all' // cuenta | caja | all
  const limit = Math.min(200, parseInt(searchParams.get('limit') ?? '50'))
  const offset = parseInt(searchParams.get('offset') ?? '0')

  // Drizzle SQLite timestamps are stored as ISO strings; prefix-match the date part
  const desdeISO = desde ? `${desde}T00:00:00` : undefined
  const hastaISO = hasta ? `${hasta}T23:59:59` : undefined

  // ── Movimientos de cuentas ──────────────────────────────────────────────────
  let movCuenta: {
    id: number; cuentaId: number; tipo: string; monto: number; concepto: string | null
    saldoPosterior: number; createdAt: string
    cbu: string; alias: string; tipoCuenta: string
    socioNombre: string | null; socioApellido: string | null
    razonSocial: string | null
  }[] = []

  if (seccion === 'all' || seccion === 'cuenta') {
    const filters = [
      desdeISO ? gte(movimientosCuenta.createdAt, desdeISO) : undefined,
      hastaISO ? lte(movimientosCuenta.createdAt, hastaISO) : undefined,
    ].filter(Boolean)

    movCuenta = await db
      .select({
        id: movimientosCuenta.id,
        cuentaId: movimientosCuenta.cuentaId,
        tipo: movimientosCuenta.tipo,
        monto: movimientosCuenta.monto,
        concepto: movimientosCuenta.concepto,
        saldoPosterior: movimientosCuenta.saldoPosterior,
        createdAt: movimientosCuenta.createdAt,
        cbu: cuentas.cbu,
        alias: cuentas.alias,
        tipoCuenta: cuentas.tipo,
        socioNombre: socios.nombre,
        socioApellido: socios.apellido,
        razonSocial: empresas.razonSocial,
      })
      .from(movimientosCuenta)
      .innerJoin(cuentas, eq(movimientosCuenta.cuentaId, cuentas.id))
      .leftJoin(socios, eq(cuentas.socioId, socios.id))
      .leftJoin(empresas, eq(cuentas.empresaId, empresas.id))
      .where(filters.length ? and(...(filters as Parameters<typeof and>)) : undefined)
      .orderBy(desc(movimientosCuenta.id))
      .limit(limit)
      .offset(offset)
  }

  // ── Movimientos de caja ─────────────────────────────────────────────────────
  let movCajaRows: {
    id: number; cajaId: number | null; tipo: string; monto: number; concepto: string | null
    saldoPosterior: number; createdAt: string
    numeroCaja: number | null; cajaUserId: string | null; cajeroNombre: string | null
  }[] = []

  // operador no tiene acceso a caja
  if ((seccion === 'all' || seccion === 'caja') && role !== 'operador') {
    const cajaFilters = [
      desdeISO ? gte(movimientosCaja.createdAt, desdeISO) : undefined,
      hastaISO ? lte(movimientosCaja.createdAt, hastaISO) : undefined,
      // cajero only sees their own caja movements
      role === 'cajero' ? sql`${caja.userId} = ${userId}` : undefined,
    ].filter(Boolean)

    movCajaRows = await db
      .select({
        id: movimientosCaja.id,
        cajaId: movimientosCaja.cajaId,
        tipo: movimientosCaja.tipo,
        monto: movimientosCaja.monto,
        concepto: movimientosCaja.concepto,
        saldoPosterior: movimientosCaja.saldoPosterior,
        createdAt: movimientosCaja.createdAt,
        numeroCaja: caja.numeroCaja,
        cajaUserId: caja.userId,
        cajeroNombre: users.name,
      })
      .from(movimientosCaja)
      .leftJoin(caja, eq(movimientosCaja.cajaId, caja.id))
      .leftJoin(users, eq(caja.userId, users.id))
      .where(cajaFilters.length ? and(...(cajaFilters as Parameters<typeof and>)) : undefined)
      .orderBy(desc(movimientosCaja.id))
      .limit(limit)
      .offset(offset)
  }

  return NextResponse.json({ movCuenta, movCaja: movCajaRows })
}
