import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transacciones, caja, movimientosCaja } from '@/lib/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { generarQRDataUrl, verificarPayload } from '@/lib/qr'
import { randomBytes } from 'crypto'

function r2(n: number) {
  return Math.round(n * 100) / 100
}

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

    // Caja que va a pagar el retiro: la ventanilla del cajero si la tiene abierta,
    // si no la bóveda. Queda dentro del payload firmado del QR.
    let cajaId: number | null = null
    if (session.user?.role === 'cajero' && session.user?.id) {
      const [v] = await db.select().from(caja)
        .where(and(eq(caja.userId, session.user.id), eq(caja.estado, 'abierta')))
        .orderBy(desc(caja.id)).limit(1)
      if (v) cajaId = v.id
    }
    if (cajaId === null) {
      const [b] = await db.select().from(caja)
        .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
        .orderBy(desc(caja.id)).limit(1)
      if (b) cajaId = b.id
    }

    const payload = { v: 1, tipo, monto, socioId: socioId ?? null, cajaId, tid }
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

    const { tid, monto, socioId, cajaId } = result.payload as {
      tid: string; monto: number; socioId: number | null; cajaId: number | null
    }
    const existe = await db.select().from(transacciones).where(eq(transacciones.tid, tid)).limit(1)
    if (existe.length > 0) return NextResponse.json({ ok: false, error: 'QR ya utilizado' }, { status: 400 })

    await db.insert(transacciones).values({ tid, monto, socioId: socioId ?? null, descripcion: 'Retiro QR MediaPago' })

    // Descontar el efectivo de la caja que emitió el QR y dejar el movimiento
    let cajaDebitada: number | null = null
    if (cajaId) {
      const [c] = await db.select().from(caja).where(eq(caja.id, cajaId)).limit(1)
      if (c && c.estado === 'abierta') {
        const nuevoSaldo = Math.max(0, r2(c.saldoEfectivo - monto))
        await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, c.id))
        await db.insert(movimientosCaja).values({
          cajaId: c.id,
          tipo: 'egreso',
          monto,
          concepto: `Retiro QR MediaPago${socioId ? ` — socio #${socioId}` : ''}`,
          saldoPosterior: nuevoSaldo,
        })
        cajaDebitada = c.id
      }
    }

    return NextResponse.json({ ok: true, monto, tid, cajaDebitada })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
