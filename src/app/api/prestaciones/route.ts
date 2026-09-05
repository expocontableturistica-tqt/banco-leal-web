import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { prestaciones, socios } from '@/lib/schema'
import { desc, eq } from 'drizzle-orm'
import { generarQRDataUrl, firmarPayload } from '@/lib/qr'
import { randomBytes } from 'crypto'

const TIPOS_VALIDOS = [
  'banco_tarjeta',
  'banco_prestamo',
  'banco_seguro',
  'banco_limite',
  'banco_bono',
  'banco_inversion',
] as const

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'operador'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const socioId = searchParams.get('socioId')
  const tipo = searchParams.get('tipo')

  let q = db.select({
    id: prestaciones.id,
    socioId: prestaciones.socioId,
    tipo: prestaciones.tipo,
    descripcion: prestaciones.descripcion,
    datos: prestaciones.datos,
    tid: prestaciones.tid,
    createdAt: prestaciones.createdAt,
    socioNombre: socios.nombre,
    socioApellido: socios.apellido,
    socioNumero: socios.numeroSocio,
  })
  .from(prestaciones)
  .leftJoin(socios, eq(prestaciones.socioId, socios.id))
  .orderBy(desc(prestaciones.id))
  .limit(100)

  // Drizzle SQLite no tiene where condicional elegante; filtramos en JS
  const rows = await q
  const filtrados = rows.filter(r =>
    (!socioId || String(r.socioId) === socioId) &&
    (!tipo || r.tipo === tipo)
  )

  return NextResponse.json(filtrados)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'operador'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { socioId, tipo, descripcion, datos } = await req.json()

  if (!socioId || !tipo)
    return NextResponse.json({ error: 'socioId y tipo son requeridos' }, { status: 400 })
  if (!TIPOS_VALIDOS.includes(tipo))
    return NextResponse.json({ error: 'Tipo de prestación inválido' }, { status: 400 })

  const [socio] = await db.select().from(socios).where(eq(socios.id, socioId)).limit(1)
  if (!socio) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })

  const tid = randomBytes(8).toString('hex').toUpperCase()
  const datosObj = datos ?? {}

  // Payload v:2 compatible con MediaPago
  const payload = {
    v: 2,
    tipo,
    socioId,
    tid,
    datos: datosObj,
  }
  const token = firmarPayload(payload)
  const dataUrl = await generarQRDataUrl({ token, v: 2, tipo, tid })

  const [creada] = await db.insert(prestaciones).values({
    socioId,
    tipo,
    descripcion: descripcion ?? '',
    datos: JSON.stringify(datosObj),
    tid,
  }).returning()

  return NextResponse.json({ ...creada, dataUrl, token }, { status: 201 })
}
