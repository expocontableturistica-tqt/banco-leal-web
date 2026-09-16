'use client'

import { useEffect, useState } from 'react'

interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }
interface Empresa { id: number; razonSocial: string; nombreFantasia: string; numeroEmpresa: string }
interface Cuenta { id: number; empresaId: number | null; socioId: number | null; tipo: string; alias: string; saldo: number; estado: string }
interface CajaInfo { estado: 'abierta' | 'cerrada'; saldoEfectivo: number; userId: string | null; numeroCaja: number | null }

type Destinatario = 'socio' | 'empresa'
type Metodo = 'extraccion' | 'efectivo' | 'cuenta' | 'qr'

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

export default function CajeroPage() {
  const [socios, setSocios] = useState<Socio[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [cajaInfo, setCajaInfo] = useState<CajaInfo | null>(null)
  const [loading, setLoading] = useState(true)

  const [destinatario, setDestinatario] = useState<Destinatario>('socio')
  const [socioId, setSocioId] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [metodo, setMetodo] = useState<Metodo>('extraccion')
  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('')

  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string; qrDataUrl?: string } | null>(null)

  async function fetchData() {
    setLoading(true)
    const [s, e, c, caja] = await Promise.all([
      fetch('/api/socios').then(r => r.json()),
      fetch('/api/empresas').then(r => r.json()),
      fetch('/api/cuentas').then(r => r.json()),
      fetch('/api/caja').then(r => r.json()),
    ])
    setSocios(Array.isArray(s) ? s : [])
    setEmpresas(Array.isArray(e) ? e : [])
    setCuentas(Array.isArray(c) ? c : [])
    // Cajero: su ventanilla. Admin: su ventanilla si abrió una, si no la bóveda.
    setCajaInfo(caja?.caja ?? caja?.miCaja ?? (caja?.boveda?.id ? caja.boveda : null))
    setLoading(false)
  }

  useEffect(() => { fetchData() }, [])

  const cuentasEmpresa = cuentas.filter(c =>
    c.empresaId === parseInt(empresaId) && c.estado === 'activa'
  )
  const cuentasSocio = cuentas.filter(c =>
    c.socioId === parseInt(socioId) && c.estado === 'activa'
  )
  const cuentasTitular = destinatario === 'empresa' ? cuentasEmpresa : cuentasSocio
  const cuentaSel = cuentasTitular.find(c => c.id === parseInt(cuentaId))
  const titularElegido = destinatario === 'socio' ? !!socioId : !!empresaId
  const cajaAbierta = cajaInfo?.estado === 'abierta'
  const nombreCaja = cajaInfo && !cajaInfo.userId ? 'Bóveda' : `Caja${cajaInfo?.numeroCaja ? ` ${cajaInfo.numeroCaja}` : ''}`

  // Resetear metodo/cuenta al cambiar destinatario
  function cambiarDestinatario(d: Destinatario) {
    setDestinatario(d)
    setMetodo('extraccion')
    setCuentaId('')
    setSocioId('')
    setEmpresaId('')
    setResultado(null)
  }

  function nombreTitular() {
    return destinatario === 'socio'
      ? socios.find(s => s.id === parseInt(socioId))?.apellido
      : empresas.find(emp => emp.id === parseInt(empresaId))?.razonSocial
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    setResultado(null)

    const m = parseFloat(monto)
    if (!m || m <= 0) {
      setResultado({ ok: false, mensaje: 'Ingresá un monto válido' })
      setEnviando(false)
      return
    }
    if ((metodo === 'extraccion' || metodo === 'efectivo') && !cajaAbierta) {
      setResultado({ ok: false, mensaje: 'La caja está cerrada. Abrila antes de entregar efectivo.' })
      setEnviando(false)
      return
    }

    try {
      if (metodo === 'extraccion') {
        const res = await fetch('/api/caja', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accion: 'extraccion', cuentaId: parseInt(cuentaId), monto: m, concepto }),
        })
        const data = await res.json()
        if (res.ok) {
          setCajaInfo(prev => prev ? { ...prev, saldoEfectivo: data.saldoEfectivo } : null)
          setCuentas(prev => prev.map(c => c.id === parseInt(cuentaId) ? { ...c, saldo: data.saldoCuenta } : c))
          setResultado({ ok: true, mensaje: `Extracción registrada: entregá $${fmt(m)} en efectivo. Saldo de la cuenta: $${fmt(data.saldoCuenta)} · Efectivo en caja: $${fmt(data.saldoEfectivo)}` })
        } else {
          setResultado({ ok: false, mensaje: data.error || 'Error al registrar la extracción' })
        }
      }

      if (metodo === 'efectivo') {
        const res = await fetch('/api/caja', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'movimiento',
            tipo: 'egreso',
            monto: m,
            concepto: concepto || `Entrega efectivo a ${nombreTitular()}`,
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setCajaInfo(prev => prev ? { ...prev, saldoEfectivo: data.saldoEfectivo } : null)
          setResultado({ ok: true, mensaje: `Efectivo entregado. Nuevo saldo de caja: $${fmt(data.saldoEfectivo)}` })
        } else {
          setResultado({ ok: false, mensaje: data.error || 'Error al registrar egreso' })
        }
      }

      if (metodo === 'cuenta') {
        const res = await fetch('/api/cuentas', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'acreditar',
            id: parseInt(cuentaId),
            monto: m,
            concepto: concepto || 'Acreditación desde cajero',
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setCuentas(prev => prev.map(c => c.id === parseInt(cuentaId) ? { ...c, saldo: data.saldo } : c))
          setResultado({ ok: true, mensaje: `Cuenta acreditada. Nuevo saldo: $${fmt(data.saldo)}` })
        } else {
          setResultado({ ok: false, mensaje: data.error || 'Error al acreditar cuenta' })
        }
      }

      if (metodo === 'qr') {
        const res = await fetch('/api/qr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accion: 'generar',
            monto: m,
            socioId: parseInt(socioId),
          }),
        })
        const data = await res.json()
        if (res.ok) {
          setCajaInfo(prev => prev ? { ...prev, saldoEfectivo: data.saldoEfectivo } : null)
          setResultado({ ok: true, mensaje: `QR generado por $${fmt(m)} (ya descontado de la caja: quedan $${fmt(data.saldoEfectivo)}). Mostralo al socio para escanearlo con MediaPago; vence en 24 horas.`, qrDataUrl: data.dataUrl })
        } else {
          setResultado({ ok: false, mensaje: data.error || 'Error al generar QR' })
        }
      }
    } catch {
      setResultado({ ok: false, mensaje: 'Error de conexión' })
    }
    setEnviando(false)
  }

  function resetForm() {
    setMonto('')
    setConcepto('')
    setCuentaId('')
    setResultado(null)
  }

  if (loading) return <p className="text-gray-500 text-sm">Cargando...</p>

  const opcionMetodo = (valor: Metodo, texto: React.ReactNode, deshabilitado = false) => (
    <label className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors ${
      metodo === valor ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
    } ${deshabilitado ? 'opacity-40 cursor-not-allowed' : ''}`}>
      <input type="radio" className="hidden" disabled={deshabilitado} checked={metodo === valor}
        onChange={() => { setMetodo(valor); if (valor === 'qr' || valor === 'efectivo') setCuentaId('') }} />
      {texto}
    </label>
  )

  return (
    <div className="max-w-xl">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Cajero</h1>
        <div className="flex items-center gap-2">
          <span className={`inline-block w-2 h-2 rounded-full ${cajaAbierta ? 'bg-green-500' : 'bg-red-400'}`} />
          <p className="text-sm text-gray-500">
            {nombreCaja} {cajaAbierta ? 'abierta' : 'cerrada'}
            {cajaAbierta && cajaInfo && (
              <> · Efectivo: <span className="font-medium text-gray-700">${fmt(cajaInfo.saldoEfectivo)}</span></>
            )}
          </p>
        </div>
      </div>

      {resultado ? (
        /* Pantalla de resultado */
        <div className={`rounded-xl border p-6 text-center ${resultado.ok ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
          <p className="text-2xl mb-3">{resultado.ok ? '✅' : '❌'}</p>
          <p className={`text-sm font-medium mb-4 ${resultado.ok ? 'text-green-800' : 'text-red-700'}`}>{resultado.mensaje}</p>
          {resultado.qrDataUrl && (
            <div className="flex justify-center mb-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resultado.qrDataUrl} alt="QR MediaPago" className="w-48 h-48 border rounded-lg" />
            </div>
          )}
          <button
            onClick={resetForm}
            className="bg-gray-900 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors"
          >
            Nueva operación
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
          {/* Paso 1: destinatario */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1. Titular</p>
            <div className="grid grid-cols-2 gap-2">
              {(['socio', 'empresa'] as const).map(d => (
                <label key={d} className={`flex items-center gap-2 border rounded-lg px-3 py-2.5 cursor-pointer text-sm transition-colors ${
                  destinatario === d ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}>
                  <input type="radio" className="hidden" checked={destinatario === d} onChange={() => cambiarDestinatario(d)} />
                  {d === 'socio' ? '👤 Socio' : '🏢 Empresa'}
                </label>
              ))}
            </div>
          </div>

          {/* Select titular */}
          <div>
            {destinatario === 'socio' ? (
              <>
                <label className="block text-xs font-medium text-gray-700 mb-1">Socio *</label>
                <select
                  required
                  value={socioId}
                  onChange={e => { setSocioId(e.target.value); setCuentaId('') }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar socio...</option>
                  {socios.map(s => (
                    <option key={s.id} value={s.id}>{s.apellido}, {s.nombre} — {s.numeroSocio}</option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label className="block text-xs font-medium text-gray-700 mb-1">Empresa *</label>
                <select
                  required
                  value={empresaId}
                  onChange={e => { setEmpresaId(e.target.value); setCuentaId('') }}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar empresa...</option>
                  {empresas.map(e => (
                    <option key={e.id} value={e.id}>{e.nombreFantasia || e.razonSocial} — {e.numeroEmpresa}</option>
                  ))}
                </select>
              </>
            )}
          </div>

          {/* Paso 2: operación */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">2. Operación</p>
            <div className="grid gap-2">
              {opcionMetodo('extraccion', <>💸 Extracción: efectivo que se descuenta de su cuenta {!cajaAbierta && <span className="text-xs text-red-400 ml-1">(caja cerrada)</span>}</>)}
              {opcionMetodo('efectivo', <>💵 Entrega de efectivo del banco <span className="text-xs text-gray-400">(no descuenta de ninguna cuenta)</span> {!cajaAbierta && <span className="text-xs text-red-400 ml-1">(caja cerrada)</span>}</>)}
              {opcionMetodo('cuenta', <>🏦 Acreditar en su cuenta bancaria</>, !titularElegido)}
              {destinatario === 'socio' && opcionMetodo('qr', <>📱 QR MediaPago <span className="text-xs text-gray-400">(sale de la caja)</span></>)}
            </div>
          </div>

          {/* Select cuenta si la operación usa la cuenta */}
          {(metodo === 'cuenta' || metodo === 'extraccion') && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {metodo === 'extraccion' ? 'Cuenta de la que retira *' : 'Cuenta destino *'}
              </label>
              {!titularElegido ? (
                <p className="text-xs text-gray-400">Elegí primero el {destinatario}.</p>
              ) : cuentasTitular.length === 0 ? (
                <p className="text-xs text-red-500">No hay cuentas activas para este {destinatario}.</p>
              ) : (
                <select
                  required
                  value={cuentaId}
                  onChange={e => setCuentaId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Seleccionar cuenta...</option>
                  {cuentasTitular.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.tipo} — {c.alias} · Saldo: ${fmt(c.saldo)}
                    </option>
                  ))}
                </select>
              )}
              {metodo === 'extraccion' && cuentaSel && (
                <p className="text-xs text-gray-500 mt-1">
                  Puede retirar hasta ${fmt(Math.min(cuentaSel.saldo, cajaInfo?.saldoEfectivo ?? 0))}
                  {cajaInfo && cuentaSel.saldo > cajaInfo.saldoEfectivo ? ' (límite: efectivo en caja)' : ''}.
                </p>
              )}
            </div>
          )}

          {/* Paso 3: monto y concepto */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">3. Importe</p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monto ($) *</label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={monto}
                  onChange={e => setMonto(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Concepto <span className="text-gray-400">(opcional)</span></label>
                <input
                  type="text"
                  value={concepto}
                  onChange={e => setConcepto(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={metodo === 'extraccion' ? 'Ej: Retiro para cambio' : 'Ej: Entrega de capital inicial'}
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={enviando}
            className="w-full bg-blue-600 text-white rounded-lg px-4 py-3 text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {enviando ? 'Procesando...' : 'Confirmar operación'}
          </button>
        </form>
      )}
    </div>
  )
}
