// Cotizaciones reales para el simulador de inversiones del homebanking.
// Se consumen APIs públicas argentinas (sin API key) con caché de 5 minutos.
// Si alguna falla, se usa un valor de reserva para que la pantalla no se rompa.
// Solo debe importarse desde el servidor (route handlers).

const REVALIDATE = 300 // segundos

// ── Divisas (dolarapi.com) ──────────────────────────────────────────────────

export type Divisa = 'USD' | 'EUR' | 'BRL'
export interface CotDivisa { compra: number; venta: number; nombre: string; actualizado: string | null }

const DIVISA_FALLBACK: Record<Divisa, CotDivisa> = {
  USD: { compra: 1480, venta: 1530, nombre: 'Dólar', actualizado: null },
  EUR: { compra: 1740, venta: 1770, nombre: 'Euro', actualizado: null },
  BRL: { compra: 250, venta: 265, nombre: 'Real', actualizado: null },
}

async function fetchDivisas(): Promise<Record<Divisa, CotDivisa>> {
  const out: Record<Divisa, CotDivisa> = {
    USD: { ...DIVISA_FALLBACK.USD },
    EUR: { ...DIVISA_FALLBACK.EUR },
    BRL: { ...DIVISA_FALLBACK.BRL },
  }
  try {
    const r = await fetch('https://dolarapi.com/v1/dolares', { next: { revalidate: REVALIDATE } })
    if (r.ok) {
      const arr = (await r.json()) as { casa: string; compra: number; venta: number; fechaActualizacion: string }[]
      const blue = arr.find(x => x.casa === 'blue') ?? arr.find(x => x.casa === 'oficial')
      if (blue) out.USD = { compra: blue.compra, venta: blue.venta, nombre: 'Dólar', actualizado: blue.fechaActualizacion }
    }
  } catch { /* fallback */ }

  for (const d of ['eur', 'brl'] as const) {
    try {
      const r = await fetch(`https://dolarapi.com/v1/cotizaciones/${d}`, { next: { revalidate: REVALIDATE } })
      if (r.ok) {
        const j = (await r.json()) as { compra: number; venta: number; fechaActualizacion: string }
        const key = d.toUpperCase() as Divisa
        out[key] = { compra: j.compra, venta: j.venta, nombre: out[key].nombre, actualizado: j.fechaActualizacion }
      }
    } catch { /* fallback */ }
  }
  return out
}

// ── Plazo fijo (api.argentinadatos.com) ─────────────────────────────────────

const PF_TNA_FALLBACK = 0.30

async function fetchPfTna(): Promise<number> {
  try {
    const r = await fetch('https://api.argentinadatos.com/v1/finanzas/tasas/plazoFijo', {
      next: { revalidate: REVALIDATE },
    })
    if (r.ok) {
      const arr = (await r.json()) as { tnaClientes: number }[]
      const tasas = arr.map(x => x.tnaClientes).filter(t => t > 0.01 && t < 2)
      if (tasas.length) {
        tasas.sort((a, b) => a - b)
        // mediana, para no sesgar por outliers
        return tasas[Math.floor(tasas.length / 2)]
      }
    }
  } catch { /* fallback */ }
  return PF_TNA_FALLBACK
}

// ── Acciones y CEDEARs (data912.com) ────────────────────────────────────────

export interface CotActivo { symbol: string; nombre: string; precio: number; pctChange: number }

const ACCIONES_WL: Record<string, string> = {
  GGAL: 'Grupo Galicia', YPFD: 'YPF', PAMP: 'Pampa Energía', ALUA: 'Aluar',
  BMA: 'Banco Macro', TXAR: 'Ternium Arg.', CEPU: 'Central Puerto', TGSU2: 'Transp. Gas del Sur',
  LOMA: 'Loma Negra', CRES: 'Cresud', BBAR: 'BBVA Arg.', MIRG: 'Mirgor',
}
const CEDEARS_WL: Record<string, string> = {
  AAPL: 'Apple', MSFT: 'Microsoft', TSLA: 'Tesla', AMZN: 'Amazon', GOOGL: 'Alphabet',
  KO: 'Coca-Cola', MELI: 'MercadoLibre', NVDA: 'NVIDIA', MCD: "McDonald's", DISN: 'Disney',
}

type Data912Row = { symbol: string; c: number; px_bid: number; px_ask: number; pct_change: number }

async function fetchActivos(url: string, wl: Record<string, string>): Promise<CotActivo[]> {
  try {
    const r = await fetch(url, { next: { revalidate: REVALIDATE } })
    if (!r.ok) return []
    const arr = (await r.json()) as Data912Row[]
    const bySym = new Map(arr.map(x => [x.symbol, x]))
    const out: CotActivo[] = []
    for (const [sym, nombre] of Object.entries(wl)) {
      const row = bySym.get(sym)
      if (!row) continue
      const precio = row.c > 0 ? row.c : (row.px_bid > 0 && row.px_ask > 0 ? (row.px_bid + row.px_ask) / 2 : 0)
      if (precio > 0) out.push({ symbol: sym, nombre, precio, pctChange: row.pct_change ?? 0 })
    }
    return out
  } catch {
    return []
  }
}

// ── Fondos comunes (simulados, deterministas) ───────────────────────────────

export interface CotFci { id: string; nombre: string; perfil: string; valorCuota: number; rendAnual: number }

const FCI_EPOCH = Date.UTC(2026, 0, 1)

function fciValorCuota(base: number, rendAnual: number, amplitud: number, periodoDias: number): number {
  const t = (Date.now() - FCI_EPOCH) / 86_400_000 // días desde epoch
  const tendencia = rendAnual * (t / 365)
  const onda = amplitud * Math.sin((2 * Math.PI * t) / periodoDias)
  return Math.round(base * (1 + tendencia + onda) * 100) / 100
}

function buildFci(pfTna: number): CotFci[] {
  return [
    { id: 'fci_mm', nombre: 'FCI Ahorro (Money Market)', perfil: 'Conservador', rendAnual: pfTna * 0.9, valorCuota: fciValorCuota(1000, pfTna * 0.9, 0, 30) },
    { id: 'fci_rf', nombre: 'FCI Renta Fija', perfil: 'Moderado', rendAnual: pfTna * 1.15, valorCuota: fciValorCuota(1000, pfTna * 1.15, 0.015, 45) },
    { id: 'fci_rv', nombre: 'FCI Renta Variable', perfil: 'Agresivo', rendAnual: pfTna * 1.8, valorCuota: fciValorCuota(1000, pfTna * 1.8, 0.06, 60) },
  ]
}

// ── Agregado ────────────────────────────────────────────────────────────────

export interface Cotizaciones {
  divisas: Record<Divisa, CotDivisa>
  pfTna: number
  acciones: CotActivo[]
  cedears: CotActivo[]
  fci: CotFci[]
  actualizado: string
}

export async function getCotizaciones(): Promise<Cotizaciones> {
  const [divisas, pfTna, acciones, cedears] = await Promise.all([
    fetchDivisas(),
    fetchPfTna(),
    fetchActivos('https://data912.com/live/arg_stocks', ACCIONES_WL),
    fetchActivos('https://data912.com/live/arg_cedears', CEDEARS_WL),
  ])
  return { divisas, pfTna, acciones, cedears, fci: buildFci(pfTna), actualizado: new Date().toISOString() }
}

export function fciActualById(id: string, pfTna: number): CotFci | undefined {
  return buildFci(pfTna).find(f => f.id === id)
}
