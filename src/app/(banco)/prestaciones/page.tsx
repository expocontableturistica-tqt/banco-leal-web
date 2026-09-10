'use client'

import { useEffect, useState } from 'react'
import ExportButtons from '@/components/ExportButtons'

interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }

interface Prestacion {
  id: number
  socioId: number
  tipo: string
  descripcion: string
  datos: string
  tid: string
  createdAt: string
  socioNombre: string | null
  socioApellido: string | null
  socioNumero: string | null
}

const TIPOS = [
  { key: 'banco_tarjeta',   label: 'Tarjeta',         icon: '💳', desc: 'Débito / crédito', conMonto: false },
  { key: 'banco_prestamo',  label: 'Préstamo',         icon: '💰', desc: 'Monto a otorgar',  conMonto: true  },
  { key: 'banco_seguro',    label: 'Seguro',           icon: '🛡️', desc: 'Cobertura / plan', conMonto: false },
  { key: 'banco_limite',    label: 'Límite de crédito',icon: '📈', desc: 'Monto del límite',  conMonto: true  },
  { key: 'banco_bono',      label: 'Bono',             icon: '🎁', desc: 'Monto del bono',   conMonto: true  },
  { key: 'banco_inversion', label: 'Inversión',        icon: '📊', desc: 'Monto a invertir', conMonto: true  },
] as const

type TipoKey = typeof TIPOS[number]['key']

export default function PrestacionesPage() {
  const [socios, setSocios] = useState<Socio[]>([])
  const [historial, setHistorial] = useState<Prestacion[]>([])
  const [loading, setLoading] = useState(true)

  // Formulario
  const [tipoSel, setTipoSel] = useState<TipoKey>('banco_prestamo')
  const [socioId, setSocioId] = useState('')
  const [monto, setMonto] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  // Resultado con QR
  const [resultado, setResultado] = useState<{ qrDataUrl: string; label: string; socio: string } | null>(null)

  const tipoActual = TIPOS.find(t => t.key === tipoSel)!

  async function fetchData() {
    setLoading(true)
    const [s, p] = await Promise.all([
      fetch('/api/socios').then(r => r.json()),
      fetch('/api/prestaciones').then(r => r.json()),
    ])
    setSocios(Array.isArray(s) ? s : [])
    setHistorial(Array.isArray(p) ? p : [])
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault()
    if (!socioId) { setError('Seleccioná un socio'); return }
    setProcesando(true); setError('')

    const datos: Record<string, unknown> = {}
    if (tipoActual.conMonto && monto) datos.monto = parseFloat(monto)
    if (descripcion) datos.descripcion = descripcion

    const res = await fetch('/api/prestaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socioId: parseInt(socioId), tipo: tipoSel, descripcion, datos }),
    })
    const data = await res.json()
    if (res.ok) {
      const socio = socios.find(s => s.id === parseInt(socioId))
      setResultado({
        qrDataUrl: data.dataUrl,
        label: tipoActual.label,
        socio: socio ? `${socio.apellido}, ${socio.nombre}` : '',
      })
      setSocioId(''); setMonto(''); setDescripcion('')
      fetchData()
    } else {
      setError(data.error || 'Error al generar la prestación')
    }
    setProcesando(false)
  }

  function nuevaOperacion() { setResultado(null); setError('') }

  if (loading) return <p className="text-gray-500 text-sm">Cargando...</p>

  return (
    <div className="flex gap-6 h-full">
      {/* Panel izquierdo: formulario */}
      <div className="w-80 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Prestaciones</h1>

        {resultado ? (
          /* Resultado con QR */
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <p className="text-sm font-semibold text-gray-700 mb-1">{resultado.label}</p>
            <p className="text-xs text-gray-400 mb-4">{resultado.socio}</p>
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado.qrDataUrl} alt="QR Prestación" className="w-48 h-48 border rounded-xl" />
            </div>
            <p className="text-xs text-gray-500 mb-4">Mostrá este QR al socio para que lo escanee con MediaPago.</p>
            <button onClick={nuevaOperacion}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors">
              Nueva prestación
            </button>
          </div>
        ) : (
          <form onSubmit={handleGenerar} className="space-y-4">
            {/* Selector de tipo */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de prestación</p>
              <div className="grid grid-cols-2 gap-2">
                {TIPOS.map(t => (
                  <label key={t.key} className={`flex flex-col items-center border rounded-xl p-3 cursor-pointer text-center transition-colors ${
                    tipoSel === t.key
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}>
                    <input type="radio" className="hidden" checked={tipoSel === t.key}
                      onChange={() => { setTipoSel(t.key); setMonto('') }} />
                    <span className="text-2xl mb-1">{t.icon}</span>
                    <span className={`text-xs font-medium leading-tight ${tipoSel === t.key ? 'text-blue-700' : 'text-gray-700'}`}>
                      {t.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Socio */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Socio *</label>
              <select required value={socioId} onChange={e => setSocioId(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Seleccionar socio...</option>
                {socios.map(s => (
                  <option key={s.id} value={s.id}>{s.apellido}, {s.nombre} — {s.numeroSocio}</option>
                ))}
              </select>
            </div>

            {/* Monto (solo para tipos que lo requieren) */}
            {tipoActual.conMonto && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Monto ($) <span className="text-gray-400">— {tipoActual.desc}</span>
                </label>
                <input type="number" min="0.01" step="0.01" value={monto}
                  onChange={e => setMonto(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00" />
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Observaciones <span className="text-gray-400">(opcional)</span>
              </label>
              <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={`Ej: ${tipoActual.key === 'banco_tarjeta' ? 'Visa débito' : tipoActual.key === 'banco_seguro' ? 'Seguro de vida' : 'Plan 12 cuotas'}`} />
            </div>

            {error && <p className="text-red-500 text-xs">{error}</p>}

            <button type="submit" disabled={procesando}
              className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {procesando ? 'Generando QR...' : `Generar QR · ${tipoActual.label}`}
            </button>
          </form>
        )}
      </div>

      {/* Panel derecho: historial */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-900">Historial</h2>
          <div className="flex items-center gap-3">
            <p className="text-sm text-gray-400">{historial.length} registros</p>
            <ExportButtons
              filenameBase="prestaciones"
              titulo="Historial de prestaciones"
              sections={[{
                columns: [
                  { header: 'Fecha / hora', value: (p: Prestacion) => new Date(p.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) },
                  { header: 'Socio', value: (p: Prestacion) => p.socioApellido && p.socioNombre ? `${p.socioApellido}, ${p.socioNombre}` : `#${p.socioId}` },
                  { header: 'N° Socio', value: (p: Prestacion) => p.socioNumero || '' },
                  { header: 'Tipo', value: (p: Prestacion) => TIPOS.find(t => t.key === p.tipo)?.label ?? p.tipo },
                  { header: 'Detalle', value: (p: Prestacion) => {
                    let d: Record<string, unknown> = {}
                    try { d = JSON.parse(p.datos) } catch { /* ignore */ }
                    const monto = d.monto ? `$${Number(d.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}` : ''
                    return [monto, p.descripcion].filter(Boolean).join(' · ')
                  } },
                  { header: 'TID', value: (p: Prestacion) => p.tid },
                ],
                rows: historial,
              }]}
            />
          </div>
        </div>

        {historial.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
            Sin prestaciones registradas.
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Fecha / hora</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Socio</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">Detalle</th>
                  <th className="text-left px-4 py-3 text-gray-600 font-medium font-mono">TID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historial.map(p => {
                  const tipo = TIPOS.find(t => t.key === p.tipo)
                  let datosObj: Record<string, unknown> = {}
                  try { datosObj = JSON.parse(p.datos) } catch { /* ignore */ }
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-400 text-xs font-mono">
                        {new Date(p.createdAt).toLocaleString('es-AR', {
                          day: '2-digit', month: '2-digit',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 text-gray-900 font-medium">
                        {p.socioApellido && p.socioNombre
                          ? `${p.socioApellido}, ${p.socioNombre}`
                          : `#${p.socioId}`}
                        {p.socioNumero && <span className="ml-1 text-xs text-gray-400">({p.socioNumero})</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-700">
                          {tipo?.icon} {tipo?.label ?? p.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {datosObj.monto
                          ? `$${Number(datosObj.monto).toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
                          : ''}
                        {p.descripcion ? ` ${p.descripcion}` : ''}
                        {!datosObj.monto && !p.descripcion ? '—' : ''}
                      </td>
                      <td className="px-4 py-3 text-gray-400 font-mono text-xs">{p.tid}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
