'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface DashboardData {
  socios: number
  empresas: number
  cuentasActivas: number
  saldoEnCuentas: number
  caja: {
    bovedaAbierta: boolean
    bovedaSaldo: number
    ventanillas: number
    totalEfectivo: number
  }
  hoy: {
    movCaja: number
    egresosCaja: number
    ingresosCaja: number
    movCuenta: number
    prestaciones: number
    qrMediaPago: number
  }
  ultimosMovimientos: {
    id: number
    tipo: string
    monto: number
    concepto: string
    createdAt: string
  }[]
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}

export default function DashboardPage() {
  const { data: session } = useSession()
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState('')

  const role = (session?.user as { role?: string })?.role

  useEffect(() => {
    fetch('/api/dashboard')
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('No se pudo cargar el dashboard'))
  }, [])

  if (error) return <p className="text-red-500 text-sm">{error}</p>

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Inicio</h1>
      <p className="text-sm text-gray-500 mb-6">Resumen del día</p>

      {/* Tarjetas principales */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon="👥" label="Socios" value={data ? String(data.socios) : '—'} />
        <StatCard icon="🏢" label="Empresas" value={data ? String(data.empresas) : '—'} />
        <StatCard icon="🏦" label="Cuentas activas" value={data ? String(data.cuentasActivas) : '—'} />
        <StatCard
          icon="💰"
          label="Saldo en cuentas"
          value={data ? `$${fmt(data.saldoEnCuentas)}` : '—'}
          mono
        />
      </div>

      {/* Caja y actividad del día */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Estado de caja */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Estado de caja</p>
          {data ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Bóveda</span>
                <span className={`font-medium ${data.caja.bovedaAbierta ? 'text-green-600' : 'text-gray-400'}`}>
                  {data.caja.bovedaAbierta ? `$${fmt(data.caja.bovedaSaldo)}` : 'Cerrada'}
                </span>
              </div>
              {role === 'admin' && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Ventanillas abiertas</span>
                  <span className="font-medium text-gray-900">{data.caja.ventanillas}</span>
                </div>
              )}
              <div className="border-t border-gray-100 pt-2 flex justify-between text-sm font-semibold">
                <span className="text-gray-700">Total efectivo</span>
                <span className="text-gray-900 font-mono">${fmt(data.caja.totalEfectivo)}</span>
              </div>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Cargando...</p>
          )}
        </div>

        {/* Actividad hoy */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 md:col-span-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Actividad de hoy</p>
          {data ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <MiniStat label="Mov. en cuentas" value={data.hoy.movCuenta} />
              <MiniStat label="Ingresos caja" value={`$${fmt(data.hoy.ingresosCaja)}`} />
              <MiniStat label="Egresos caja" value={`$${fmt(data.hoy.egresosCaja)}`} />
              <MiniStat label="Mov. caja" value={data.hoy.movCaja} />
              <MiniStat label="Prestaciones" value={data.hoy.prestaciones} />
              <MiniStat label="QR MediaPago" value={data.hoy.qrMediaPago} />
            </div>
          ) : (
            <p className="text-gray-400 text-sm">Cargando...</p>
          )}
        </div>
      </div>

      {/* Últimos movimientos de cuentas */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-700">Últimos movimientos en cuentas (hoy)</p>
          {data && <p className="text-xs text-gray-400">{data.ultimosMovimientos.length} registros</p>}
        </div>
        {!data ? (
          <p className="text-gray-400 text-sm p-5">Cargando...</p>
        ) : data.ultimosMovimientos.length === 0 ? (
          <p className="text-gray-400 text-sm p-5 text-center">Sin movimientos hoy.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Hora</th>
                <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Tipo</th>
                <th className="text-left px-5 py-2 text-xs text-gray-500 font-medium">Concepto</th>
                <th className="text-right px-5 py-2 text-xs text-gray-500 font-medium">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {data.ultimosMovimientos.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-5 py-2 text-xs text-gray-400 font-mono">{fmtHora(m.createdAt)}</td>
                  <td className="px-5 py-2">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      m.tipo === 'credito' ? 'bg-green-100 text-green-700' :
                      m.tipo === 'debito' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {m.tipo}
                    </span>
                  </td>
                  <td className="px-5 py-2 text-gray-600">{m.concepto || '—'}</td>
                  <td className={`px-5 py-2 text-right font-mono font-medium ${
                    m.tipo === 'credito' ? 'text-green-600' : 'text-red-500'
                  }`}>
                    {m.tipo === 'debito' ? '−' : '+'}${fmt(m.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, mono }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-xl mb-1">{icon}</div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-lg font-bold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  )
}
