'use client'

import { useCallback, useEffect, useState } from 'react'
import ExportButtons from '@/components/ExportButtons'

// ── Tipos (espejo de /api/inversiones) ──────────────────────────────────────

type TipoInv = 'divisa' | 'plazo_fijo' | 'fci' | 'accion'

interface CotDivisa { compra: number; venta: number; nombre: string; actualizado: string | null }
interface CotActivo { symbol: string; nombre: string; precio: number; pctChange: number }
interface CotFci { id: string; nombre: string; perfil: string; valorCuota: number; rendAnual: number }
interface Cotizaciones {
  divisas: Record<string, CotDivisa>
  pfTna: number
  acciones: CotActivo[]
  cedears: CotActivo[]
  fci: CotFci[]
  actualizado: string
}
interface Posicion {
  id: number
  tipo: TipoInv
  activo: string
  nombre: string
  cantidad: number
  precioUnitario: number
  montoInvertido: number
  tna: number | null
  fechaVencimiento: string | null
  montoFinal: number | null
  estado: 'abierta' | 'cerrada'
  resultado: number | null
  montoRescatado: number | null
  createdAt: string
  closedAt: string | null
  valorActual: number
  resultadoNoRealizado: number
  vencido: boolean
}
interface Data {
  cuenta: { id: number; saldo: number }
  cotizaciones: Cotizaciones
  posiciones: Posicion[]
  cerradas: Posicion[]
  resumen: { totalInvertido: number; valorActual: number; resultado: number }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtNum(n: number, dec = 4) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: dec })
}
function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}
function fmtHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const TIPOS: { k: TipoInv; label: string; icon: string }[] = [
  { k: 'divisa', label: 'Divisas', icon: '💵' },
  { k: 'plazo_fijo', label: 'Plazo fijo', icon: '🔒' },
  { k: 'fci', label: 'Fondos (FCI)', icon: '📊' },
  { k: 'accion', label: 'Acciones / CEDEARs', icon: '📈' },
]
const PLAZOS = [30, 60, 90, 180]
const TIPO_LABEL: Record<TipoInv, string> = {
  divisa: 'Divisa', plazo_fijo: 'Plazo fijo', fci: 'Fondo', accion: 'Acción/CEDEAR',
}

// ── Componente ──────────────────────────────────────────────────────────────

export default function Inversiones() {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // formulario
  const [tipo, setTipo] = useState<TipoInv>('divisa')
  const [divisa, setDivisa] = useState('USD')
  const [plazoDias, setPlazoDias] = useState(30)
  const [fciId, setFciId] = useState('fci_mm')
  const [accionSym, setAccionSym] = useState('')
  const [monto, setMonto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/inversiones')
    const j = await res.json()
    if (!res.ok) { setMsg({ tipo: 'error', texto: j.error ?? 'Error al cargar' }); setLoading(false); return }
    setData(j)
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  // Preseleccionar el primer activo disponible para el selector de acciones
  useEffect(() => {
    if (accionSym || !data) return
    const first = [...data.cotizaciones.acciones, ...data.cotizaciones.cedears][0]
    if (first) setAccionSym(first.symbol)
  }, [data, accionSym])

  const cot = data?.cotizaciones
  const montoNum = parseFloat(monto) || 0

  // precio unitario del instrumento elegido (para la vista previa)
  let precioUnit = 0
  let unidadLabel = 'unidades'
  if (cot) {
    if (tipo === 'divisa') { precioUnit = cot.divisas[divisa]?.venta ?? 0; unidadLabel = divisa }
    else if (tipo === 'fci') { precioUnit = cot.fci.find(f => f.id === fciId)?.valorCuota ?? 0; unidadLabel = 'cuotapartes' }
    else if (tipo === 'accion') { precioUnit = [...cot.acciones, ...cot.cedears].find(a => a.symbol === accionSym)?.precio ?? 0; unidadLabel = 'nominales' }
  }
  const cantidadPreview = precioUnit > 0 ? montoNum / precioUnit : 0
  const pfProyeccion = cot && tipo === 'plazo_fijo'
    ? montoNum * (1 + cot.pfTna * (plazoDias / 365))
    : 0

  async function invertir(e: React.FormEvent) {
    e.preventDefault()
    if (montoNum <= 0) { setMsg({ tipo: 'error', texto: 'Ingresá un monto válido' }); return }
    setEnviando(true); setMsg(null)
    const payload: Record<string, unknown> = { action: 'invertir', tipo, montoARS: montoNum }
    if (tipo === 'divisa') payload.activo = divisa
    else if (tipo === 'fci') payload.activo = fciId
    else if (tipo === 'accion') payload.activo = accionSym
    else if (tipo === 'plazo_fijo') { payload.activo = 'PF'; payload.plazoDias = plazoDias }

    const res = await fetch('/api/inversiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const j = await res.json()
    if (res.ok) {
      setMsg({ tipo: 'ok', texto: 'Inversión realizada.' })
      setMonto('')
      cargar()
    } else {
      setMsg({ tipo: 'error', texto: j.error ?? 'No se pudo invertir' })
    }
    setEnviando(false)
  }

  async function rescatar(inv: Posicion) {
    const aviso = inv.tipo === 'plazo_fijo' && !inv.vencido
      ? '¿Rescatar el plazo fijo ANTES del vencimiento? Se devuelve solo el capital, sin intereses.'
      : `¿Rescatar "${inv.nombre}"? Se acreditará el valor actual en tu cuenta.`
    if (!confirm(aviso)) return
    setMsg(null)
    const res = await fetch('/api/inversiones', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'rescatar', inversionId: inv.id }),
    })
    const j = await res.json()
    if (res.ok) {
      const s = j.resultado >= 0 ? '+' : '−'
      setMsg({ tipo: 'ok', texto: `Rescatado. Resultado: ${s}$${fmt(Math.abs(j.resultado))}. Nuevo saldo: $${fmt(j.nuevoSaldo)}` })
      cargar()
    } else {
      setMsg({ tipo: 'error', texto: j.error ?? 'No se pudo rescatar' })
    }
  }

  if (loading) return <p className="text-gray-400 text-sm">Cargando inversiones…</p>
  if (!data) return <p className="text-red-500 text-sm">{msg?.texto ?? 'No se pudo cargar'}</p>

  const { resumen, posiciones, cerradas } = data
  const resColor = resumen.resultado >= 0 ? 'text-green-600' : 'text-red-600'

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm flex justify-between ${
          msg.tipo === 'error' ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'
        }`}>
          {msg.texto}
          <button onClick={() => setMsg(null)} className="opacity-50 hover:opacity-100 ml-4">✕</button>
        </div>
      )}

      {/* Resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Saldo disponible" value={`$${fmt(data.cuenta.saldo)}`} />
        <Stat label="Invertido" value={`$${fmt(resumen.totalInvertido)}`} />
        <Stat label="Valor actual" value={`$${fmt(resumen.valorActual)}`} />
        <Stat label="Resultado" value={`${resumen.resultado >= 0 ? '+' : '−'}$${fmt(Math.abs(resumen.resultado))}`} valueClass={resColor} />
      </div>

      {/* Nueva inversión */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Nueva inversión</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          {TIPOS.map(t => (
            <button key={t.k} type="button" onClick={() => setTipo(t.k)}
              className={`flex flex-col items-center gap-1 border rounded-xl px-2 py-3 text-xs font-medium transition-colors ${
                tipo === t.k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              <span className="text-xl">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        <form onSubmit={invertir} className="space-y-4">
          {/* Selector según tipo */}
          {tipo === 'divisa' && cot && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(cot.divisas).map(([k, d]) => (
                <label key={k} className={`border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                  divisa === k ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="radio" className="hidden" checked={divisa === k} onChange={() => setDivisa(k)} />
                  <span className="font-semibold text-gray-800">{k}</span>
                  <span className="block text-xs text-gray-500">compra a ${fmt(d.venta)}</span>
                </label>
              ))}
            </div>
          )}

          {tipo === 'plazo_fijo' && cot && (
            <div>
              <div className="flex gap-2 flex-wrap">
                {PLAZOS.map(p => (
                  <button key={p} type="button" onClick={() => setPlazoDias(p)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      plazoDias === p ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-600 hover:border-blue-400'
                    }`}>
                    {p} días
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                TNA {(cot.pfTna * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}% ·
                a {plazoDias} días rinde {((cot.pfTna * plazoDias / 365) * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%
              </p>
            </div>
          )}

          {tipo === 'fci' && cot && (
            <div className="space-y-2">
              {cot.fci.map(f => (
                <label key={f.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                  fciId === f.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <span className="flex items-center gap-2">
                    <input type="radio" className="hidden" checked={fciId === f.id} onChange={() => setFciId(f.id)} />
                    <span>
                      <span className="font-medium text-gray-800">{f.nombre}</span>
                      <span className="block text-xs text-gray-400">{f.perfil} · rend. estimado {(f.rendAnual * 100).toLocaleString('es-AR', { maximumFractionDigits: 1 })}%/año</span>
                    </span>
                  </span>
                  <span className="text-xs font-mono text-gray-600">${fmt(f.valorCuota)}</span>
                </label>
              ))}
            </div>
          )}

          {tipo === 'accion' && cot && (
            <select value={accionSym} onChange={e => setAccionSym(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <optgroup label="Acciones argentinas">
                {cot.acciones.map(a => (
                  <option key={a.symbol} value={a.symbol}>{a.nombre} ({a.symbol}) — ${fmt(a.precio)} ({fmtPct(a.pctChange)})</option>
                ))}
              </optgroup>
              <optgroup label="CEDEARs">
                {cot.cedears.map(a => (
                  <option key={a.symbol} value={a.symbol}>{a.nombre} ({a.symbol}) — ${fmt(a.precio)} ({fmtPct(a.pctChange)})</option>
                ))}
              </optgroup>
            </select>
          )}

          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Monto a invertir ($)</label>
            <div className="flex gap-2">
              <input type="number" min="0.01" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} required
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00" />
              <button type="button" onClick={() => setMonto(String(data.cuenta.saldo))}
                className="text-xs border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                Usar todo
              </button>
            </div>
            {montoNum > 0 && (
              <p className="text-xs text-gray-500 mt-1.5">
                {tipo === 'plazo_fijo'
                  ? <>Al vencimiento cobrás <strong>${fmt(pfProyeccion)}</strong> (interés ${fmt(pfProyeccion - montoNum)})</>
                  : precioUnit > 0
                    ? <>Comprás <strong>{fmtNum(cantidadPreview)}</strong> {unidadLabel} a ${fmt(precioUnit)} c/u</>
                    : <span className="text-red-500">Sin cotización disponible para este activo</span>}
              </p>
            )}
            {montoNum > data.cuenta.saldo && (
              <p className="text-xs text-red-500 mt-1">Supera tu saldo disponible (${fmt(data.cuenta.saldo)})</p>
            )}
          </div>

          <button type="submit" disabled={enviando || montoNum <= 0 || montoNum > data.cuenta.saldo}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
            {enviando ? 'Procesando…' : 'Confirmar inversión'}
          </button>
        </form>

        {cot && (
          <p className="text-[11px] text-gray-400 mt-3">
            Cotizaciones reales · actualizado {fmtHora(cot.actualizado)}
          </p>
        )}
      </div>

      {/* Posiciones abiertas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-gray-800">Mis inversiones ({posiciones.length})</p>
          <ExportButtons
            filenameBase="mis_inversiones"
            titulo="Mis inversiones"
            sections={[
              {
                name: 'Abiertas',
                columns: [
                  { header: 'Tipo', value: (p: Posicion) => TIPO_LABEL[p.tipo] },
                  { header: 'Instrumento', value: (p: Posicion) => p.nombre },
                  { header: 'Fecha', value: (p: Posicion) => fmtHora(p.createdAt) },
                  { header: 'Invertido', value: (p: Posicion) => p.montoInvertido, moneda: true },
                  { header: 'Valor actual', value: (p: Posicion) => p.valorActual, moneda: true },
                  { header: 'Resultado', value: (p: Posicion) => p.resultadoNoRealizado, moneda: true },
                ],
                rows: posiciones,
              },
              {
                name: 'Cerradas',
                columns: [
                  { header: 'Tipo', value: (p: Posicion) => TIPO_LABEL[p.tipo] },
                  { header: 'Instrumento', value: (p: Posicion) => p.nombre },
                  { header: 'Invertido', value: (p: Posicion) => p.montoInvertido, moneda: true },
                  { header: 'Rescatado', value: (p: Posicion) => p.montoRescatado ?? 0, moneda: true },
                  { header: 'Resultado', value: (p: Posicion) => p.resultado ?? 0, moneda: true },
                ],
                rows: cerradas,
              },
            ]}
          />
        </div>
        {posiciones.length === 0 ? (
          <p className="p-6 text-center text-gray-400 text-sm">No tenés inversiones abiertas.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {posiciones.map(p => {
              const res = p.resultadoNoRealizado
              const resCol = res >= 0 ? 'text-green-600' : 'text-red-600'
              const pct = p.montoInvertido > 0 ? (res / p.montoInvertido) * 100 : 0
              return (
                <li key={p.id} className="px-5 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{p.nombre}</p>
                      <p className="text-xs text-gray-400">
                        {TIPO_LABEL[p.tipo]}
                        {p.tipo !== 'plazo_fijo' && <> · {fmtNum(p.cantidad)} {p.tipo === 'divisa' ? p.activo : p.tipo === 'fci' ? 'cuotap.' : 'nom.'} @ ${fmt(p.precioUnitario)}</>}
                        {p.tipo === 'plazo_fijo' && p.fechaVencimiento && <> · vence {p.fechaVencimiento}{p.vencido ? ' · DISPONIBLE' : ''}</>}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-mono text-gray-900">${fmt(p.valorActual)}</p>
                      <p className={`text-xs font-mono ${resCol}`}>
                        {res >= 0 ? '+' : '−'}${fmt(Math.abs(res))} ({fmtPct(pct)})
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">Invertido: ${fmt(p.montoInvertido)}</span>
                    <button onClick={() => rescatar(p)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-lg px-3 py-1 hover:bg-blue-50 transition-colors">
                      {p.tipo === 'plazo_fijo' && p.vencido ? 'Cobrar' : 'Rescatar'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* Historial cerradas */}
      {cerradas.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Inversiones cerradas</p>
          </div>
          <ul className="divide-y divide-gray-50">
            {cerradas.map(p => {
              const r = p.resultado ?? 0
              return (
                <li key={p.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                  <span className="text-gray-700 truncate">{p.nombre}</span>
                  <span className={`font-mono text-xs ${r >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {r >= 0 ? '+' : '−'}${fmt(Math.abs(r))}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-base font-bold ${valueClass ?? 'text-gray-900'}`}>{value}</p>
    </div>
  )
}
