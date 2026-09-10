import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { db } from '@/lib/db'
import { cobrosQr } from '@/lib/schema'
import { eq } from 'drizzle-orm'

export const dynamic = 'force-dynamic'

// Mismo secreto y firma que MediaPago (qrValidator.signComercioPago) y SistemaCobro (qrgen.js)
const SECRET = process.env.MEDIAPAGO_COMERCIO_SECRET ?? 'MEDIAPAGO_COMERCIO_2024'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
}

type Comprobante = {
  tipo?: string
  comercioId?: string | number
  monto?: number
  tid?: string
  userNumber?: string | number
  ts?: number
  sig?: string
}

function firmaValida(c: Comprobante) {
  const msg = `${SECRET}|comprobante|${c.monto}|${c.comercioId}|${c.tid}|${c.userNumber}|${c.ts}`
  return createHash('sha256').update(msg).digest('hex').slice(0, 16) === c.sig
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS })
}

// POST — lo llama MediaPago desde el celular. Sin API key: el comprobante viene firmado.
// MediaPago espera la respuesta como máximo 5 segundos.
export async function POST(req: Request) {
  let c: Comprobante
  try {
    c = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido' }, { status: 400, headers: CORS })
  }
  if (c.tipo !== 'comercio_pago' || !c.tid || !c.comercioId || !c.monto || !c.userNumber || !c.ts || !c.sig)
    return NextResponse.json({ ok: false, error: 'Comprobante incompleto' }, { status: 400, headers: CORS })
  if (!firmaValida(c))
    return NextResponse.json({ ok: false, error: 'Firma inválida' }, { status: 400, headers: CORS })

  await db.insert(cobrosQr)
    .values({ tid: String(c.tid), comercioId: String(c.comercioId), payload: JSON.stringify(c) })
    .onConflictDoNothing()

  return NextResponse.json({ ok: true }, { headers: CORS })
}

// GET ?tid= — lo consulta SistemaCobro (con API key) hasta que llegue el aviso.
export async function GET(req: Request) {
  if (req.headers.get('x-api-key') !== process.env.MEDIAPAGO_API_KEY)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: CORS })

  const tid = new URL(req.url).searchParams.get('tid')
  if (!tid) return NextResponse.json({ ok: false, error: 'Falta tid' }, { status: 400, headers: CORS })

  const [row] = await db.select().from(cobrosQr).where(eq(cobrosQr.tid, tid)).limit(1)
  if (!row) return NextResponse.json({ ok: false, pendiente: true }, { headers: CORS })

  if (!row.retiradoAt)
    await db.update(cobrosQr).set({ retiradoAt: new Date().toISOString() }).where(eq(cobrosQr.tid, tid))

  return NextResponse.json({ ok: true, payload: JSON.parse(row.payload) }, { headers: CORS })
}
