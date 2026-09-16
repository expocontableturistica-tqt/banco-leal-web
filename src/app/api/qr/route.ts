import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { transacciones, caja, movimientosCaja } from '@/lib/schema'
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { qrCargaMediaPago, verificarPayload } from '@/lib/qr'

function r2(n: number) {
  return Math.round(n * 100) / 100
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// POST /api/qr  body: { accion: 'generar' | 'validar', ... }
export async function POST(req: Request) {
  const body = await req.json()
  const { accion } = body

  if (accion === 'generar') {
    const session = await auth()
    if (!session || !['admin', 'cajero'].includes(session.user?.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const socioId = body.socioId ? Number(body.socioId) : null
    const monto = r2(Number(body.monto))
    if (!(monto > 0)) return NextResponse.json({ error: 'Ingresá un monto válido' }, { status: 400 })

    // Caja que entrega el dinero: la ventanilla del cajero si la tiene abierta, si no la bóveda.
    let origen: typeof caja.$inferSelect | undefined
    if (session.user?.role === 'cajero' && session.user?.id) {
      [origen] = await db.select().from(caja)
        .where(and(eq(caja.userId, session.user.id), eq(caja.estado, 'abierta')))
        .orderBy(desc(caja.id)).limit(1)
    }
    if (!origen) {
      [origen] = await db.select().from(caja)
        .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
        .orderBy(desc(caja.id)).limit(1)
    }
    if (!origen)
      return NextResponse.json({ error: 'No hay caja abierta: abrí tu ventanilla o la bóveda desde Caja.' }, { status: 400 })

    // MediaPago no le avisa al banco cuando escanea el QR: el dinero sale de la caja al emitirlo.
    const { tid, payload, dataUrl } = await qrCargaMediaPago(monto)
    const [cajaAct] = await db.update(caja)
      .set({ saldoEfectivo: sql`round(${caja.saldoEfectivo} - ${monto}, 2)` })
      .where(and(eq(caja.id, origen.id), eq(caja.estado, 'abierta'), gte(caja.saldoEfectivo, monto - 0.001)))
      .returning()
    if (!cajaAct)
      return NextResponse.json({ error: `La caja no tiene saldo suficiente (disponible: $${fmt(origen.saldoEfectivo)})` }, { status: 400 })

    await db.insert(transacciones).values({ tid, monto, socioId, descripcion: 'Retiro QR MediaPago' })
    await db.insert(movimientosCaja).values({
      cajaId: origen.id,
      tipo: 'egreso',
      monto,
      concepto: `Retiro QR MediaPago${socioId ? ` — socio #${socioId}` : ''}`,
      saldoPosterior: cajaAct.saldoEfectivo,
    })

    return NextResponse.json({ ok: true, dataUrl, tid, payload, saldoEfectivo: cajaAct.saldoEfectivo })
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
