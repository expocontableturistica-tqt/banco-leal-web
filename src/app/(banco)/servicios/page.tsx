'use client'

import { useEffect, useState, useCallback } from 'react'
import ExportButtons from '@/components/ExportButtons'

interface Pago {
  id: number
  servicio: string
  monto: number
  nroComprobante: string | null
  createdAt: string
  socioNombre: string | null
  socioApellido: string | null
  socioNumero: string | null
}

interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }

const SERVICIOS_COMUNES = [
  { label: 'Electricidad',     icon: '💡' },
  { label: 'Gas natural',      icon: '🔥' },
  { label: 'Agua / AYSA',      icon: '💧' },
  { label: 'Teléfono',         icon: '📞' },
  { label: 'Internet',         icon: '🌐' },
  { label: 'TV por cable',     icon: '📺' },
  { label: 'Tarjeta de crédito', icon: '💳' },
  { label: 'Seguro',           icon: '🛡️' },
  { label: 'ABL / Municipal',  icon: '🏛️' },
  { label: 'Ingresos brutos',  icon: '📄' },
]

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function ServiciosPage() {
  const [pagos, setPagos] = useState<Pago[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [loading, setLoading] = useState(true)

  // Formulario
  const [servicioSel, setServicioSel] = useState('')
  const [servicioCustom, setServicioCustom] = useState('')
  const [monto, setMonto] = useState('')
  const [nroComprobante, setNroComprobante] = useState('')
  const [socioId, setSocioId] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')
  const [exito, setExito] = useState<{ servicio: string; monto: number } | null>(null)

  const [soloHoy, setSoloHoy] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/servicios?hoy=${soloHoy ? '1' : '0'}`).then(x => x.json())
    setPagos(r.pagos ?? [])
    setSocios(r.socios ?? [])
    setLoading(false)
  }, [soloHoy])

  useEffect(() => { fetchData() }, [fetchData])

  const servicioFinal = servicioSel === '__otro__' ? servicioCustom : servicioSel

  async function handlePagar(e: React.FormEvent) {
    e.preventDefault()
    if (!servicioFinal.trim()) { setError('Seleccioná o ingresá el servicio'); return }
    if (!monto || parseFloat(monto) <= 0) { setError('Ingresá un monto válido'); return }
    setProcesando(true); setError('')

    const res = await fetch('/api/servicios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        servicio: servicioFinal,
        monto: parseFloat(monto),
        nroComprobante: nroComprobante || undefined,
        socioId: socioId || undefined,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setExito({ servicio: servicioFinal, monto: parseFloat(monto) })
      setMonto(''); setNroComprobante(''); setSocioId('')
      // Mantener la selección de servicio para facilitar pagos consecutivos
      fetchData()
    } else {
      setError(data.error ?? 'Error al registrar')
    }
    setProcesando(false)
  }

  const totalHoy = pagos.reduce((a, p) => a + p.monto, 0)

  return (
    <div className="flex gap-6">
      {/* Panel izquierdo */}
      <div className="w-80 flex-shrink-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Servicios</h1>
          <p className="text-sm text-gray-500">Cobro de pagos de servicios</p>
        </div>

        {exito && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm">
            <p className="font-semibold text-green-800 mb-0.5">Pago registrado</p>
            <p className="text-green-700">{exito.servicio} — <span className="font-mono">${fmt(exito.monto)}</span></p>
            <button onClick={() => setExito(null)} className="text-xs text-green-600 hover:underline mt-1">Cerrar</button>
          </div>
        )}

        <form onSubmit={handlePagar} className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
          {/* Servicios comunes */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Servicio</p>
            <div className="grid grid-cols-2 gap-1.5 mb-2">
              {SERVICIOS_COMUNES.map(s => (
                <label key={s.label} className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 cursor-pointer text-xs transition-colors ${
                  servicioSel === s.label
                    ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                    : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input type="radio" className="hidden" checked={servicioSel === s.label}
                    onChange={() => { setServicioSel(s.label); setServicioCustom('') }} />
                  <span>{s.icon}</span>
                  <span className="leading-tight">{s.label}</span>
                </label>
              ))}
              <label className={`flex items-center gap-2 border rounded-lg px-2.5 py-2 cursor-pointer text-xs transition-colors col-span-2 ${
                servicioSel === '__otro__'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
                <input type="radio" className="hidden" checked={servicioSel === '__otro__'}
                  onChange={() => setServicioSel('__otro__')} />
                <span>✏️</span>
                <span>Otro servicio...</span>
              </label>
            </div>

            {servicioSel === '__otro__' && (
              <input type="text" value={servicioCustom} onChange={e => setServicioCustom(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nombre del servicio" autoFocus />
            )}
          </div>

          {/* Nro. de comprobante */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Nro. comprobante / CBU empresa <span className="text-gray-400">(opcional)</span>
            </label>
            <input type="text" value={nroComprobante} onChange={e => setNroComprobante(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Ej: 1234567890" />
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto ($) *</label>
            <input type="number" min="0.01" step="0.01" value={monto}
              onChange={e => setMonto(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
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

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button type="submit" disabled={procesando || !servicioSel}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {procesando ? 'Registrando...' : 'Registrar pago'}
          </button>
        </form>
      </div>

      {/* Panel derecho: listado */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Pagos recibidos</h2>
            <div className="flex gap-1">
              <button onClick={() => setSoloHoy(true)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  soloHoy ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                Hoy
              </button>
              <button onClick={() => setSoloHoy(false)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  !soloHoy ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                Todos
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pagos.length > 0 && (
              <div className="text-right">
                <p className="text-xs text-gray-400">{pagos.length} pagos</p>
                <p className="text-sm font-semibold font-mono text-gray-900">Total: ${fmt(totalHoy)}</p>
              </div>
            )}
            <ExportButtons
              filenameBase="servicios"
              titulo={`Pagos de servicios${soloHoy ? ' (hoy)' : ''}`}
              sections={[{
                columns: [
                  { header: 'Fecha / hora', value: (p: Pago) => new Date(p.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) },
                  { header: 'Servicio', value: (p: Pago) => p.servicio },
                  { header: 'Comprobante', value: (p: Pago) => p.nroComprobante || '' },
                  { header: 'Socio', value: (p: Pago) => p.socioApellido && p.socioNombre ? `${p.socioApellido}, ${p.socioNombre}` : '' },
                  { header: 'Monto', value: (p: Pago) => p.monto, moneda: true },
                ],
                rows: pagos,
                foot: ['', '', '', 'Total cobrado', `$${fmt(totalHoy)}`],
              }]}
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-6 text-center">Cargando...</p>
          ) : pagos.length === 0 ? (
            <p className="text-gray-400 text-sm p-6 text-center">Sin pagos {soloHoy ? 'hoy' : 'registrados'}.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Hora</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Servicio</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Comprobante</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Socio</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pagos.map(p => {
                  const meta = SERVICIOS_COMUNES.find(s => s.label === p.servicio)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{fmtHora(p.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-gray-900">
                          {meta?.icon && <span>{meta.icon}</span>}
                          {p.servicio}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
                        {p.nroComprobante || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {p.socioApellido && p.socioNombre
                          ? `${p.socioApellido}, ${p.socioNombre}`
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-green-600">
                        +${fmt(p.monto)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">Total cobrado</td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">${fmt(totalHoy)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
