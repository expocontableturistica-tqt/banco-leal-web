import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transacciones } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { generarQRDataUrl, verificarPayload, firmarPayload } from '@/lib/qr'
import { randomBytes } from 'crypto'

// POST /api/qr  body: { accion: 'generar' | 'validar', ... }
export async function POST(req: Request) {
  const body = await req.json()
  const { accion } = body

  if (accion === 'generar') {
    const session = await auth()
    if (!session || !['admin', 'cajero'].includes(session.user?.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { monto, socioId, tipo = 'transferencia' } = body
    const tid = randomBytes(8).toString('hex').toUpperCase()
    const payload = { v: 1, tipo, monto, socioId: socioId ?? null, tid }
    const dataUrl = await generarQRDataUrl(payload)
    return NextResponse.json({ ok: true, dataUrl, tid, payload })
  }

  if (accion === 'validar') {
    // Llamado por MediaPago — verifica API key
    const key = req.headers.get('x-api-key')
    if (key !== process.env.MEDIAPAGO_API_KEY)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { token } = body
    const result = verificarPayload(token)
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 400 })

    const { tid, monto, socioId } = result.payload as { tid: string; monto: number; socioId: number | null }
    const existe = await db.select().from(transacciones).where(eq(transacciones.tid, tid)).limit(1)
    if (existe.length > 0) return NextResponse.json({ ok: false, error: 'QR ya utilizado' }, { status: 400 })

    await db.insert(transacciones).values({ tid, monto, socioId: socioId ?? null, descripcion: 'Pago vía MediaPago' })
    return NextResponse.json({ ok: true, monto, tid })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
