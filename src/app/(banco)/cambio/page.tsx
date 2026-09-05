'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Tasa { compra: number; venta: number }
interface Operacion {
  id: number; operacion: string; divisa: string; monto: number
  tasaCambio: number; montoARS: number; tid: string; createdAt: string
  socioNombre: string | null; socioApellido: string | null
}
interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }

type Divisa = 'USD' | 'EUR' | 'UYU' | 'BRL'
type Operac = 'compra' | 'venta'

// ── Constantes ────────────────────────────────────────────────────────────────

const DIVISAS: Divisa[] = ['USD', 'EUR', 'UYU', 'BRL']

const DIVISA_META: Record<Divisa, { flag: string; nombre: string }> = {
  USD: { flag: '🇺🇸', nombre: 'Dólar USD' },
  EUR: { flag: '🇪🇺', nombre: 'Euro EUR' },
  UYU: { flag: '🇺🇾', nombre: 'Peso uruguayo' },
  BRL: { flag: '🇧🇷', nombre: 'Real brasileño' },
}

function fmt(n: number, dec = 2) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function CambioPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role

  const [tasas, setTasas] = useState<Record<Divisa, Tasa>>({} as Record<Divisa, Tasa>)
  const [reservas, setReservas] = useState<Record<Divisa, number>>({} as Record<Divisa, number>)
  const [historial, setHistorial] = useState<Operacion[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [loading, setLoading] = useState(true)

  // Formulario
  const [divisa, setDivisa] = useState<Divisa>('USD')
  const [operacion, setOperacion] = useState<Operac>('venta')  // desde el banco: venta = banco vende divisas al cliente
  const [monto, setMonto] = useState('')
  const [socioId, setSocioId] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState<{ divisa: string; monto: number; ars: number; tasa: number; operacion: Operac } | null>(null)

  // Edición de cotizaciones (admin)
  const [editando, setEditando] = useState<Divisa | null>(null)
  const [tcCompra, setTcCompra] = useState('')
  const [tcVenta, setTcVenta] = useState('')
  const [guardando, setGuardando] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/cambio').then(x => x.json())
    setTasas(r.tasas ?? {})
    setReservas(r.reservas ?? {})
    setHistorial(r.historial ?? [])
    setSocios(r.socios ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const tasa = tasas[divisa] ? (operacion === 'venta' ? tasas[divisa].venta : tasas[divisa].compra) : 0
  const montoNum = parseFloat(monto) || 0
  const montoARS = Math.round(montoNum * tasa * 100) / 100

  async function handleOperar(e: React.FormEvent) {
    e.preventDefault()
    if (!monto || montoNum <= 0) { setError('Ingresá un monto válido'); return }
    setProcesando(true); setError('')
    const res = await fetch('/api/cambio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operacion, divisa, monto: montoNum, socioId: socioId || undefined }),
    })
    const data = await res.json()
    if (res.ok) {
      setExito({ divisa, monto: montoNum, ars: data.montoARS, tasa: data.tasaCambio, operacion })
      setMonto(''); setSocioId('')
      fetchData()
    } else {
      setError(data.error ?? 'Error al registrar')
    }
    setProcesando(false)
  }

  async function handleGuardarTC() {
    if (!editando) return
    const c = parseFloat(tcCompra), v = parseFloat(tcVenta)
    if (!c || !v) { return }
    setGuardando(true)
    const res = await fetch('/api/cambio', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ divisa: editando, compra: c, venta: v }),
    })
    if (res.ok) { setEditando(null); fetchData() }
    setGuardando(false)
  }

  function iniciarEdicion(d: Divisa) {
    setEditando(d)
    setTcCompra(String(tasas[d]?.compra ?? ''))
    setTcVenta(String(tasas[d]?.venta ?? ''))
  }

  // Etiquetas desde la perspectiva del CLIENTE (más claro)
  const labelOp = operacion === 'venta'
    ? 'El cliente nos compra divisas (paga ARS)'
    : 'El cliente nos vende divisas (recibe ARS)'

  return (
    <div className="flex gap-6">
      {/* Panel izquierdo: formulario */}
      <div className="w-80 flex-shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Mesa de Cambio</h1>
          <p className="text-sm text-gray-500">Compra y venta de divisas</p>
        </div>

        {exito ? (
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center space-y-2">
            <div className="text-3xl mb-1">{DIVISA_META[exito.divisa as Divisa]?.flag}</div>
            <p className="text-sm font-semibold text-gray-700">
              {exito.operacion === 'venta' ? 'Venta a cliente' : 'Compra al cliente'} — {exito.divisa}
            </p>
            <p className="text-2xl font-bold font-mono text-gray-900">
              {fmt(exito.monto, 2)} {exito.divisa}
            </p>
            <p className="text-gray-500 text-sm">≡ <span className="font-semibold text-gray-700">${fmt(exito.ars)}</span> ARS</p>
            <p className="text-xs text-gray-400">Cotización: ${fmt(exito.tasa)}</p>
            <button onClick={() => setExito(null)}
              className="w-full mt-2 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
              Nueva operación
            </button>
          </div>
        ) : (
          <form onSubmit={handleOperar} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
            {/* Selección de divisa */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Divisa</p>
              <div className="grid grid-cols-2 gap-2">
                {DIVISAS.map(d => (
                  <label key={d} className={`flex items-center gap-2 border rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                    divisa === d ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="radio" className="hidden" checked={divisa === d} onChange={() => setDivisa(d)} />
                    <span className="text-lg">{DIVISA_META[d].flag}</span>
                    <div>
                      <p className={`text-xs font-semibold leading-tight ${divisa === d ? 'text-blue-700' : 'text-gray-700'}`}>{d}</p>
                      {tasas[d] && (
                        <p className="text-xs text-gray-400">${fmt(tasas[d].venta, 0)}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Compra / venta desde el banco */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Operación</p>
              <div className="flex gap-2">
                {(['venta', 'compra'] as Operac[]).map(op => (
                  <button key={op} type="button" onClick={() => setOperacion(op)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      operacion === op
                        ? op === 'venta' ? 'bg-green-600 text-white border-green-600' : 'bg-orange-500 text-white border-orange-500'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}>
                    {op === 'venta' ? 'Venta' : 'Compra'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-1">{labelOp}</p>
            </div>

            {/* Monto */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Monto en {divisa}
              </label>
              <input type="number" min="0.01" step="0.01" value={monto}
                onChange={e => setMonto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="0.00" />
              {montoNum > 0 && tasa > 0 && (
                <div className="mt-1 bg-gray-50 rounded-lg px-3 py-2 flex justify-between text-xs">
                  <span className="text-gray-500">@ ${fmt(tasa)}</span>
                  <span className="font-semibold text-gray-900 font-mono">${fmt(montoARS)} ARS</span>
                </div>
              )}
            </div>

            {/* Socio (opcional) */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Socio <span className="text-gray-400">(opcional)</span>
              </label>
              <select value={socioId} onChange={e => setSocioId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Sin identificar</option>
                {socios.map(s => (
                  <option key={s.id} value={s.id}>{s.apellido}, {s.nombre} — {s.numeroSocio}</option>
                ))}
              </select>
            </div>

            {/* Reserva disponible */}
            {operacion === 'venta' && reservas[divisa] !== undefined && (
              <div className={`text-xs rounded-lg px-3 py-2 ${
                reservas[divisa] < montoNum && montoNum > 0
                  ? 'bg-red-50 text-red-600'
                  : 'bg-gray-50 text-gray-500'
              }`}>
                Reserva disponible: <span className="font-mono font-semibold">{fmt(reservas[divisa], 2)} {divisa}</span>
              </div>
            )}

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <button type="submit" disabled={procesando || (operacion === 'venta' && montoNum > (reservas[divisa] ?? 0))}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {procesando ? 'Registrando...' : `Confirmar ${operacion === 'venta' ? 'venta' : 'compra'}`}
            </button>
          </form>
        )}
      </div>

      {/* Panel derecho */}
      <div className="flex-1 min-w-0 space-y-4">
        {/* Cotizaciones + Reservas */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Cotizaciones y reservas</p>
            <button onClick={fetchData} className="text-xs text-blue-600 hover:underline">Actualizar</button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 p-4">Cargando...</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Divisa</th>
                  <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Compra (banco paga)</th>
                  <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Venta (banco cobra)</th>
                  <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Reserva</th>
                  {role === 'admin' && <th className="px-5 py-2"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {DIVISAS.map(d => (
                  <tr key={d}>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2 font-medium text-gray-900">
                        <span className="text-lg">{DIVISA_META[d].flag}</span>
                        {d}
                      </span>
                    </td>
                    {editando === d ? (
                      <>
                        <td className="px-5 py-2">
                          <input type="number" value={tcCompra} onChange={e => setTcCompra(e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-5 py-2">
                          <input type="number" value={tcVenta} onChange={e => setTcVenta(e.target.value)}
                            className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-mono text-right focus:outline-none focus:ring-1 focus:ring-blue-500" />
                        </td>
                        <td className="px-5 py-2 text-right font-mono text-xs text-gray-500">
                          {fmt(reservas[d] ?? 0, 2)}
                        </td>
                        <td className="px-5 py-2 flex gap-1 justify-end">
                          <button onClick={handleGuardarTC} disabled={guardando}
                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 disabled:opacity-50">
                            Guardar
                          </button>
                          <button onClick={() => setEditando(null)}
                            className="text-xs text-gray-500 px-2 py-1 rounded hover:bg-gray-100">
                            Cancelar
                          </button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-5 py-3 text-right font-mono text-gray-700">${fmt(tasas[d]?.compra ?? 0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-700">${fmt(tasas[d]?.venta ?? 0)}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-600">
                          {fmt(reservas[d] ?? 0, 2)} {d}
                        </td>
                        {role === 'admin' && (
                          <td className="px-5 py-3 text-right">
                            <button onClick={() => iniciarEdicion(d)}
                              className="text-xs text-blue-600 hover:underline">Editar</button>
                          </td>
                        )}
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Historial */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-gray-700">Últimas operaciones</p>
            <p className="text-xs text-gray-400">{historial.length} registros</p>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 p-4">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 p-4 text-center">Sin operaciones registradas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Op.</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Divisa</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Monto</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">Cotización</th>
                    <th className="text-right px-4 py-2 text-xs text-gray-500 font-medium">ARS</th>
                    <th className="text-left px-4 py-2 text-xs text-gray-500 font-medium">Socio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {historial.map(op => (
                    <tr key={op.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(op.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          op.operacion === 'venta' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {op.operacion === 'venta' ? 'Venta' : 'Compra'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-1.5 text-gray-700 font-medium">
                          {DIVISA_META[op.divisa as Divisa]?.flag} {op.divisa}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-900">{fmt(op.monto, 2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-500">${fmt(op.tasaCambio)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                        op.operacion === 'venta' ? 'text-green-600' : 'text-orange-600'
                      }`}>
                        {op.operacion === 'venta' ? '+' : '−'}${fmt(op.montoARS)}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">
                        {op.socioApellido && op.socioNombre
                          ? `${op.socioApellido}, ${op.socioNombre}`
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
