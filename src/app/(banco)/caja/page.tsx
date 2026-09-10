'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import ExportButtons from '@/components/ExportButtons'
import type { Col } from '@/lib/export'

interface CajaRow {
  id: number
  userId: string | null
  numeroCaja: number | null
  saldoEfectivo: number
  estado: 'abierta' | 'cerrada'
  fechaApertura: string | null
}

interface Movimiento {
  id: number
  cajaId: number
  tipo: string
  monto: number
  concepto: string
  saldoPosterior: number
  createdAt: string
}

interface AdminData {
  boveda: CajaRow
  ventanillas: CajaRow[]
  totalGeneral: number
  movimientos: Movimiento[]
}

interface CajeroData {
  caja: CajaRow | null
  movimientos: Movimiento[]
}

const TIPO_COLOR: Record<string, string> = {
  apertura:             'text-blue-600',
  cierre:               'text-gray-400',
  ingreso:              'text-green-600',
  egreso:               'text-red-500',
  transferencia_entrada:'text-green-600',
  transferencia_salida: 'text-orange-500',
}
const TIPO_LABEL: Record<string, string> = {
  apertura:             'Apertura',
  cierre:               'Cierre',
  ingreso:              'Ingreso',
  egreso:               'Egreso',
  transferencia_entrada:'Ingreso bóveda',
  transferencia_salida: 'Salida bóveda',
}
const TIPO_SIGNO: Record<string, string> = {
  apertura: '+', cierre: '', ingreso: '+', egreso: '−',
  transferencia_entrada: '+', transferencia_salida: '−',
}

function fmt(n: number) { return n.toLocaleString('es-AR', { minimumFractionDigits: 2 }) }
function hora(s: string) { return new Date(s).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) }

const MOV_CAJA_COLS: Col<Movimiento>[] = [
  { header: 'Fecha / hora', value: m => new Date(m.createdAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) },
  { header: 'Tipo', value: m => TIPO_LABEL[m.tipo] ?? m.tipo },
  { header: 'Concepto', value: m => m.concepto || '' },
  { header: 'Monto', value: m => m.monto, moneda: true },
  { header: 'Saldo', value: m => m.saldoPosterior, moneda: true },
]

export default function CajaPage() {
  const { data: session } = useSession()
  const isAdmin = session?.user?.role === 'admin'
  const [adminData, setAdminData] = useState<AdminData | null>(null)
  const [cajeroData, setCajeroData] = useState<CajeroData | null>(null)
  const [loading, setLoading] = useState(true)

  // modales
  const [showAbrirBoveda, setShowAbrirBoveda] = useState(false)
  const [showIngresarBoveda, setShowIngresarBoveda] = useState(false)
  const [showAbrirVentanilla, setShowAbrirVentanilla] = useState(false)
  const [montoModal, setMontoModal] = useState('')
  const [procesando, setProcesando] = useState(false)
  const [errorModal, setErrorModal] = useState('')

  async function fetchData() {
    setLoading(true)
    const res = await fetch('/api/caja?movimientos=1')
    const json = await res.json()
    if (isAdmin) setAdminData(json)
    else setCajeroData(json)
    setLoading(false)
  }

  useEffect(() => { if (session) fetchData() }, [session])

  async function accion(body: object) {
    setProcesando(true); setErrorModal('')
    const res = await fetch('/api/caja', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!res.ok) setErrorModal(json.error || 'Error')
    else { setShowAbrirBoveda(false); setShowIngresarBoveda(false); setShowAbrirVentanilla(false); setMontoModal(''); fetchData() }
    setProcesando(false)
  }

  if (loading) return <p className="text-gray-500 text-sm">Cargando...</p>

  // ── Vista Cajero ─────────────────────────────────────────────────────────────
  if (!isAdmin) {
    const miCaja = cajeroData?.caja
    const movimientos = cajeroData?.movimientos ?? []
    const abierta = miCaja?.estado === 'abierta'

    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Mi ventanilla</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className={`rounded-xl border p-5 ${abierta ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-xs text-gray-500 mb-1">Estado</p>
            <div className="flex items-center gap-2">
              <span className={`w-3 h-3 rounded-full ${abierta ? 'bg-green-500' : 'bg-gray-300'}`} />
              <p className="text-xl font-bold text-gray-900">
                {abierta ? `Ventanilla ${miCaja?.numeroCaja} · Abierta` : 'Cerrada'}
              </p>
            </div>
            {abierta && miCaja?.fechaApertura && (
              <p className="text-xs text-gray-400 mt-1">Desde {hora(miCaja.fechaApertura)}</p>
            )}
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <p className="text-xs text-gray-500 mb-1">Saldo en caja</p>
            <p className="text-xl font-bold text-gray-900">${fmt(miCaja?.saldoEfectivo ?? 0)}</p>
          </div>
        </div>

        <div className="flex gap-2 mb-6">
          {!abierta ? (
            <button onClick={() => setShowAbrirVentanilla(true)}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              Abrir ventanilla
            </button>
          ) : (
            <button onClick={() => { if (confirm('¿Cerrar tu ventanilla? El saldo se reintegrará a la bóveda.')) accion({ accion: 'cerrar' }) }}
              disabled={procesando}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors">
              Cerrar ventanilla
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Movimientos de mi ventanilla</h2>
          <ExportButtons filenameBase="caja_ventanilla" titulo={`Movimientos de ventanilla${miCaja?.numeroCaja ? ` ${miCaja.numeroCaja}` : ''}`}
            sections={[{ columns: MOV_CAJA_COLS, rows: movimientos }]} />
        </div>
        <MovimientosTabla movimientos={movimientos} />

        {showAbrirVentanilla && (
          <Modal titulo="Abrir ventanilla" onClose={() => { setShowAbrirVentanilla(false); setErrorModal('') }}>
            <p className="text-xs text-gray-500 mb-3">El fondo inicial se descuenta de la bóveda del banco.</p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fondo inicial ($)</label>
            <input type="number" min="0" step="0.01" autoFocus value={montoModal}
              onChange={e => setMontoModal(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="0.00" />
            {errorModal && <p className="text-red-500 text-xs mt-2">{errorModal}</p>}
            <div className="flex gap-2 mt-4">
              <button type="button" onClick={() => { setShowAbrirVentanilla(false); setErrorModal('') }}
                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
              <button disabled={procesando} onClick={() => accion({ accion: 'abrir', monto: parseFloat(montoModal) || 0 })}
                className="flex-1 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {procesando ? 'Abriendo...' : 'Abrir'}
              </button>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  // ── Vista Admin ──────────────────────────────────────────────────────────────
  const boveda = adminData?.boveda
  const ventanillas = adminData?.ventanillas ?? []
  const totalGeneral = adminData?.totalGeneral ?? 0
  const movBoveda = adminData?.movimientos ?? []
  const bovedaAbierta = boveda?.estado === 'abierta'

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Caja general</h1>

      {/* Resumen general */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`rounded-xl border p-5 ${bovedaAbierta ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white'}`}>
          <p className="text-xs text-gray-500 mb-1">🏛️ Bóveda del banco</p>
          <p className="text-xl font-bold text-gray-900">${fmt(boveda?.saldoEfectivo ?? 0)}</p>
          <div className="flex items-center gap-1 mt-1">
            <span className={`w-2 h-2 rounded-full ${bovedaAbierta ? 'bg-green-500' : 'bg-gray-300'}`} />
            <p className="text-xs text-gray-400">{bovedaAbierta ? 'Abierta' : 'Cerrada'}</p>
          </div>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">💵 Ventanillas abiertas</p>
          <p className="text-xl font-bold text-gray-900">{ventanillas.length}</p>
          <p className="text-xs text-gray-400 mt-1">
            ${fmt(ventanillas.reduce((a, v) => a + v.saldoEfectivo, 0))} en ventanillas
          </p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-xs text-gray-500 mb-1">📊 Total en efectivo</p>
          <p className="text-xl font-bold text-gray-900">${fmt(totalGeneral)}</p>
          <p className="text-xs text-gray-400 mt-1">Bóveda + todas las ventanillas</p>
        </div>
      </div>

      {/* Acciones bóveda */}
      <div className="flex gap-2 mb-6">
        {!bovedaAbierta ? (
          <button onClick={() => setShowAbrirBoveda(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            Abrir bóveda
          </button>
        ) : (
          <>
            <button onClick={() => { setMontoModal(''); setErrorModal(''); setShowIngresarBoveda(true) }}
              className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
              Ingresar fondos
            </button>
            <button onClick={() => { if (confirm('¿Cerrar la bóveda?')) accion({ accion: 'cerrar_boveda' }) }}
              disabled={procesando}
              className="bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50 transition-colors">
              Cerrar bóveda
            </button>
          </>
        )}
      </div>

      {/* Ventanillas abiertas */}
      {ventanillas.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Ventanillas abiertas</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {ventanillas.map(v => (
              <div key={v.id} className="bg-white rounded-xl border border-green-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold text-gray-900">Ventanilla {v.numeroCaja}</p>
                  <span className="w-2 h-2 rounded-full bg-green-500" />
                </div>
                <p className="text-lg font-bold text-gray-900">${fmt(v.saldoEfectivo)}</p>
                {v.fechaApertura && <p className="text-xs text-gray-400 mt-1">Desde {hora(v.fechaApertura)}</p>}
                <button
                  onClick={() => { if (confirm(`¿Forzar cierre de ventanilla ${v.numeroCaja}?`)) accion({ accion: 'cerrar', cajaId: v.id }) }}
                  className="mt-3 text-xs text-red-400 hover:text-red-600 transition-colors">
                  Forzar cierre
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos de la bóveda */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Movimientos de la bóveda</h2>
          <ExportButtons filenameBase="caja_boveda" titulo="Movimientos de la bóveda"
            sections={[{ columns: MOV_CAJA_COLS, rows: movBoveda }]} />
        </div>
        <MovimientosTabla movimientos={movBoveda} />
      </div>

      {/* Modal abrir bóveda */}
      {showAbrirBoveda && (
        <Modal titulo="Abrir bóveda" onClose={() => { setShowAbrirBoveda(false); setErrorModal('') }}>
          <label className="block text-xs font-medium text-gray-700 mb-1">Capital inicial ($)</label>
          <input type="number" min="0" step="0.01" autoFocus value={montoModal}
            onChange={e => setMontoModal(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="0.00" />
          {errorModal && <p className="text-red-500 text-xs mt-2">{errorModal}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => { setShowAbrirBoveda(false); setErrorModal('') }}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button disabled={procesando} onClick={() => accion({ accion: 'abrir_boveda', monto: parseFloat(montoModal) || 0 })}
              className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
              {procesando ? 'Abriendo...' : 'Abrir bóveda'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal ingresar fondos a la bóveda */}
      {showIngresarBoveda && (
        <Modal titulo="Ingresar fondos a la bóveda" onClose={() => { setShowIngresarBoveda(false); setErrorModal('') }}>
          <p className="text-xs text-gray-500 mb-3">Suma efectivo al fondo del banco sin cerrar la bóveda.</p>
          <label className="block text-xs font-medium text-gray-700 mb-1">Monto a ingresar ($)</label>
          <input type="number" min="0" step="0.01" autoFocus value={montoModal}
            onChange={e => setMontoModal(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-green-500"
            placeholder="0.00" />
          {errorModal && <p className="text-red-500 text-xs mt-2">{errorModal}</p>}
          <div className="flex gap-2 mt-4">
            <button type="button" onClick={() => { setShowIngresarBoveda(false); setErrorModal('') }}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
            <button disabled={procesando} onClick={() => accion({ accion: 'ingresar_boveda', monto: parseFloat(montoModal) || 0 })}
              className="flex-1 bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              {procesando ? 'Ingresando...' : 'Ingresar fondos'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

function MovimientosTabla({ movimientos }: { movimientos: Movimiento[] }) {
  if (movimientos.length === 0)
    return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400 text-sm">Sin movimientos.</div>
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">Hora</th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">Tipo</th>
            <th className="text-left px-4 py-3 text-gray-600 font-medium">Concepto</th>
            <th className="text-right px-4 py-3 text-gray-600 font-medium">Monto</th>
            <th className="text-right px-4 py-3 text-gray-600 font-medium">Saldo</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {movimientos.map(m => (
            <tr key={m.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 text-gray-400 font-mono text-xs">{hora(m.createdAt)}</td>
              <td className={`px-4 py-3 font-medium ${TIPO_COLOR[m.tipo] ?? 'text-gray-600'}`}>{TIPO_LABEL[m.tipo] ?? m.tipo}</td>
              <td className="px-4 py-3 text-gray-500">{m.concepto || '—'}</td>
              <td className={`px-4 py-3 text-right font-mono font-medium ${TIPO_COLOR[m.tipo] ?? 'text-gray-600'}`}>
                {TIPO_SIGNO[m.tipo] ?? ''}${fmt(Math.abs(m.monto))}
              </td>
              <td className="px-4 py-3 text-right font-mono text-gray-700">${fmt(m.saldoPosterior)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Modal({ titulo, children, onClose }: { titulo: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900">{titulo}</h2>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}
