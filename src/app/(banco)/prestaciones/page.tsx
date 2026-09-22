'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import ExportButtons from '@/components/ExportButtons'
import { PLANES_TARJETA, TIPOS_PRESTACION, TIPOS_SEGURO, detallePrestacion, type TipoPrestacion } from '@/lib/prestaciones'

interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }

interface Prestacion {
  id: number
  socioId: number
  tipo: string
  descripcion: string
  datos: string
  tid: string
  createdAt: string
  tieneQr: boolean
  socioNombre: string | null
  socioApellido: string | null
  socioNumero: string | null
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function leerDatos(json: string): Record<string, unknown> {
  try { return JSON.parse(json) } catch { return {} }
}

export default function PrestacionesPage() {
  const [socios, setSocios] = useState<Socio[]>([])
  const [historial, setHistorial] = useState<Prestacion[]>([])
  const [loading, setLoading] = useState(true)

  // Formulario
  const [tipoSel, setTipoSel] = useState<TipoPrestacion>('banco_tarjeta')
  const [socioId, setSocioId] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState('')

  // Datos propios de cada tipo
  const [plan, setPlan] = useState<string>(PLANES_TARJETA[0].plan)
  const [tipoSeguro, setTipoSeguro] = useState<string>(TIPOS_SEGURO[0])
  const [cobertura, setCobertura] = useState('')
  const [vigencia, setVigencia] = useState('12')
  const [tarjetaRef, setTarjetaRef] = useState('')
  const [incremento, setIncremento] = useState('')
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')

  // QR (recién emitido o desde el historial)
  const [qr, setQr] = useState<{ dataUrl: string; titulo: string; detalle: string } | null>(null)

  const tipoActual = TIPOS_PRESTACION.find(t => t.key === tipoSel)!
  const socioSel = socios.find(s => s.id === parseInt(socioId))

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

  function datosDelTipo(): Record<string, unknown> {
    switch (tipoSel) {
      case 'banco_tarjeta': return { plan, titular: socioSel ? `${socioSel.nombre} ${socioSel.apellido}`.toUpperCase() : '' }
      case 'banco_seguro':  return { tipoSeguro, cobertura: parseFloat(cobertura), vigencia: parseInt(vigencia) }
      case 'banco_limite':  return { tarjetaRef, incremento: parseFloat(incremento) }
      case 'banco_bono':    return { monto: parseFloat(monto), motivo }
    }
  }

  async function handleGenerar(e: React.FormEvent) {
    e.preventDefault()
    if (!socioId) { setError('Seleccioná un socio'); return }
    setProcesando(true); setError('')

    const res = await fetch('/api/prestaciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ socioId: parseInt(socioId), tipo: tipoSel, descripcion, datos: datosDelTipo() }),
    })
    const data = await res.json()
    if (res.ok) {
      setQr({
        dataUrl: data.dataUrl,
        titulo: `${tipoActual.icon} ${tipoActual.label} — ${socioSel ? `${socioSel.apellido}, ${socioSel.nombre}` : ''}`,
        detalle: `${detallePrestacion(tipoSel, leerDatos(data.datos))}. Que el socio lo escanee con MediaPago; vence en 24 horas.`,
      })
      setSocioId(''); setCobertura(''); setIncremento(''); setMonto(''); setMotivo(''); setTarjetaRef(''); setDescripcion('')
      fetchData()
    } else {
      setError(data.error || 'Error al generar la prestación')
    }
    setProcesando(false)
  }

  async function verQr(p: Prestacion) {
    const res = await fetch(`/api/prestaciones?qr=${p.id}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error); return }
    const t = TIPOS_PRESTACION.find(x => x.key === p.tipo)
    setQr({
      dataUrl: data.dataUrl,
      titulo: `${t?.icon ?? '🎁'} ${t?.label ?? p.tipo} — ${p.socioApellido}, ${p.socioNombre}`,
      detalle: data.vencido
        ? 'Este QR ya venció (dura 24 horas): MediaPago no lo va a aceptar. Generá uno nuevo.'
        : `${detallePrestacion(p.tipo, leerDatos(p.datos))}. Válido hasta ${new Date(data.venceTs * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`,
    })
  }

  if (loading) return <p className="text-gray-500 text-sm">Cargando...</p>

  const campo = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'
  const etiqueta = 'block text-xs font-medium text-gray-700 mb-1'

  return (
    <div className="flex gap-6 h-full">
      {/* Panel izquierdo: formulario */}
      <div className="w-80 flex-shrink-0">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Prestaciones</h1>

        <form onSubmit={handleGenerar} className="space-y-4">
          {/* Selector de tipo */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de prestación</p>
            <div className="grid grid-cols-2 gap-2">
              {TIPOS_PRESTACION.map(t => (
                <label key={t.key} className={`flex flex-col items-center border rounded-xl p-3 cursor-pointer text-center transition-colors ${
                  tipoSel === t.key ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                }`}>
                  <input type="radio" className="hidden" checked={tipoSel === t.key}
                    onChange={() => { setTipoSel(t.key); setError('') }} />
                  <span className="text-2xl mb-1">{t.icon}</span>
                  <span className={`text-xs font-medium leading-tight ${tipoSel === t.key ? 'text-blue-700' : 'text-gray-700'}`}>
                    {t.label}
                  </span>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{tipoActual.desc}</p>
          </div>

          {/* Socio */}
          <div>
            <label className={etiqueta}>Socio *</label>
            <select required value={socioId} onChange={e => setSocioId(e.target.value)} className={campo}>
              <option value="">Seleccionar socio...</option>
              {socios.map(s => (
                <option key={s.id} value={s.id}>{s.apellido}, {s.nombre} — {s.numeroSocio}</option>
              ))}
            </select>
          </div>

          {/* Datos de la tarjeta */}
          {tipoSel === 'banco_tarjeta' && (
            <div>
              <label className={etiqueta}>Plan de la tarjeta *</label>
              <select required value={plan} onChange={e => setPlan(e.target.value)} className={campo}>
                {PLANES_TARJETA.map(p => (
                  <option key={p.plan} value={p.plan}>{p.plan} — límite ${fmt(p.limite)}</option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">La tarjeta sale a nombre del socio elegido.</p>
            </div>
          )}

          {/* Datos del seguro */}
          {tipoSel === 'banco_seguro' && (
            <>
              <div>
                <label className={etiqueta}>Tipo de seguro *</label>
                <select required value={tipoSeguro} onChange={e => setTipoSeguro(e.target.value)} className={campo}>
                  {TIPOS_SEGURO.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={etiqueta}>Cobertura ($) *</label>
                  <input type="number" min="0.01" step="0.01" required value={cobertura}
                    onChange={e => setCobertura(e.target.value)} className={`${campo} font-mono`} placeholder="0.00" />
                </div>
                <div>
                  <label className={etiqueta}>Vigencia (meses) *</label>
                  <input type="number" min="1" max="120" required value={vigencia}
                    onChange={e => setVigencia(e.target.value)} className={campo} />
                </div>
              </div>
            </>
          )}

          {/* Datos del aumento de límite */}
          {tipoSel === 'banco_limite' && (
            <>
              <div>
                <label className={etiqueta}>Últimos 4 números de la tarjeta *</label>
                <input type="text" inputMode="numeric" pattern="\d{4}" maxLength={4} required value={tarjetaRef}
                  onChange={e => setTarjetaRef(e.target.value.replace(/\D/g, ''))} className={`${campo} font-mono`} placeholder="1234" />
                <p className="text-xs text-gray-400 mt-1">El socio los ve en su tarjeta dentro de MediaPago.</p>
              </div>
              <div>
                <label className={etiqueta}>Aumento del límite ($) *</label>
                <input type="number" min="0.01" step="0.01" required value={incremento}
                  onChange={e => setIncremento(e.target.value)} className={`${campo} font-mono`} placeholder="0.00" />
              </div>
            </>
          )}

          {/* Datos del bono */}
          {tipoSel === 'banco_bono' && (
            <>
              <div>
                <label className={etiqueta}>Monto del bono ($) *</label>
                <input type="number" min="0.01" step="0.01" required value={monto}
                  onChange={e => setMonto(e.target.value)} className={`${campo} font-mono`} placeholder="0.00" />
              </div>
              <div>
                <label className={etiqueta}>Motivo *</label>
                <input type="text" required value={motivo} onChange={e => setMotivo(e.target.value)}
                  className={campo} placeholder="Ej: Premio por participación" />
              </div>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                El bono es dinero: sale de la bóveda al generar el QR y queda registrado en la caja y en los libros.
              </p>
            </>
          )}

          {/* Observaciones */}
          <div>
            <label className={etiqueta}>Observaciones <span className="text-gray-400">(opcional)</span></label>
            <input type="text" value={descripcion} onChange={e => setDescripcion(e.target.value)}
              className={campo} placeholder="Queda en el historial del banco" />
          </div>

          {error && <p className="text-red-500 text-xs">{error}</p>}

          <button type="submit" disabled={procesando}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {procesando ? 'Generando QR...' : `Generar QR · ${tipoActual.label}`}
          </button>
        </form>

        <p className="text-xs text-gray-500 mt-4 border-t border-gray-200 pt-3">
          💰 ¿Préstamo personal? Se otorga desde{' '}
          <Link href="/prestamos" className="text-blue-600 hover:underline">Préstamos</Link>, donde se puede
          entregar por QR, depositado en cuenta, en efectivo o repartido.
        </p>
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
                  { header: 'Tipo', value: (p: Prestacion) => TIPOS_PRESTACION.find(t => t.key === p.tipo)?.label ?? p.tipo },
                  { header: 'Detalle', value: (p: Prestacion) => detallePrestacion(p.tipo, leerDatos(p.datos)) },
                  { header: 'Observaciones', value: (p: Prestacion) => p.descripcion },
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
                  <th className="text-left px-4 py-3 text-gray-600 font-medium">QR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {historial.map(p => {
                  const tipo = TIPOS_PRESTACION.find(t => t.key === p.tipo)
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
                          {tipo?.icon ?? '🎁'} {tipo?.label ?? p.tipo}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {detallePrestacion(p.tipo, leerDatos(p.datos))}
                        {p.descripcion ? ` · ${p.descripcion}` : ''}
                      </td>
                      <td className="px-4 py-3 text-xs">
                        {p.tieneQr
                          ? <button onClick={() => verQr(p)} className="text-blue-600 hover:text-blue-800 font-medium">Ver QR</button>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR para escanear con MediaPago */}
      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setQr(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-1">{qr.titulo}</p>
            <div className="flex justify-center my-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.dataUrl} alt="QR de la prestación" className="w-56 h-56 border rounded-lg" />
            </div>
            <p className="text-xs text-gray-500 mb-4">{qr.detalle}</p>
            <button onClick={() => setQr(null)}
              className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700">
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
