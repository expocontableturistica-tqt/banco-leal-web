'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface Cuenta { id: number; cbu: string; alias: string; saldo: number; tipo: string }
interface Movimiento { id: number; tipo: 'credito' | 'debito'; monto: number; concepto: string; saldoPosterior: number; createdAt: string }
interface Prestamo { id: number; monto: number; saldoPendiente: number; concepto: string; estado: string; createdAt: string }
interface Entidad { id: number; razonSocial?: string; nombre?: string; apellido?: string; numeroEmpresa?: string; numeroSocio?: string; actividad?: string }

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PortalPage() {
  const { data: session } = useSession()
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [prestamo, setPrestamo] = useState<Prestamo | null>(null)
  const [entidad, setEntidad] = useState<Entidad | null>(null)
  const [loading, setLoading] = useState(true)
  const [montoPago, setMontoPago] = useState('')
  const [pagando, setPagando] = useState(false)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<'inicio' | 'movimientos' | 'prestamo'>('inicio')

  const isEmpresa = session?.user?.role === 'empresa'

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/portal')
    const data = await res.json()
    setCuenta(data.cuenta ?? null)
    setMovimientos(data.movimientos ?? [])
    setPrestamo(data.prestamo ?? null)
    setEntidad(data.entidad ?? null)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function pagarPrestamo(e: React.FormEvent) {
    e.preventDefault()
    if (!prestamo) return
    setPagando(true)
    const res = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pagar', prestamoId: prestamo.id, monto: parseFloat(montoPago) }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(data.estado === 'pagado' ? '¡Préstamo saldado completamente!' : `Pago registrado. Saldo pendiente: $${fmt(data.nuevoSaldoPendiente)}`)
      setMontoPago('')
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setPagando(false)
  }

  const nombreEntidad = entidad?.razonSocial ?? (entidad ? `${entidad.apellido}, ${entidad.nombre}` : session?.user?.name)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="text-gray-400 text-sm">Cargando cuenta…</div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{nombreEntidad}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {entidad?.numeroEmpresa ?? entidad?.numeroSocio ?? ''}{entidad?.actividad ? ` · ${entidad.actividad}` : ''}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {([['inicio', 'Inicio'], ['movimientos', 'Movimientos'], ...(isEmpresa ? [['prestamo', 'Préstamo']] : [])] as [string, string][]).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as typeof tab)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
            {l}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm flex justify-between ${msg.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-green-50 border border-green-200 text-green-800'}`}>
          {msg} <button onClick={() => setMsg('')} className="opacity-50 hover:opacity-100 ml-4">✕</button>
        </div>
      )}

      {/* ── INICIO ── */}
      {tab === 'inicio' && (
        <div className="space-y-4">
          {/* Tarjeta cuenta */}
          {cuenta ? (
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg">
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-4">Cuenta {cuenta.tipo === 'CA' ? 'Caja de Ahorro' : 'Cuenta Corriente'}</p>
              <p className="text-4xl font-bold mb-1">${fmt(cuenta.saldo)}</p>
              <p className="text-blue-200 text-sm">Saldo disponible</p>
              <div className="mt-4 pt-4 border-t border-blue-500 space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-blue-200">CBU</span>
                  <span className="font-mono font-medium">{cuenta.cbu}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-blue-200">Alias</span>
                  <span className="font-mono font-medium">{cuenta.alias}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center text-amber-700 text-sm">
              No tiene cuenta bancaria asignada. Contacte al banco.
            </div>
          )}

          {/* Préstamo vigente */}
          {isEmpresa && prestamo && (
            <div className={`rounded-xl border p-5 ${prestamo.saldoPendiente > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Préstamo vigente</p>
                  <p className="text-2xl font-bold text-gray-900">${fmt(prestamo.saldoPendiente)}</p>
                  <p className="text-sm text-gray-500">pendiente de ${fmt(prestamo.monto)} originales</p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{prestamo.estado}</span>
              </div>
              <button onClick={() => setTab('prestamo')}
                className="mt-3 text-sm font-medium text-blue-600 hover:text-blue-800">
                Pagar préstamo →
              </button>
            </div>
          )}

          {isEmpresa && !prestamo && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-700 text-sm text-center">
              Sin préstamos vigentes
            </div>
          )}

          {/* Últimos movimientos */}
          {movimientos.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                <p className="text-sm font-semibold text-gray-800">Últimos movimientos</p>
                <button onClick={() => setTab('movimientos')} className="text-xs text-blue-600 hover:text-blue-800">Ver todos</button>
              </div>
              <ul className="divide-y divide-gray-50">
                {movimientos.slice(0, 5).map(m => (
                  <li key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm ${m.tipo === 'credito' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                        {m.tipo === 'credito' ? '↑' : '↓'}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.concepto || (m.tipo === 'credito' ? 'Crédito' : 'Débito')}</p>
                        <p className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                    <span className={`font-semibold text-sm ${m.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.tipo === 'credito' ? '+' : '-'}${fmt(m.monto)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ── MOVIMIENTOS ── */}
      {tab === 'movimientos' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-800">Historial de movimientos</p>
          </div>
          {movimientos.length === 0 ? (
            <p className="p-6 text-center text-gray-400 text-sm">Sin movimientos aún</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {movimientos.map(m => (
                <li key={m.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${m.tipo === 'credito' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {m.tipo === 'credito' ? '+' : '-'}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{m.concepto || (m.tipo === 'credito' ? 'Crédito' : 'Débito')}</p>
                      <p className="text-xs text-gray-400">{new Date(m.createdAt).toLocaleString('es-AR')}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-semibold text-sm ${m.tipo === 'credito' ? 'text-green-600' : 'text-red-600'}`}>
                      {m.tipo === 'credito' ? '+' : '-'}${fmt(m.monto)}
                    </p>
                    <p className="text-xs text-gray-400">Saldo: ${fmt(m.saldoPosterior)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── PRÉSTAMO ── */}
      {tab === 'prestamo' && isEmpresa && (
        <div className="space-y-4">
          {!prestamo ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <p className="text-3xl mb-2">✓</p>
              <p className="text-green-700 font-semibold">Sin préstamos vigentes</p>
              <p className="text-green-600 text-sm mt-1">No tiene deudas pendientes con el banco</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-800">Detalle del préstamo</h2>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Monto original</p>
                    <p className="font-bold text-gray-900 text-lg">${fmt(prestamo.monto)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-amber-600 text-xs mb-1">Saldo pendiente</p>
                    <p className="font-bold text-amber-700 text-lg">${fmt(prestamo.saldoPendiente)}</p>
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  <p><span className="text-gray-400">Concepto:</span> {prestamo.concepto}</p>
                  <p><span className="text-gray-400">Otorgado:</span> {new Date(prestamo.createdAt).toLocaleDateString('es-AR')}</p>
                  <p><span className="text-gray-400">Saldo en cuenta:</span> ${fmt(cuenta?.saldo ?? 0)}</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-4">Realizar pago</h2>
                <form onSubmit={pagarPrestamo} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto a pagar ($)</label>
                    <div className="flex gap-2">
                      <input type="number" min="0.01" step="0.01" max={prestamo.saldoPendiente}
                        value={montoPago} onChange={e => setMontoPago(e.target.value)} required
                        className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                        placeholder="0.00" />
                      <button type="button" onClick={() => setMontoPago(String(prestamo.saldoPendiente))}
                        className="text-xs border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                        Todo
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Máximo: ${fmt(Math.min(cuenta?.saldo ?? 0, prestamo.saldoPendiente))}</p>
                  </div>
                  <button type="submit" disabled={pagando || !cuenta || cuenta.saldo <= 0}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
                    {pagando ? 'Procesando…' : 'Confirmar pago'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
