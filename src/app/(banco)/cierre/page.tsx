'use client'

import { useEffect, useState, useCallback } from 'react'

interface ResumenCierre {
  fecha: string
  ultimoCierre: string | null
  cuentas: {
    creditos: { monto: number; cantidad: number }
    debitos:  { monto: number; cantidad: number }
  }
  caja: {
    ingresos: { monto: number; cantidad: number }
    egresos:  { monto: number; cantidad: number }
  }
  servicios: { monto: number; cantidad: number }
  cambio: {
    ventas:  { montoARS: number; cantidad: number }
    compras: { montoARS: number; cantidad: number }
  }
  prestaciones: { tipo: string; cantidad: number }[]
  cajaActual: {
    bovedaAbierta: boolean
    bovedaSaldo: number
    ventanillas: { id: number; numeroCaja: number | null; saldoEfectivo: number }[]
  }
}

const TIPO_PREST: Record<string, string> = {
  banco_tarjeta:   'Tarjeta',
  banco_prestamo:  'Préstamo',
  banco_seguro:    'Seguro',
  banco_limite:    'Límite',
  banco_bono:      'Bono',
  banco_inversion: 'Inversión',
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtFechaHora(iso: string) {
  return new Date(iso).toLocaleString('es-AR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function Fila({ label, cantidad, monto, color }: {
  label: string; cantidad: number; monto: number; color?: string
}) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="text-right">
        <span className={`text-sm font-semibold font-mono ${color ?? 'text-gray-900'}`}>
          ${fmt(monto)}
        </span>
        {cantidad > 0 && (
          <span className="ml-2 text-xs text-gray-400">({cantidad} mov.)</span>
        )}
      </div>
    </div>
  )
}

export default function CierrePage() {
  const [data, setData] = useState<ResumenCierre | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [accionando, setAccionando] = useState('')
  const [cierreRegistrado, setCierreRegistrado] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    const r = await fetch('/api/cierre')
    const json = await r.json()
    if (!r.ok) { setError(json.error ?? 'Error'); setLoading(false); return }
    setData(json)
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  async function accion(tipo: string) {
    setAccionando(tipo); setError('')
    const res = await fetch('/api/cierre', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion: tipo }),
    })
    const json = await res.json()
    if (!res.ok) { setError(json.error ?? 'Error'); setAccionando(''); return }
    if (tipo === 'registrar') setCierreRegistrado(true)
    setAccionando('')
    fetchData()
  }

  if (loading) return <p className="text-gray-400 text-sm">Cargando resumen...</p>
  if (error && !data) return <p className="text-red-500 text-sm">{error}</p>
  if (!data) return null

  const ventanillasAbiertas = data.cajaActual.ventanillas.length
  const todoCerrado = !data.cajaActual.bovedaAbierta && ventanillasAbiertas === 0

  const netoCuentas = data.cuentas.creditos.monto - data.cuentas.debitos.monto
  const netoCambio  = data.cambio.ventas.montoARS - data.cambio.compras.montoARS

  return (
    <div className="max-w-4xl">
      {/* Encabezado */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Cierre del Día</h1>
          <p className="text-sm text-gray-500">{fmtFechaHora(data.fecha)}</p>
          {data.ultimoCierre && (
            <p className="text-xs text-gray-400 mt-0.5">
              Último cierre: {fmtFechaHora(data.ultimoCierre)}
            </p>
          )}
        </div>
        <button onClick={fetchData}
          className="text-xs text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors">
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {/* Cuentas */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Movimientos de cuentas</p>
          <Fila label="Créditos (ingresos)" cantidad={data.cuentas.creditos.cantidad} monto={data.cuentas.creditos.monto} color="text-green-600" />
          <Fila label="Débitos (egresos)"   cantidad={data.cuentas.debitos.cantidad}  monto={data.cuentas.debitos.monto}  color="text-red-500" />
          <div className="flex justify-between pt-2 mt-1">
            <span className="text-sm font-semibold text-gray-700">Neto</span>
            <span className={`text-sm font-bold font-mono ${netoCuentas >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {netoCuentas >= 0 ? '+' : ''}${fmt(netoCuentas)}
            </span>
          </div>
        </div>

        {/* Caja */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Movimientos de caja</p>
          <Fila label="Ingresos de efectivo" cantidad={data.caja.ingresos.cantidad} monto={data.caja.ingresos.monto} color="text-green-600" />
          <Fila label="Egresos de efectivo"  cantidad={data.caja.egresos.cantidad}  monto={data.caja.egresos.monto}  color="text-red-500" />
          <div className="flex justify-between pt-2 mt-1">
            <span className="text-sm font-semibold text-gray-700">Neto efectivo</span>
            <span className={`text-sm font-bold font-mono ${(data.caja.ingresos.monto - data.caja.egresos.monto) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {(data.caja.ingresos.monto - data.caja.egresos.monto) >= 0 ? '+' : ''}${fmt(data.caja.ingresos.monto - data.caja.egresos.monto)}
            </span>
          </div>
        </div>

        {/* Servicios + Prestaciones */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Servicios cobrados</p>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Total cobrado</span>
            <div className="text-right">
              <span className="text-sm font-semibold font-mono text-green-600">${fmt(data.servicios.monto)}</span>
              {data.servicios.cantidad > 0 && (
                <span className="ml-2 text-xs text-gray-400">({data.servicios.cantidad} pagos)</span>
              )}
            </div>
          </div>

          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mt-4 mb-3">Prestaciones emitidas</p>
          {data.prestaciones.length === 0 ? (
            <p className="text-sm text-gray-400">Sin prestaciones hoy.</p>
          ) : (
            data.prestaciones.map(p => (
              <div key={p.tipo} className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-600">{TIPO_PREST[p.tipo] ?? p.tipo}</span>
                <span className="text-sm font-semibold text-gray-900">{p.cantidad}</span>
              </div>
            ))
          )}
        </div>

        {/* Mesa de Cambio */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Mesa de Cambio</p>
          <Fila label="Ventas de divisas (ARS cobrados)" cantidad={data.cambio.ventas.cantidad}  monto={data.cambio.ventas.montoARS}  color="text-green-600" />
          <Fila label="Compras de divisas (ARS pagados)" cantidad={data.cambio.compras.cantidad} monto={data.cambio.compras.montoARS} color="text-red-500" />
          <div className="flex justify-between pt-2 mt-1">
            <span className="text-sm font-semibold text-gray-700">Neto ARS cambio</span>
            <span className={`text-sm font-bold font-mono ${netoCambio >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {netoCambio >= 0 ? '+' : ''}${fmt(netoCambio)}
            </span>
          </div>
        </div>
      </div>

      {/* Estado de caja + Acciones */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4">Estado de caja al cierre</p>

        {/* Ventanillas */}
        <div className="space-y-2 mb-4">
          {ventanillasAbiertas > 0 ? (
            data.cajaActual.ventanillas.map(v => (
              <div key={v.id} className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                  <span className="text-sm text-amber-800 font-medium">Ventanilla {v.numeroCaja} — abierta</span>
                </div>
                <span className="font-mono text-sm font-semibold text-amber-800">${fmt(v.saldoEfectivo)}</span>
              </div>
            ))
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Todas las ventanillas están cerradas
            </div>
          )}

          {data.cajaActual.bovedaAbierta ? (
            <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
                <span className="text-sm text-amber-800 font-medium">Bóveda — abierta</span>
              </div>
              <span className="font-mono text-sm font-semibold text-amber-800">${fmt(data.cajaActual.bovedaSaldo)}</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
              Bóveda cerrada
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-xs mb-3">{error}</p>}

        {/* Acciones de cierre */}
        <div className="flex flex-wrap gap-3">
          {ventanillasAbiertas > 0 && (
            <button onClick={() => accion('cerrar_ventanillas')}
              disabled={accionando !== ''}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
              {accionando === 'cerrar_ventanillas' ? 'Cerrando...' : `Cerrar ${ventanillasAbiertas} ventanilla${ventanillasAbiertas > 1 ? 's' : ''}`}
            </button>
          )}

          {data.cajaActual.bovedaAbierta && ventanillasAbiertas === 0 && (
            <button onClick={() => accion('cerrar_boveda')}
              disabled={accionando !== ''}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50 transition-colors">
              {accionando === 'cerrar_boveda' ? 'Cerrando...' : 'Cerrar bóveda'}
            </button>
          )}

          {todoCerrado && !cierreRegistrado && (
            <button onClick={() => accion('registrar')}
              disabled={accionando !== ''}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50 transition-colors">
              {accionando === 'registrar' ? 'Registrando...' : 'Registrar cierre del día'}
            </button>
          )}

          {(todoCerrado && cierreRegistrado) && (
            <div className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 font-semibold">
              ✓ Cierre del día registrado
            </div>
          )}

          {!todoCerrado && ventanillasAbiertas === 0 && data.cajaActual.bovedaAbierta && (
            <p className="text-xs text-gray-500 self-center">Cerrá la bóveda antes de registrar el cierre.</p>
          )}

          {ventanillasAbiertas > 0 && (
            <p className="text-xs text-gray-500 self-center">Cerrá todas las ventanillas antes de continuar.</p>
          )}
        </div>
      </div>
    </div>
  )
}
