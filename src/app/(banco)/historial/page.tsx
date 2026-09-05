'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSession } from 'next-auth/react'

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface MovCuenta {
  id: number
  cuentaId: number
  tipo: string
  monto: number
  concepto: string | null
  saldoPosterior: number
  createdAt: string
  cbu: string
  alias: string
  tipoCuenta: string
  socioNombre: string | null
  socioApellido: string | null
  razonSocial: string | null
}

interface MovCaja {
  id: number
  cajaId: number | null
  tipo: string
  monto: number
  concepto: string | null
  saldoPosterior: number
  createdAt: string
  numeroCaja: number | null
  cajaUserId: string | null
  cajeroNombre: string | null
}

type Seccion = 'all' | 'cuenta' | 'caja'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFecha(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

const TIPO_CUENTA_COLOR: Record<string, string> = {
  credito: 'bg-green-100 text-green-700',
  debito: 'bg-red-100 text-red-700',
}

const TIPO_CAJA_COLOR: Record<string, string> = {
  ingreso: 'bg-green-100 text-green-700',
  egreso: 'bg-red-100 text-red-700',
  apertura: 'bg-blue-100 text-blue-700',
  cierre: 'bg-gray-100 text-gray-600',
  transferencia_entrada: 'bg-teal-100 text-teal-700',
  transferencia_salida: 'bg-orange-100 text-orange-700',
}

const TIPO_CAJA_LABEL: Record<string, string> = {
  apertura: 'Apertura',
  cierre: 'Cierre',
  ingreso: 'Ingreso',
  egreso: 'Egreso',
  transferencia_entrada: 'Entrada ↓',
  transferencia_salida: 'Salida ↑',
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function HistorialPage() {
  const { data: session } = useSession()
  const role = (session?.user as { role?: string })?.role

  const [movCuenta, setMovCuenta] = useState<MovCuenta[]>([])
  const [movCaja, setMovCaja] = useState<MovCaja[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Filtros
  const today = new Date().toISOString().slice(0, 10)
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)
  const [seccion, setSeccion] = useState<Seccion>('all')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')
    const params = new URLSearchParams({ desde, hasta, seccion, limit: '100' })
    const res = await fetch(`/api/historial?${params}`)
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Error'); setLoading(false); return }
    setMovCuenta(data.movCuenta ?? [])
    setMovCaja(data.movCaja ?? [])
    setLoading(false)
  }, [desde, hasta, seccion])

  useEffect(() => { fetchData() }, [fetchData])

  // Unir y ordenar por fecha desc
  type Row =
    | { seccion: 'cuenta'; data: MovCuenta }
    | { seccion: 'caja'; data: MovCaja }

  const rows: Row[] = [
    ...movCuenta.map(d => ({ seccion: 'cuenta' as const, data: d })),
    ...movCaja.map(d => ({ seccion: 'caja' as const, data: d })),
  ].sort((a, b) => b.data.createdAt.localeCompare(a.data.createdAt))

  const totalCuentas = movCuenta.length
  const totalCaja = movCaja.length

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Historial</h1>
          <p className="text-sm text-gray-500">Movimientos de cuentas y caja</p>
        </div>
        <button onClick={fetchData}
          className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-4 items-end">
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
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Sección</label>
          <div className="flex gap-1">
            {(['all', 'cuenta', ...(role !== 'operador' ? ['caja'] : [])] as Seccion[]).map(s => (
              <button key={s} onClick={() => setSeccion(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  seccion === s
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                }`}>
                {s === 'all' ? 'Todo' : s === 'cuenta' ? 'Cuentas' : 'Caja'}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto text-xs text-gray-400 self-end pb-1">
          {totalCuentas} mov. cuenta · {totalCaja} mov. caja
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <p className="text-gray-400 text-sm p-6 text-center">Cargando...</p>
        ) : error ? (
          <p className="text-red-500 text-sm p-6 text-center">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-400 text-sm p-6 text-center">Sin movimientos para el período seleccionado.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium whitespace-nowrap">Fecha / hora</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Sección</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Titular / Ventanilla</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs text-gray-500 font-medium">Concepto</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Monto</th>
                  <th className="text-right px-4 py-3 text-xs text-gray-500 font-medium">Saldo post.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map((row, i) => {
                  if (row.seccion === 'cuenta') {
                    const m = row.data
                    const titular = m.razonSocial
                      ? m.razonSocial
                      : m.socioApellido && m.socioNombre
                        ? `${m.socioApellido}, ${m.socioNombre}`
                        : '—'
                    return (
                      <tr key={`c${m.id}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(m.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">Cuenta</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className="text-gray-900 font-medium block truncate max-w-[180px]">{titular}</span>
                          <span className="text-gray-400 text-xs">{m.tipoCuenta} · {m.alias}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_CUENTA_COLOR[m.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                            {m.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs truncate max-w-[200px]">{m.concepto || '—'}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-medium ${m.tipo === 'credito' ? 'text-green-600' : 'text-red-500'}`}>
                          {m.tipo === 'debito' ? '−' : '+'}${fmt(m.monto)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">${fmt(m.saldoPosterior)}</td>
                      </tr>
                    )
                  } else {
                    const m = row.data
                    const ventanilla = m.cajaUserId
                      ? `Ventanilla ${m.numeroCaja ?? '?'}${m.cajeroNombre ? ` · ${m.cajeroNombre}` : ''}`
                      : 'Bóveda'
                    return (
                      <tr key={`k${m.id}-${i}`} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-400 whitespace-nowrap">{fmtFecha(m.createdAt)}</td>
                        <td className="px-4 py-2.5">
                          <span className="text-xs font-medium bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full">Caja</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-700 text-xs">{ventanilla}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TIPO_CAJA_COLOR[m.tipo] ?? 'bg-gray-100 text-gray-600'}`}>
                            {TIPO_CAJA_LABEL[m.tipo] ?? m.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500 text-xs truncate max-w-[200px]">{m.concepto || '—'}</td>
                        <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                          ['ingreso', 'transferencia_entrada', 'apertura'].includes(m.tipo) ? 'text-green-600' : 'text-gray-700'
                        }`}>
                          ${fmt(m.monto)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">${fmt(m.saldoPosterior)}</td>
                      </tr>
                    )
                  }
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {rows.length >= 100 && (
        <p className="text-xs text-gray-400 text-center mt-3">Mostrando los últimos 100 registros. Ajustá el rango de fechas para acotar.</p>
      )}
    </div>
  )
}
