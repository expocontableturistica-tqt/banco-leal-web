'use client'
import { useEffect, useState } from 'react'
import ExportButtons from '@/components/ExportButtons'

interface Empresa { id: number; razonSocial: string; numeroEmpresa: string }
interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }
interface Cuenta { id: number; empresaId: number | null; socioId: number | null; tipo: string; alias: string; saldo: number; estado: string }
interface Entrega { cuenta: number; efectivo: number; qr: number; tieneQr: boolean }
interface Prestamo {
  id: number; empresaId: number | null; socioId: number | null; cuentaId: number | null; monto: number
  saldoPendiente: number; concepto: string; estado: string
  createdAt: string; titular: string; numeroSocio: string | null; cbu: string | null
  cuotas: number; cuotasPagadas: number; montoCuota: number | null
  entrega: Entrega
}
interface Boveda { estado: 'abierta' | 'cerrada'; saldoEfectivo: number }

type Destinatario = 'empresa' | 'socio'
type Forma = 'cuenta' | 'efectivo' | 'qr'

const OPCIONES_CUOTAS = [1, 3, 6, 12, 24]
const FORMAS: { key: Forma; label: string; corto: string; icon: string }[] = [
  { key: 'cuenta', label: 'Depósito en cuenta', corto: 'Cuenta', icon: '🏦' },
  { key: 'efectivo', label: 'Efectivo', corto: 'Efectivo', icon: '💵' },
  { key: 'qr', label: 'QR MediaPago', corto: 'QR', icon: '📱' },
]

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function r2(n: number) {
  return Math.round(n * 100) / 100
}

function num(s: string) {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function resumenEntrega(e: Entrega) {
  return FORMAS.filter(f => e[f.key] > 0).map(f => `${f.icon} $${fmt(e[f.key])}`).join(' · ')
}

export default function PrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [boveda, setBoveda] = useState<Boveda | null>(null)
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Form otorgar
  const [destinatario, setDestinatario] = useState<Destinatario>('empresa')
  const [titularId, setTitularId] = useState('')
  const [cuentaId, setCuentaId] = useState('')
  const [monto, setMonto] = useState('')
  const [cuotas, setCuotas] = useState('1')
  const [concepto, setConcepto] = useState('Préstamo inicial expo')
  // Entrega: con formaUnica todo el monto va por esa vía; si no, se reparte a mano
  const [formaUnica, setFormaUnica] = useState<Forma | null>('cuenta')
  const [partes, setPartes] = useState<Record<Forma, string>>({ cuenta: '', efectivo: '', qr: '' })
  const [enviando, setEnviando] = useState(false)

  // Form pago
  const [pagoPrestamoId, setPagoPrestamoId] = useState('')
  const [montoPago, setMontoPago] = useState('')
  const [formaPago, setFormaPago] = useState<'cuenta' | 'efectivo'>('cuenta')

  // QR para mostrar (recién otorgado o desde la tabla)
  const [qr, setQr] = useState<{ dataUrl: string; titulo: string; detalle: string } | null>(null)

  async function cargar() {
    setLoading(true)
    const [p, e, s, c, cj] = await Promise.all([
      fetch('/api/prestamos').then(r => r.json()),
      fetch('/api/empresas').then(r => r.json()),
      fetch('/api/socios').then(r => r.json()),
      fetch('/api/cuentas').then(r => r.json()),
      fetch('/api/caja').then(r => r.json()),
    ])
    setPrestamos(Array.isArray(p) ? p : [])
    setEmpresas(Array.isArray(e) ? e : [])
    setSocios(Array.isArray(s) ? s : [])
    setCuentas(Array.isArray(c) ? c : [])
    setBoveda(cj?.boveda ?? null)
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  const cuentasTitular = cuentas.filter(c =>
    c.estado === 'activa' && titularId !== '' &&
    (destinatario === 'empresa' ? c.empresaId : c.socioId) === parseInt(titularId)
  )
  const cuentaElegida = cuentasTitular.find(c => c.id === parseInt(cuentaId)) ?? cuentasTitular[0]

  const montoNum = num(monto)
  const valores: Record<Forma, number> = formaUnica
    ? { cuenta: 0, efectivo: 0, qr: 0, [formaUnica]: montoNum }
    : { cuenta: num(partes.cuenta), efectivo: num(partes.efectivo), qr: num(partes.qr) }
  const asignado = r2(valores.cuenta + valores.efectivo + valores.qr)
  const diferencia = r2(montoNum - asignado)
  const faltaCuenta = valores.cuenta > 0 && !cuentaElegida
  const puedeOtorgar = !!titularId && montoNum > 0 && Math.abs(diferencia) < 0.01 && !faltaCuenta

  const montoCuotaPreview = montoNum && cuotas ? r2(montoNum / parseInt(cuotas)) : null

  function cambiarDestinatario(d: Destinatario) {
    setDestinatario(d)
    setTitularId('')
    setCuentaId('')
  }

  function editarParte(f: Forma, valor: string) {
    const actuales: Record<Forma, string> = formaUnica
      ? { cuenta: '', efectivo: '', qr: '', [formaUnica]: monto }
      : partes
    setPartes({ ...actuales, [f]: valor })
    setFormaUnica(null)
  }

  // Pone en esta forma lo que falta para llegar al monto total
  function completarCon(f: Forma) {
    const nuevo = r2(valores[f] + diferencia)
    editarParte(f, nuevo > 0 ? String(nuevo) : '')
  }

  async function otorgar(e: React.FormEvent) {
    e.preventDefault()
    if (!puedeOtorgar) return
    setEnviando(true)
    const res = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'otorgar',
        destinatario,
        [destinatario === 'empresa' ? 'empresaId' : 'socioId']: parseInt(titularId),
        cuentaId: cuentaElegida?.id,
        monto: montoNum,
        cuotas: parseInt(cuotas),
        concepto,
        entrega: valores,
      }),
    })
    const data = await res.json()
    if (res.ok) {
      const c = parseInt(cuotas)
      const avisoEfectivo = valores.efectivo > 0 ? ` Entregá $${fmt(valores.efectivo)} en efectivo.` : ''
      setMsg(`Préstamo otorgado: $${fmt(montoNum)} en ${c} cuota${c > 1 ? 's' : ''} de $${montoCuotaPreview ? fmt(montoCuotaPreview) : ''} · Entrega: ${resumenEntrega({ ...valores, tieneQr: false })}.${avisoEfectivo}`)
      if (data.qrDataUrl) {
        setQr({
          dataUrl: data.qrDataUrl,
          titulo: `Préstamo #${data.id} — $${fmt(valores.qr)} por MediaPago`,
          detalle: 'Mostrale este QR al titular para que lo escanee con MediaPago. Vence en 24 horas.',
        })
      }
      setMonto('')
      setTitularId('')
      setCuentaId('')
      setCuotas('1')
      setFormaUnica('cuenta')
      setPartes({ cuenta: '', efectivo: '', qr: '' })
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setEnviando(false)
  }

  async function verQr(p: Prestamo) {
    const res = await fetch(`/api/prestamos?qr=${p.id}`)
    const data = await res.json()
    if (!res.ok) { setMsg('Error: ' + data.error); return }
    setQr({
      dataUrl: data.dataUrl,
      titulo: `Préstamo #${p.id} — ${p.titular} — $${fmt(data.monto)} por MediaPago`,
      detalle: data.vencido
        ? 'Este QR ya venció (dura 24 horas): MediaPago no lo va a aceptar.'
        : `Válido hasta ${new Date(data.venceTs * 1000).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}.`,
    })
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const res = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pagar', prestamoId: parseInt(pagoPrestamoId), monto: parseFloat(montoPago), forma: formaPago }),
    })
    const data = await res.json()
    if (res.ok) {
      setMsg(`Pago registrado${formaPago === 'efectivo' ? ' en efectivo' : ''}. Saldo pendiente: $${fmt(data.nuevoSaldoPendiente)}`)
      setPagoPrestamoId('')
      setMontoPago('')
      cargar()
    } else {
      setMsg('Error: ' + data.error)
    }
    setEnviando(false)
  }

  // Al seleccionar un préstamo vigente, pre-cargar el monto de la cuota y la forma de pago
  function seleccionarPrestamo(id: string) {
    setPagoPrestamoId(id)
    if (!id) { setMontoPago(''); return }
    const p = prestamos.find(x => x.id === parseInt(id))
    if (p) {
      const mc = p.montoCuota ?? (p.monto / p.cuotas)
      setMontoPago(String(Math.min(mc, p.saldoPendiente)))
      setFormaPago(p.cuentaId ? 'cuenta' : 'efectivo')
    }
  }

  const vigentes = prestamos.filter(p => p.estado !== 'pagado')
  const totalPrestado = prestamos.reduce((a, p) => a + p.monto, 0)
  const totalPendiente = prestamos.reduce((a, p) => a + p.saldoPendiente, 0)
  const prestamoPago = prestamos.find(x => x.id === parseInt(pagoPrestamoId))

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Préstamos</h1>
          <p className="text-sm text-gray-500 mt-1">Otorgá préstamos a empresas y socios, entregalos como quieras y gestioná los pagos</p>
        </div>
        <ExportButtons
          filenameBase="prestamos"
          titulo="Préstamos"
          sections={[{
            columns: [
              { header: 'Titular', value: (p: Prestamo) => p.titular },
              { header: 'Tipo', value: (p: Prestamo) => p.socioId ? 'Socio' : 'Empresa' },
              { header: 'Monto', value: (p: Prestamo) => p.monto, moneda: true },
              { header: 'Saldo pendiente', value: (p: Prestamo) => p.saldoPendiente, moneda: true },
              { header: 'Cuotas pagadas', value: (p: Prestamo) => `${p.cuotasPagadas}/${p.cuotas}`, align: 'center' },
              { header: 'Valor cuota', value: (p: Prestamo) => p.montoCuota ?? (p.monto / (p.cuotas || 1)), moneda: true },
              { header: 'En cuenta', value: (p: Prestamo) => p.entrega.cuenta, moneda: true },
              { header: 'En efectivo', value: (p: Prestamo) => p.entrega.efectivo, moneda: true },
              { header: 'Por QR', value: (p: Prestamo) => p.entrega.qr, moneda: true },
              { header: 'Estado', value: (p: Prestamo) => p.estado },
              { header: 'Fecha', value: (p: Prestamo) => new Date(p.createdAt).toLocaleDateString('es-AR') },
            ],
            rows: prestamos,
            foot: [
              'TOTALES', '',
              `$${fmt(totalPrestado)}`,
              `$${fmt(totalPendiente)}`,
              '', '', '', '', '', '', '',
            ],
          }]}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Total prestado', value: `$${fmt(totalPrestado)}`, color: 'blue' },
          { label: 'Saldo pendiente', value: `$${fmt(totalPendiente)}`, color: 'amber' },
          { label: 'Préstamos activos', value: vigentes.length, color: 'green' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-2xl font-bold text-${s.color}-600 mt-1`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6 items-start">
        {/* Otorgar préstamo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-semibold text-gray-800">Otorgar préstamo</h2>
            {boveda && (
              <span className={`text-xs ${boveda.estado === 'abierta' ? 'text-gray-500' : 'text-red-500'}`}>
                Bóveda {boveda.estado === 'abierta' ? `· $${fmt(boveda.saldoEfectivo)}` : 'cerrada'}
              </span>
            )}
          </div>
          <form onSubmit={otorgar} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              {(['empresa', 'socio'] as const).map(d => (
                <button key={d} type="button" onClick={() => cambiarDestinatario(d)}
                  className={`border rounded-lg px-3 py-2 text-sm transition-colors ${
                    destinatario === d ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}>
                  {d === 'empresa' ? '🏢 Empresa' : '👤 Socio'}
                </button>
              ))}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">{destinatario === 'empresa' ? 'Empresa' : 'Socio'}</label>
              <select value={titularId} onChange={e => { setTitularId(e.target.value); setCuentaId('') }} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccioná {destinatario === 'empresa' ? 'empresa' : 'socio'} —</option>
                {destinatario === 'empresa'
                  ? empresas.map(e => <option key={e.id} value={String(e.id)}>{e.razonSocial}</option>)
                  : socios.map(s => <option key={s.id} value={String(s.id)}>{s.apellido}, {s.nombre} — {s.numeroSocio}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto total ($)</label>
              <input type="number" min="1" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuotas</label>
              <div className="flex gap-1.5 flex-wrap">
                {OPCIONES_CUOTAS.map(n => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCuotas(String(n))}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                      cuotas === String(n)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:border-blue-400'
                    }`}>
                    {n === 1 ? 'Única' : `${n}c`}
                  </button>
                ))}
              </div>
              {montoCuotaPreview && cuotas !== '1' && (
                <p className="text-xs text-gray-400 mt-1">
                  {cuotas} cuotas de <strong>${fmt(montoCuotaPreview)}</strong>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
              <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>

            {/* Formas de entrega */}
            <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Cómo se entrega</p>
              <div className="flex flex-wrap items-center gap-1 text-xs text-gray-500">
                <span className="mr-1">Todo en:</span>
                {FORMAS.map(f => (
                  <button key={f.key} type="button" onClick={() => setFormaUnica(f.key)}
                    className={`px-2 py-1 rounded-md border transition-colors ${
                      formaUnica === f.key ? 'bg-blue-600 text-white border-blue-600' : 'bg-white border-gray-300 text-gray-600 hover:border-blue-400'
                    }`}>
                    {f.icon} {f.corto}
                  </button>
                ))}
                <span className="ml-1">o repartilo abajo</span>
              </div>
              {FORMAS.map(f => (
                <div key={f.key} className="flex items-center gap-2">
                  <span className="text-sm text-gray-700 w-40 shrink-0">{f.icon} {f.label}</span>
                  <input type="number" min="0" step="0.01"
                    value={formaUnica ? (formaUnica === f.key ? monto : '') : partes[f.key]}
                    onChange={e => editarParte(f.key, e.target.value)}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white" placeholder="0.00" />
                  <button type="button" onClick={() => completarCon(f.key)} disabled={!montoNum || Math.abs(diferencia) < 0.01}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-30 whitespace-nowrap">
                    + resto
                  </button>
                </div>
              ))}
              {montoNum > 0 && Math.abs(diferencia) >= 0.01 && (
                <p className="text-xs text-red-600">
                  {diferencia > 0 ? `Faltan asignar $${fmt(diferencia)}` : `Sobran $${fmt(-diferencia)}`} (repartido: ${fmt(asignado)} de ${fmt(montoNum)})
                </p>
              )}
              {valores.cuenta > 0 && titularId && (
                cuentasTitular.length === 0 ? (
                  <p className="text-xs text-red-600">No tiene cuenta activa: creala en Cuentas o entregá en efectivo o por QR.</p>
                ) : cuentasTitular.length === 1 ? (
                  <p className="text-xs text-gray-500">Se deposita en {cuentasTitular[0].tipo} {cuentasTitular[0].alias}.</p>
                ) : (
                  <select value={cuentaElegida ? String(cuentaElegida.id) : ''} onChange={e => setCuentaId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs bg-white">
                    {cuentasTitular.map(c => (
                      <option key={c.id} value={String(c.id)}>{c.tipo} — {c.alias} · Saldo ${fmt(c.saldo)}</option>
                    ))}
                  </select>
                )
              )}
              {valores.qr > 0 && (
                <p className="text-xs text-gray-500">Al confirmar se muestra el QR para escanear con MediaPago (vence en 24 h).</p>
              )}
            </div>

            <button type="submit" disabled={enviando || !puedeOtorgar}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm">
              Otorgar préstamo
            </button>
          </form>
        </div>

        {/* Registrar pago */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Registrar pago</h2>
          <form onSubmit={pagar} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Préstamo</label>
              <select value={pagoPrestamoId} onChange={e => seleccionarPrestamo(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccioná préstamo —</option>
                {vigentes.map(p => {
                  const mc = p.montoCuota ?? (p.monto / p.cuotas)
                  const cuotaActual = p.cuotasPagadas + 1
                  return (
                    <option key={p.id} value={String(p.id)}>
                      {p.titular} — Cuota {Math.min(cuotaActual, p.cuotas)}/{p.cuotas} (${fmt(mc)})
                    </option>
                  )
                })}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Forma de pago</label>
              <div className="grid grid-cols-2 gap-2">
                {([['cuenta', '🏦 Débito en cuenta'], ['efectivo', '💵 Efectivo']] as const).map(([k, l]) => {
                  const deshabilitado = k === 'cuenta' && !!prestamoPago && !prestamoPago.cuentaId
                  return (
                    <button key={k} type="button" disabled={deshabilitado} onClick={() => setFormaPago(k)}
                      className={`border rounded-lg px-3 py-2 text-sm transition-colors disabled:opacity-40 ${
                        formaPago === k ? 'border-green-500 bg-green-50 text-green-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}>
                      {l}
                    </button>
                  )
                })}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto a pagar ($)</label>
              <input type="number" min="0.01" step="0.01" value={montoPago} onChange={e => setMontoPago(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
              {prestamoPago && (
                <p className="text-xs text-gray-400 mt-1">
                  Cuota: ${fmt(prestamoPago.montoCuota ?? (prestamoPago.monto / prestamoPago.cuotas))} · Pendiente total: ${fmt(prestamoPago.saldoPendiente)}
                </p>
              )}
            </div>
            <button type="submit" disabled={enviando}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm mt-2">
              Registrar pago
            </button>
          </form>
        </div>
      </div>

      {msg && (
        <div className={`rounded-lg px-4 py-2 text-sm flex justify-between gap-4 ${msg.startsWith('Error') ? 'bg-red-50 border border-red-200 text-red-800' : 'bg-blue-50 border border-blue-200 text-blue-800'}`}>
          {msg} <button onClick={() => setMsg('')} className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* Tabla de préstamos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800 text-sm">
          Todos los préstamos
        </div>
        {loading ? (
          <p className="p-6 text-sm text-gray-400">Cargando…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="px-4 py-2 text-left">Titular</th>
                  <th className="px-4 py-2 text-right">Monto</th>
                  <th className="px-4 py-2 text-right">Pendiente</th>
                  <th className="px-4 py-2 text-center">Cuotas</th>
                  <th className="px-4 py-2 text-left">Entrega</th>
                  <th className="px-4 py-2 text-center">Estado</th>
                  <th className="px-4 py-2 text-left">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {prestamos.map(p => {
                  const mc = p.montoCuota ?? (p.monto / (p.cuotas || 1))
                  const cuotaActual = Math.min(p.cuotasPagadas + 1, p.cuotas)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-medium">
                        {p.titular}
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-gray-400">{p.socioId ? 'socio' : 'empresa'}</span>
                      </td>
                      <td className="px-4 py-2 text-right">${fmt(p.monto)}</td>
                      <td className={`px-4 py-2 text-right font-semibold ${p.saldoPendiente > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        ${fmt(p.saldoPendiente)}
                      </td>
                      <td className="px-4 py-2 text-center text-xs text-gray-600">
                        {p.estado !== 'pagado' ? (
                          <span>
                            <strong>{cuotaActual}/{p.cuotas}</strong>
                            <br />${fmt(mc)}
                          </span>
                        ) : (
                          <span className="text-gray-400">{p.cuotas}c</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-gray-600 whitespace-nowrap">
                        {resumenEntrega(p.entrega)}
                        {p.entrega.tieneQr && (
                          <button onClick={() => verQr(p)} className="ml-2 text-blue-600 hover:text-blue-800 font-medium">Ver QR</button>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          p.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                          p.estado === 'moroso' ? 'bg-red-100 text-red-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{p.estado}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString('es-AR')}</td>
                    </tr>
                  )
                })}
                {!prestamos.length && (
                  <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Sin préstamos aún</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* QR MediaPago del préstamo */}
      {qr && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setQr(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
            <p className="font-semibold text-gray-800 mb-1">{qr.titulo}</p>
            <div className="flex justify-center my-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr.dataUrl} alt="QR MediaPago del préstamo" className="w-56 h-56 border rounded-lg" />
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
