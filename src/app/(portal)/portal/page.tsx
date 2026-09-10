'use client'
import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import ExportButtons from '@/components/ExportButtons'
import Inversiones from './Inversiones'

interface Cuenta { id: number; cbu: string; alias: string; saldo: number; tipo: string }
interface Movimiento { id: number; tipo: 'credito' | 'debito'; monto: number; concepto: string; saldoPosterior: number; createdAt: string }
interface Prestamo {
  id: number; monto: number; saldoPendiente: number; concepto: string; estado: string; createdAt: string
  cuotas: number; cuotasPagadas: number; montoCuota: number | null
}
interface Entidad { id: number; razonSocial?: string; nombre?: string; apellido?: string; numeroEmpresa?: string; numeroSocio?: string; actividad?: string }

type TabKey = 'inicio' | 'movimientos' | 'inversiones' | 'prestamo' | 'depositar'

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const TIPOS_DEPOSITO = [
  { value: 'efectivo', label: 'Efectivo', desc: 'Ventas en efectivo, ingresos diarios' },
  { value: 'cheque', label: 'Cheque', desc: 'Cheques recibidos de clientes' },
  { value: 'transferencia', label: 'Transferencia', desc: 'Transferencias bancarias recibidas' },
  { value: 'mediapago', label: 'MediaPago', desc: 'Cobros via billetera digital' },
]

export default function PortalPage() {
  const { data: session } = useSession()
  const [cuenta, setCuenta] = useState<Cuenta | null>(null)
  const [movimientos, setMovimientos] = useState<Movimiento[]>([])
  const [prestamo, setPrestamo] = useState<Prestamo | null>(null)
  const [entidad, setEntidad] = useState<Entidad | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')
  const [tab, setTab] = useState<TabKey>('inicio')

  // Pago libre
  const [montoPago, setMontoPago] = useState('')
  const [pagando, setPagando] = useState(false)

  // Depósito
  const [tipoDeposito, setTipoDeposito] = useState('efectivo')
  const [montoDeposito, setMontoDeposito] = useState('')
  const [conceptoDeposito, setConceptoDeposito] = useState('')
  const [depositando, setDepositando] = useState(false)

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

  async function pagarCuota() {
    if (!prestamo) return
    setPagando(true)
    const res = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pagarCuota', prestamoId: prestamo.id }),
    })
    const data = await res.json()
    if (res.ok) {
      const cuotaN = data.cuotasPagadas
      const total = prestamo.cuotas
      setMsg(data.estado === 'pagado'
        ? '¡Préstamo saldado completamente!'
        : `Cuota ${cuotaN}/${total} pagada. Saldo pendiente: $${fmt(data.nuevoSaldoPendiente)}`)
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setPagando(false)
  }

  async function pagarLibre(e: React.FormEvent) {
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
      setMsg(data.estado === 'pagado' ? '¡Préstamo saldado!' : `Pago registrado. Saldo pendiente: $${fmt(data.nuevoSaldoPendiente)}`)
      setMontoPago('')
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setPagando(false)
  }

  async function depositar(e: React.FormEvent) {
    e.preventDefault()
    setDepositando(true)
    const res = await fetch('/api/portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'depositar', monto: parseFloat(montoDeposito), tipo: tipoDeposito, concepto: conceptoDeposito }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(`Depósito registrado. Nuevo saldo: $${fmt(data.nuevoSaldo)}`)
      setMontoDeposito('')
      setConceptoDeposito('')
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setDepositando(false)
  }

  const nombreEntidad = entidad?.razonSocial ?? (entidad ? `${entidad.apellido}, ${entidad.nombre}` : session?.user?.name)

  const montoCuota = prestamo ? (prestamo.montoCuota ?? (prestamo.monto / prestamo.cuotas)) : 0
  const cuotaActual = prestamo ? prestamo.cuotasPagadas + 1 : 0

  const tabs: [TabKey, string][] = [
    ['inicio', 'Inicio'],
    ['movimientos', 'Movimientos'],
    ['inversiones', 'Inversiones'],
    ...(isEmpresa ? [['prestamo', 'Préstamo'], ['depositar', 'Depositar']] as [TabKey, string][] : []),
  ]

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
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
        {tabs.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
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
          {cuenta ? (
            <div className="bg-gradient-to-br from-blue-600 to-blue-800 text-white rounded-2xl p-6 shadow-lg">
              <p className="text-blue-200 text-xs font-medium uppercase tracking-wider mb-4">
                Cuenta {cuenta.tipo === 'CA' ? 'Caja de Ahorro' : 'Cuenta Corriente'}
              </p>
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
            <div className="rounded-xl border bg-amber-50 border-amber-200 p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Préstamo vigente</p>
                  <p className="text-2xl font-bold text-gray-900">${fmt(prestamo.saldoPendiente)}</p>
                  <p className="text-sm text-gray-500">
                    Cuota {Math.min(cuotaActual, prestamo.cuotas)}/{prestamo.cuotas} · ${fmt(montoCuota)} c/u
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{prestamo.estado}</span>
              </div>
              <div className="mt-3 flex gap-3">
                <button onClick={() => setTab('prestamo')}
                  className="text-sm font-medium text-blue-600 hover:text-blue-800">
                  Ver detalle →
                </button>
                <button onClick={() => setTab('depositar')}
                  className="text-sm font-medium text-green-600 hover:text-green-800">
                  Depositar fondos →
                </button>
              </div>
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
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-gray-800">Historial de movimientos</p>
            <ExportButtons
              filenameBase="mis_movimientos"
              titulo={`Movimientos de cuenta — ${nombreEntidad ?? ''}`}
              sections={[{
                columns: [
                  { header: 'Fecha / hora', value: (m: Movimiento) => new Date(m.createdAt).toLocaleString('es-AR') },
                  { header: 'Concepto', value: (m: Movimiento) => m.concepto || (m.tipo === 'credito' ? 'Crédito' : 'Débito') },
                  { header: 'Tipo', value: (m: Movimiento) => (m.tipo === 'credito' ? 'Crédito' : 'Débito') },
                  { header: 'Monto', value: (m: Movimiento) => (m.tipo === 'credito' ? m.monto : -m.monto), moneda: true },
                  { header: 'Saldo posterior', value: (m: Movimiento) => m.saldoPosterior, moneda: true },
                ],
                rows: movimientos,
              }]}
            />
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

      {/* ── INVERSIONES ── */}
      {tab === 'inversiones' && <Inversiones />}

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
              {/* Detalle */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
                <h2 className="font-semibold text-gray-800">Detalle del préstamo</h2>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-gray-500 text-xs mb-1">Monto original</p>
                    <p className="font-bold text-gray-900 text-lg">${fmt(prestamo.monto)}</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-amber-600 text-xs mb-1">Saldo pendiente</p>
                    <p className="font-bold text-amber-700 text-lg">${fmt(prestamo.saldoPendiente)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-blue-600 text-xs mb-1">Cuota actual</p>
                    <p className="font-bold text-blue-700 text-lg">{Math.min(cuotaActual, prestamo.cuotas)} / {prestamo.cuotas}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg p-3">
                    <p className="text-blue-600 text-xs mb-1">Valor de cuota</p>
                    <p className="font-bold text-blue-700 text-lg">${fmt(montoCuota)}</p>
                  </div>
                </div>

                {/* Barra de progreso */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{prestamo.cuotasPagadas} cuotas pagadas</span>
                    <span>{prestamo.cuotas - prestamo.cuotasPagadas} restantes</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: `${(prestamo.cuotasPagadas / prestamo.cuotas) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="text-sm text-gray-600 space-y-1">
                  <p><span className="text-gray-400">Concepto:</span> {prestamo.concepto}</p>
                  <p><span className="text-gray-400">Otorgado:</span> {new Date(prestamo.createdAt).toLocaleDateString('es-AR')}</p>
                  <p><span className="text-gray-400">Saldo en cuenta:</span> ${fmt(cuenta?.saldo ?? 0)}</p>
                </div>
              </div>

              {/* Pagar cuota */}
              {prestamo.cuotasPagadas < prestamo.cuotas && (
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h2 className="font-semibold text-gray-800 mb-1">Pagar cuota {cuotaActual}/{prestamo.cuotas}</h2>
                  <p className="text-sm text-gray-500 mb-4">Monto a debitar: <strong>${fmt(Math.min(montoCuota, prestamo.saldoPendiente))}</strong></p>
                  <button
                    onClick={pagarCuota}
                    disabled={pagando || !cuenta || cuenta.saldo < montoCuota}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
                    {pagando ? 'Procesando…' : `Pagar cuota ${cuotaActual} — $${fmt(Math.min(montoCuota, prestamo.saldoPendiente))}`}
                  </button>
                  {cuenta && cuenta.saldo < montoCuota && (
                    <p className="text-xs text-red-500 mt-2 text-center">Saldo insuficiente. Necesitás al menos ${fmt(montoCuota)}</p>
                  )}
                </div>
              )}

              {/* Pago libre (adelantar cuotas) */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="font-semibold text-gray-800 mb-1">Pago libre</h2>
                <p className="text-sm text-gray-500 mb-4">Para adelantar cuotas o cancelar el préstamo</p>
                <form onSubmit={pagarLibre} className="space-y-3">
                  <div className="flex gap-2">
                    <input type="number" min="0.01" step="0.01" max={prestamo.saldoPendiente}
                      value={montoPago} onChange={e => setMontoPago(e.target.value)} required
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="0.00" />
                    <button type="button" onClick={() => setMontoPago(String(prestamo!.saldoPendiente))}
                      className="text-xs border border-gray-300 rounded-lg px-3 py-2 text-gray-600 hover:bg-gray-50 whitespace-nowrap">
                      Todo
                    </button>
                  </div>
                  <button type="submit" disabled={pagando || !cuenta || cuenta.saldo <= 0}
                    className="w-full bg-gray-700 hover:bg-gray-800 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
                    {pagando ? 'Procesando…' : 'Pagar monto libre'}
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DEPOSITAR ── */}
      {tab === 'depositar' && isEmpresa && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-1">Depositar fondos</h2>
            <p className="text-sm text-gray-500 mb-5">Registrá el ingreso de dinero a tu cuenta bancaria</p>

            <form onSubmit={depositar} className="space-y-4">
              {/* Tipo */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">Tipo de depósito</label>
                <div className="grid grid-cols-2 gap-2">
                  {TIPOS_DEPOSITO.map(t => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTipoDeposito(t.value)}
                      className={`text-left px-3 py-2.5 rounded-lg border text-sm transition-colors ${
                        tipoDeposito === t.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}>
                      <p className="font-medium">{t.label}</p>
                      <p className="text-xs opacity-60 mt-0.5">{t.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Monto */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto a depositar ($)</label>
                <input
                  type="number" min="0.01" step="0.01"
                  value={montoDeposito} onChange={e => setMontoDeposito(e.target.value)} required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="0.00" />
              </div>

              {/* Concepto */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Descripción (opcional)</label>
                <input
                  type="text"
                  value={conceptoDeposito} onChange={e => setConceptoDeposito(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder="Ej: Ventas del turno mañana" />
              </div>

              <button type="submit" disabled={depositando || !cuenta}
                className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg py-2.5 text-sm">
                {depositando ? 'Procesando…' : 'Confirmar depósito'}
              </button>
            </form>
          </div>

          {/* Info CBU para transferencias */}
          {tipoDeposito === 'transferencia' && cuenta && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-blue-800 mb-2">Datos para recibir transferencias</p>
              <div className="space-y-1 text-blue-700">
                <p>CBU: <span className="font-mono font-bold">{cuenta.cbu}</span></p>
                <p>Alias: <span className="font-mono font-bold">{cuenta.alias}</span></p>
              </div>
              <p className="text-xs text-blue-500 mt-2">Una vez recibida la transferencia, ingresá el monto arriba para acreditarlo en tu cuenta</p>
            </div>
          )}

          {/* Info MediaPago */}
          {tipoDeposito === 'mediapago' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm">
              <p className="font-medium text-purple-800 mb-1">Cobros via MediaPago</p>
              <p className="text-purple-700 text-xs">Los pagos recibidos a través de MediaPago se acreditan automáticamente en tu cuenta. Usá esta opción solo para registrar cobros que no hayan sido procesados automáticamente.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
