'use client'

import { useEffect, useState, useCallback } from 'react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Asiento {
  id: string
  fecha: string
  concepto: string
  debe:  { codigo: string; cuenta: string; monto: number }
  haber: { codigo: string; cuenta: string; monto: number }
  origen: 'auto' | 'manual'
}

interface Mayor {
  [codigo: string]: { nombre: string; tipo: string; debe: number; haber: number }
}

interface Plan {
  [codigo: string]: { nombre: string; tipo: string }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TIPO_COLOR: Record<string, string> = {
  activo:  'text-blue-700',
  pasivo:  'text-purple-700',
  ingreso: 'text-green-700',
  egreso:  'text-red-600',
}

// ── Componente principal ──────────────────────────────────────────────────────

type Tab = 'diario' | 'mayor' | 'balance'

export default function LibrosPage() {
  const [asientos, setAsientos] = useState<Asiento[]>([])
  const [mayor, setMayor] = useState<Mayor>({})
  const [plan, setPlan] = useState<Plan>({})
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>('diario')

  const today = new Date().toISOString().slice(0, 10)
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)

  // Formulario asiento manual
  const [showForm, setShowForm] = useState(false)
  const [fFecha, setFFecha] = useState(today)
  const [fConcepto, setFConcepto] = useState('')
  const [fCodDebe, setFCodDebe] = useState('1.1.1')
  const [fCodHaber, setFCodHaber] = useState('2.1.1')
  const [fMonto, setFMonto] = useState('')
  const [fError, setFError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch(`/api/libros?desde=${desde}&hasta=${hasta}`).then(x => x.json())
    setAsientos(r.asientos ?? [])
    setMayor(r.mayor ?? {})
    setPlan(r.plan ?? {})
    setLoading(false)
  }, [desde, hasta])

  useEffect(() => { fetchData() }, [fetchData])

  async function handleGuardarAsiento(e: React.FormEvent) {
    e.preventDefault()
    const monto = parseFloat(fMonto)
    if (!fConcepto || !monto || monto <= 0) { setFError('Completá todos los campos'); return }
    if (fCodDebe === fCodHaber) { setFError('Debe y Haber no pueden ser la misma cuenta'); return }
    setGuardando(true); setFError('')
    const res = await fetch('/api/libros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fecha: fFecha,
        concepto: fConcepto,
        codigoDebe:  fCodDebe,
        cuentaDebe:  plan[fCodDebe]?.nombre  ?? fCodDebe,
        montoDebe:   monto,
        codigoHaber: fCodHaber,
        cuentaHaber: plan[fCodHaber]?.nombre ?? fCodHaber,
        montoHaber:  monto,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowForm(false); setFConcepto(''); setFMonto('')
      fetchData()
    } else {
      setFError(data.error ?? 'Error')
    }
    setGuardando(false)
  }

  async function handleEliminar(id: string) {
    const numId = parseInt(id.replace('AM-', ''))
    if (!numId) return
    await fetch(`/api/libros?id=${numId}`, { method: 'DELETE' })
    fetchData()
  }

  // Balance: activo total = pasivo + resultados
  const activoTotal   = Object.entries(mayor).filter(([, v]) => v.tipo === 'activo').reduce((a, [, v]) => a + (v.debe - v.haber), 0)
  const pasivoTotal   = Object.entries(mayor).filter(([, v]) => v.tipo === 'pasivo').reduce((a, [, v]) => a + (v.haber - v.debe), 0)
  const ingresoTotal  = Object.entries(mayor).filter(([, v]) => v.tipo === 'ingreso').reduce((a, [, v]) => a + (v.haber - v.debe), 0)
  const egresoTotal   = Object.entries(mayor).filter(([, v]) => v.tipo === 'egreso').reduce((a, [, v]) => a + (v.debe - v.haber), 0)
  const resultado     = ingresoTotal - egresoTotal

  return (
    <div>
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Libros Contables</h1>
          <p className="text-sm text-gray-500">Libro Diario con partida doble</p>
        </div>
        <button onClick={() => setShowForm(v => !v)}
          className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors">
          + Asiento manual
        </button>
      </div>

      {/* Formulario asiento manual */}
      {showForm && (
        <form onSubmit={handleGuardarAsiento}
          className="bg-white border border-blue-200 rounded-xl p-5 mb-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">Nuevo asiento manual</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Fecha</label>
              <input type="date" value={fFecha} onChange={e => setFFecha(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto ($) *</label>
              <input type="number" min="0.01" step="0.01" value={fMonto} onChange={e => setFMonto(e.target.value)}
                placeholder="0.00"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Concepto *</label>
            <input type="text" value={fConcepto} onChange={e => setFConcepto(e.target.value)}
              placeholder="Descripción del asiento"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta DEBE</label>
              <select value={fCodDebe} onChange={e => setFCodDebe(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(plan).map(([cod, v]) => (
                  <option key={cod} value={cod}>{cod} — {v.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuenta HABER</label>
              <select value={fCodHaber} onChange={e => setFCodHaber(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {Object.entries(plan).map(([cod, v]) => (
                  <option key={cod} value={cod}>{cod} — {v.nombre}</option>
                ))}
              </select>
            </div>
          </div>
          {fError && <p className="text-red-500 text-xs">{fError}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={guardando}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {guardando ? 'Guardando...' : 'Registrar asiento'}
            </button>
            <button type="button" onClick={() => { setShowForm(false); setFError('') }}
              className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {/* Filtros + Tabs */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="flex gap-1 ml-auto">
          {(['diario', 'mayor', 'balance'] as Tab[]).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium border capitalize transition-colors ${
                tab === t
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}>
              {t === 'diario' ? 'Libro Diario' : t === 'mayor' ? 'Mayor' : 'Balance'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Libro Diario ─────────────────────────────────────────────────────── */}
      {tab === 'diario' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-6 text-center">Cargando...</p>
          ) : asientos.length === 0 ? (
            <p className="text-gray-400 text-sm p-6 text-center">Sin asientos para el período.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium w-32">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Concepto</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cuenta DEBE</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium w-28">Debe</th>
                    <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Cuenta HABER</th>
                    <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium w-28">Haber</th>
                    <th className="w-8 px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {asientos.map(a => (
                    <tr key={a.id} className={`hover:bg-gray-50 ${a.origen === 'manual' ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFechaHora(a.fecha)}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs max-w-[220px] truncate" title={a.concepto}>
                        {a.origen === 'manual' && (
                          <span className="inline-block bg-blue-100 text-blue-700 text-xs rounded px-1 mr-1">M</span>
                        )}
                        {a.concepto}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-gray-500 font-mono">{a.debe.codigo}</span>
                        <span className="text-xs text-gray-700 ml-1">{a.debe.cuenta}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-900">${fmt(a.debe.monto)}</td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs text-gray-500 font-mono">{a.haber.codigo}</span>
                        <span className="text-xs text-gray-700 ml-1">{a.haber.cuenta}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-sm text-gray-900">${fmt(a.haber.monto)}</td>
                      <td className="px-2 py-2.5 text-center">
                        {a.origen === 'manual' && (
                          <button onClick={() => handleEliminar(a.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors text-xs" title="Eliminar">
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-2.5 text-xs font-semibold text-gray-600 text-right">Totales</td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                      ${fmt(asientos.reduce((s, a) => s + a.debe.monto, 0))}
                    </td>
                    <td></td>
                    <td className="px-4 py-2.5 text-right font-mono font-bold text-gray-900">
                      ${fmt(asientos.reduce((s, a) => s + a.haber.monto, 0))}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Mayor General ────────────────────────────────────────────────────── */}
      {tab === 'mayor' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Object.entries(mayor).sort(([a], [b]) => a.localeCompare(b)).map(([codigo, data]) => {
            const saldo = data.tipo === 'activo' || data.tipo === 'egreso'
              ? data.debe - data.haber
              : data.haber - data.debe
            return (
              <div key={codigo} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <span className="text-xs font-mono text-gray-400">{codigo}</span>
                    <p className="text-sm font-semibold text-gray-900">{data.nombre}</p>
                  </div>
                  <span className={`text-xs font-medium uppercase px-2 py-0.5 rounded-full bg-gray-100 ${TIPO_COLOR[data.tipo] ?? 'text-gray-600'}`}>
                    {data.tipo}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 mb-0.5">Debe</p>
                    <p className="text-sm font-mono font-semibold text-gray-900">${fmt(data.debe)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg p-2">
                    <p className="text-xs text-gray-500 mb-0.5">Haber</p>
                    <p className="text-sm font-mono font-semibold text-gray-900">${fmt(data.haber)}</p>
                  </div>
                  <div className={`rounded-lg p-2 ${saldo >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                    <p className="text-xs text-gray-500 mb-0.5">Saldo</p>
                    <p className={`text-sm font-mono font-bold ${saldo >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      ${fmt(Math.abs(saldo))}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
          {Object.keys(mayor).length === 0 && (
            <p className="text-gray-400 text-sm col-span-2 text-center py-8">Sin movimientos para el período.</p>
          )}
        </div>
      )}

      {/* ── Balance ──────────────────────────────────────────────────────────── */}
      {tab === 'balance' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Activo */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-3">Activo</p>
            {Object.entries(mayor).filter(([, v]) => v.tipo === 'activo').map(([cod, v]) => (
              <div key={cod} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                <span className="text-gray-600"><span className="font-mono text-xs text-gray-400 mr-1">{cod}</span>{v.nombre}</span>
                <span className="font-mono font-medium text-gray-900">${fmt(v.debe - v.haber)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-3 mt-2 border-t border-gray-200">
              <span className="text-sm font-bold text-gray-700">Total Activo</span>
              <span className="text-sm font-bold font-mono text-blue-700">${fmt(activoTotal)}</span>
            </div>
          </div>

          {/* Pasivo + Resultados */}
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-3">Pasivo</p>
              {Object.entries(mayor).filter(([, v]) => v.tipo === 'pasivo').map(([cod, v]) => (
                <div key={cod} className="flex justify-between py-1.5 border-b border-gray-50 last:border-0 text-sm">
                  <span className="text-gray-600"><span className="font-mono text-xs text-gray-400 mr-1">{cod}</span>{v.nombre}</span>
                  <span className="font-mono font-medium text-gray-900">${fmt(v.haber - v.debe)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-700">Total Pasivo</span>
                <span className="text-sm font-bold font-mono text-purple-700">${fmt(pasivoTotal)}</span>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-3">Resultado del período</p>
              <div className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                <span className="text-gray-600">Ingresos</span>
                <span className="font-mono font-medium text-green-600">+${fmt(ingresoTotal)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-gray-50 text-sm">
                <span className="text-gray-600">Egresos</span>
                <span className="font-mono font-medium text-red-500">−${fmt(egresoTotal)}</span>
              </div>
              <div className="flex justify-between pt-3 mt-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-700">Resultado neto</span>
                <span className={`text-sm font-bold font-mono ${resultado >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                  {resultado >= 0 ? '+' : '−'}${fmt(Math.abs(resultado))}
                </span>
              </div>
            </div>

            <div className={`rounded-xl border p-4 flex justify-between items-center ${
              Math.abs(activoTotal - pasivoTotal - resultado) < 0.01
                ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
            }`}>
              <span className="text-sm font-semibold text-gray-700">Ecuación contable</span>
              <span className={`text-xs font-bold ${
                Math.abs(activoTotal - pasivoTotal - resultado) < 0.01 ? 'text-green-700' : 'text-red-600'
              }`}>
                {Math.abs(activoTotal - pasivoTotal - resultado) < 0.01
                  ? '✓ Cuadra'
                  : `Diferencia: $${fmt(Math.abs(activoTotal - pasivoTotal - resultado))}`}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
