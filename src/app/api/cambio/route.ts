import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { operacionesCambio, reservasDivisas, config, socios, caja, movimientosCaja } from '@/lib/schema'
import { and, desc, eq, isNull } from 'drizzle-orm'
import { randomBytes } from 'crypto'

// ── Divisas soportadas ────────────────────────────────────────────────────────

export const DIVISAS = ['USD', 'EUR', 'UYU', 'BRL'] as const
type Divisa = typeof DIVISAS[number]

const TC_DEFAULTS: Record<Divisa, { compra: number; venta: number }> = {
  USD: { compra: 900,  venta: 960  },
  EUR: { compra: 980,  venta: 1050 },
  UYU: { compra: 22,   venta: 25   },
  BRL: { compra: 175,  venta: 190  },
}

async function getTasas(): Promise<Record<string, { compra: number; venta: number }>> {
  const rows = await db.select().from(config)
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value

  const result: Record<string, { compra: number; venta: number }> = {}
  for (const d of DIVISAS) {
    result[d] = {
      compra: map[`tc_${d}_compra`] ? parseFloat(map[`tc_${d}_compra`]) : TC_DEFAULTS[d].compra,
      venta:  map[`tc_${d}_venta`]  ? parseFloat(map[`tc_${d}_venta`])  : TC_DEFAULTS[d].venta,
    }
  }
  return result
}

async function getReservas(): Promise<Record<string, number>> {
  const rows = await db.select().from(reservasDivisas)
  const map: Record<string, number> = {}
  for (const d of DIVISAS) map[d] = 0
  for (const r of rows) map[r.divisa] = r.monto
  return map
}

async function getBoveda() {
  const rows = await db.select().from(caja)
    .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
    .orderBy(desc(caja.id)).limit(1)
  return rows[0] ?? null
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [tasas, reservas, historialRows, sociosRows] = await Promise.all([
    getTasas(),
    getReservas(),
    db.select({
      id: operacionesCambio.id,
      operacion: operacionesCambio.operacion,
      divisa: operacionesCambio.divisa,
      monto: operacionesCambio.monto,
      tasaCambio: operacionesCambio.tasaCambio,
      montoARS: operacionesCambio.montoARS,
      tid: operacionesCambio.tid,
      createdAt: operacionesCambio.createdAt,
      socioNombre: socios.nombre,
      socioApellido: socios.apellido,
    })
    .from(operacionesCambio)
    .leftJoin(socios, eq(operacionesCambio.socioId, socios.id))
    .orderBy(desc(operacionesCambio.id))
    .limit(50),
    db.select({ id: socios.id, nombre: socios.nombre, apellido: socios.apellido, numeroSocio: socios.numeroSocio })
      .from(socios).orderBy(socios.apellido),
  ])

  return NextResponse.json({ tasas, reservas, historial: historialRows, socios: sociosRows })
}

// ── POST — registrar operación ────────────────────────────────────────────────

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { operacion, divisa, monto, socioId } = await req.json()

  if (!operacion || !divisa || !monto || monto <= 0)
    return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })
  if (!DIVISAS.includes(divisa))
    return NextResponse.json({ error: 'Divisa no soportada' }, { status: 400 })
  if (!['compra', 'venta'].includes(operacion))
    return NextResponse.json({ error: 'Operación inválida' }, { status: 400 })

  const tasas = await getTasas()
  const reservas = await getReservas()
  const tasa = operacion === 'compra' ? tasas[divisa].compra : tasas[divisa].venta
  const montoARS = Math.round(monto * tasa * 100) / 100

  // Venta: verificar que haya reservas suficientes
  if (operacion === 'venta' && reservas[divisa] < monto)
    return NextResponse.json({ error: `Reservas insuficientes de ${divisa} (disponible: ${reservas[divisa].toLocaleString('es-AR', { maximumFractionDigits: 2 })})` }, { status: 400 })

  const tid = randomBytes(8).toString('hex').toUpperCase()

  // Actualizar reservas
  const nuevaReserva = operacion === 'compra'
    ? Math.round((reservas[divisa] + monto) * 10000) / 10000
    : Math.round((reservas[divisa] - monto) * 10000) / 10000

  const existeReserva = await db.select({ d: reservasDivisas.divisa })
    .from(reservasDivisas).where(eq(reservasDivisas.divisa, divisa)).limit(1)

  if (existeReserva.length > 0) {
    await db.update(reservasDivisas).set({ monto: nuevaReserva }).where(eq(reservasDivisas.divisa, divisa))
  } else {
    await db.insert(reservasDivisas).values({ divisa, monto: nuevaReserva })
  }

  // Impactar en bóveda si está abierta
  // compra → banco paga ARS → egreso de bóveda
  // venta  → banco cobra ARS → ingreso a bóveda
  const boveda = await getBoveda()
  if (boveda?.id) {
    if (operacion === 'compra') {
      const nuevoSaldo = Math.max(0, Math.round((boveda.saldoEfectivo - montoARS) * 100) / 100)
      await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, boveda.id))
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id, tipo: 'egreso',
        monto: montoARS, concepto: `Compra ${monto} ${divisa} a $${tasa}`,
        saldoPosterior: nuevoSaldo,
      })
    } else {
      const nuevoSaldo = Math.round((boveda.saldoEfectivo + montoARS) * 100) / 100
      await db.update(caja).set({ saldoEfectivo: nuevoSaldo }).where(eq(caja.id, boveda.id))
      await db.insert(movimientosCaja).values({
        cajaId: boveda.id, tipo: 'ingreso',
        monto: montoARS, concepto: `Venta ${monto} ${divisa} a $${tasa}`,
        saldoPosterior: nuevoSaldo,
      })
    }
  }

  const [op] = await db.insert(operacionesCambio).values({
    socioId: socioId ? parseInt(socioId) : null,
    operacion,
    divisa,
    monto,
    tasaCambio: tasa,
    montoARS,
    tid,
  }).returning()

  return NextResponse.json({ ...op, reservaNueva: nuevaReserva }, { status: 201 })
}

// ── PATCH — actualizar cotizaciones (admin) ───────────────────────────────────

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Solo admin' }, { status: 403 })

  const { divisa, compra, venta } = await req.json()
  if (!divisa || !DIVISAS.includes(divisa))
    return NextResponse.json({ error: 'Divisa inválida' }, { status: 400 })
  if (compra <= 0 || venta <= 0 || compra >= venta)
    return NextResponse.json({ error: 'La tasa de compra debe ser menor a la de venta' }, { status: 400 })

  await db.insert(config).values({ key: `tc_${divisa}_compra`, value: String(compra) })
    .onConflictDoUpdate({ target: config.key, set: { value: String(compra) } })
  await db.insert(config).values({ key: `tc_${divisa}_venta`, value: String(venta) })
    .onConflictDoUpdate({ target: config.key, set: { value: String(venta) } })

  return NextResponse.json({ ok: true, divisa, compra, venta })
}
