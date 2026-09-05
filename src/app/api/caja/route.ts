import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { caja, movimientosCaja } from '@/lib/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getCajaDeUsuario(userId: string) {
  const rows = await db.select().from(caja)
    .where(and(eq(caja.userId, userId), eq(caja.estado, 'abierta')))
    .orderBy(desc(caja.id)).limit(1)
  return rows[0] ?? null
}

async function getBoveda() {
  const rows = await db.select().from(caja)
    .where(isNull(caja.userId))
    .orderBy(desc(caja.id)).limit(1)
  return rows[0] ?? { id: null, saldoEfectivo: 0, estado: 'cerrada' as const, userId: null, numeroCaja: null, fechaApertura: null, fechaCierre: null }
}

async function registrarMovimiento(cajaId: number, tipo: string, monto: number, concepto: string, saldoPosterior: number) {
  await db.insert(movimientosCaja).values({ cajaId, tipo: tipo as never, monto, concepto, saldoPosterior })
}

// ── GET ───────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = session.user?.role
  const userId = session.user?.id
  const { searchParams } = new URL(req.url)
  const withMovimientos = searchParams.get('movimientos') === '1'

  // Admin ve bóveda + todas las ventanillas abiertas
  if (role === 'admin') {
    const boveda = await getBoveda()
    const ventanillas = await db.select().from(caja)
      .where(and(eq(caja.estado, 'abierta')))
      .orderBy(caja.numeroCaja)
    const todasAbiertas = ventanillas.filter(v => v.userId !== null)
    const totalGeneral = todasAbiertas.reduce((a, v) => a + v.saldoEfectivo, 0) + (boveda.estado === 'abierta' ? boveda.saldoEfectivo : 0)

    let movimientos: (typeof movimientosCaja.$inferSelect)[] = []
    if (withMovimientos && boveda.id) {
      movimientos = await db.select().from(movimientosCaja)
        .where(eq(movimientosCaja.cajaId, boveda.id))
        .orderBy(desc(movimientosCaja.id)).limit(100)
    }

    return NextResponse.json({ boveda, ventanillas: todasAbiertas, totalGeneral, movimientos })
  }

  // Cajero ve solo su propia caja
  if (role === 'cajero' && userId) {
    const miCaja = await getCajaDeUsuario(userId)
    let movimientos: unknown[] = []
    if (withMovimientos && miCaja?.id) {
      movimientos = await db.select().from(movimientosCaja)
        .where(eq(movimientosCaja.cajaId, miCaja.id))
        .orderBy(desc(movimientosCaja.id)).limit(100)
    }
    return NextResponse.json({ caja: miCaja, movimientos })
  }

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
}

// ── POST ──────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json()
  const { accion, monto, concepto, tipo, cajaId: targetCajaId } = body
  const role = session.user?.role
  const userId = session.user?.id!

  // ── Bóveda: abrir (solo admin) ────────────────────────────────────────────
  if (accion === 'abrir_boveda') {
    if (role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
    const boveda = await getBoveda()
    if (boveda.estado === 'abierta') return NextResponse.json({ error: 'La bóveda ya está abierta' }, { status: 400 })
    const saldo = Math.max(0, monto ?? 0)
    const [nueva] = await db.insert(caja).values({
      userId: null, numeroCaja: null, saldoEfectivo: saldo,
      estado: 'abierta', fechaApertura: new Date().toISOString(),
    }).returning()
    await registrarMovimiento(nueva.id, 'apertura', saldo, 'Apertura de bóveda', saldo)
    return NextResponse.json(nueva)
  }

  // ── Bóveda: cerrar (solo admin) ───────────────────────────────────────────
  if (accion === 'cerrar_boveda') {
    if (role !== 'admin') return NextResponse.json({ error: 'Solo admin' }, { status: 403 })
    const boveda = await getBoveda()
    if (!boveda.id || boveda.estado === 'cerrada') return NextResponse.json({ error: 'La bóveda no está abierta' }, { status: 400 })
    const [updated] = await db.update(caja)
      .set({ estado: 'cerrada', fechaCierre: new Date().toISOString() })
      .where(eq(caja.id, boveda.id!)).returning()
    await registrarMovimiento(boveda.id!, 'cierre', boveda.saldoEfectivo, 'Cierre de bóveda', boveda.saldoEfectivo)
    return NextResponse.json(updated)
  }

  // ── Cajero: abrir su ventanilla ───────────────────────────────────────────
  if (accion === 'abrir') {
    const existente = await getCajaDeUsuario(userId)
    if (existente) return NextResponse.json({ error: 'Ya tenés una ventanilla abierta' }, { status: 400 })

    const fondoInicial = Math.max(0, monto ?? 0)

    // Descontar de la bóveda si tiene saldo
    const boveda = await getBoveda()
    if (boveda.estado === 'abierta' && boveda.id && fondoInicial > 0) {
      if (boveda.saldoEfectivo < fondoInicial)
        return NextResponse.json({ error: `La bóveda no tiene saldo suficiente (tiene $${boveda.saldoEfectivo.toLocaleString('es-AR')})` }, { status: 400 })
      const nuevoSaldoBoveda = Math.round((boveda.saldoEfectivo - fondoInicial) * 100) / 100
      await db.update(caja).set({ saldoEfectivo: nuevoSaldoBoveda }).where(eq(caja.id, boveda.id!))
      await registrarMovimiento(boveda.id!, 'transferencia_salida', fondoInicial, `Fondo apertura ventanilla ${session.user?.name}`, nuevoSaldoBoveda)
    }

    // Buscar el próximo número de ventanilla
    const todasCajas = await db.select({ n: caja.numeroCaja }).from(caja).where(eq(caja.estado, 'abierta'))
    const numerosUsados = todasCajas.map(c => c.n ?? 0).filter(Boolean)
    let numeroCaja = 1
    while (numerosUsados.includes(numeroCaja)) numeroCaja++

    const [nueva] = await db.insert(caja).values({
      userId, numeroCaja, saldoEfectivo: fondoInicial,
      estado: 'abierta', fechaApertura: new Date().toISOString(),
    }).returning()
    await registrarMovimiento(nueva.id, 'apertura', fondoInicial, `Apertura ventanilla ${numeroCaja}`, fondoInicial)
    return NextResponse.json(nueva)
  }

  // ── Cajero: cerrar su ventanilla ──────────────────────────────────────────
  if (accion === 'cerrar') {
    const miCaja = role === 'admin' && targetCajaId
      ? await db.select().from(caja).where(eq(caja.id, targetCajaId)).limit(1).then(r => r[0])
      : await getCajaDeUsuario(userId)

    if (!miCaja || miCaja.estado === 'cerrada') return NextResponse.json({ error: 'La ventanilla no está abierta' }, { status: 400 })

    const saldoRestante = miCaja.saldoEfectivo
    const [updated] = await db.update(caja)
      .set({ estado: 'cerrada', fechaCierre: new Date().toISOString() })
      .where(eq(caja.id, miCaja.id)).returning()
    await registrarMovimiento(miCaja.id, 'cierre', saldoRestante, `Cierre ventanilla ${miCaja.numeroCaja ?? ''}`, saldoRestante)

    // Reintegrar a la bóveda
    const boveda = await getBoveda()
    if (boveda.estado === 'abierta' && boveda.id && saldoRestante > 0) {
      const nuevoSaldoBoveda = Math.round((boveda.saldoEfectivo + saldoRestante) * 100) / 100
      await db.update(caja).set({ saldoEfectivo: nuevoSaldoBoveda }).where(eq(caja.id, boveda.id!))
      await registrarMovimiento(boveda.id!, 'transferencia_entrada', saldoRestante, `Reintegro cierre ventanilla ${miCaja.numeroCaja ?? ''}`, nuevoSaldoBoveda)
    }

    return NextResponse.json(updated)
  }

  // ── Movimiento en ventanilla ──────────────────────────────────────────────
  if (accion === 'movimiento') {
    const miCaja = await getCajaDeUsuario(userId)
    if (!miCaja) return NextResponse.json({ error: 'No tenés una ventanilla abierta' }, { status: 400 })

    const tipoFinal: 'ingreso' | 'egreso' = tipo === 'egreso' ? 'egreso' : 'ingreso'
    const m = Math.abs(monto)
    const nuevoSaldo = tipoFinal === 'ingreso'
      ? Math.round((miCaja.saldoEfectivo + m) * 100) / 100
      : Math.max(0, Math.round((miCaja.saldoEfectivo - m) * 100) / 100)
    await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, miCaja.id))
    await registrarMovimiento(miCaja.id, tipoFinal, m, concepto ?? tipoFinal, nuevoSaldo)
    return NextResponse.json({ saldoEfectivo: nuevoSaldo, estado: 'abierta' })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
