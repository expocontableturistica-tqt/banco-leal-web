'use client'
import { useEffect, useState } from 'react'

interface Empresa { id: number; razonSocial: string; numeroEmpresa: string }
interface Prestamo {
  id: number; empresaId: number; cuentaId: number; monto: number
  saldoPendiente: number; concepto: string; estado: string
  createdAt: string; razonSocial: string; cbu: string
}

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function PrestamosPage() {
  const [prestamos, setPrestamos] = useState<Prestamo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState('')

  // Form otorgar
  const [empresaId, setEmpresaId] = useState('')
  const [monto, setMonto] = useState('')
  const [concepto, setConcepto] = useState('Préstamo inicial expo')
  const [enviando, setEnviando] = useState(false)

  // Form pago
  const [pagoPrestamoId, setPagoPrestamoId] = useState('')
  const [montoPago, setMontoPago] = useState('')

  async function cargar() {
    setLoading(true)
    const [p, e] = await Promise.all([
      fetch('/api/prestamos').then(r => r.json()),
      fetch('/api/empresas').then(r => r.json()),
    ])
    setPrestamos(Array.isArray(p) ? p : [])
    setEmpresas(Array.isArray(e) ? e : [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  async function otorgar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const res = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'otorgar', empresaId: parseInt(empresaId), monto: parseFloat(monto), concepto }),
    })
    const data = await res.json()
    if (res.ok) { setMsg('Préstamo otorgado'); setMonto(''); setEmpresaId(''); cargar() }
    else setMsg('Error: ' + data.error)
    setEnviando(false)
  }

  async function pagar(e: React.FormEvent) {
    e.preventDefault()
    setEnviando(true)
    const res = await fetch('/api/prestamos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'pagar', prestamoId: parseInt(pagoPrestamoId), monto: parseFloat(montoPago) }),
    })
    const data = await res.json()
    if (res.ok) { setMsg(`Pago registrado. Saldo pendiente: $${fmt(data.nuevoSaldoPendiente)}`); setPagoPrestamoId(''); setMontoPago(''); cargar() }
    else setMsg('Error: ' + data.error)
    setEnviando(false)
  }

  const vigentes = prestamos.filter(p => p.estado !== 'pagado')
  const totalPrestado = prestamos.reduce((a, p) => a + p.monto, 0)
  const totalPendiente = prestamos.reduce((a, p) => a + p.saldoPendiente, 0)

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Préstamos a Empresas</h1>
        <p className="text-sm text-gray-500 mt-1">Otorgá fondos a las empresas de la expo y gestioná los pagos</p>
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

      <div className="grid grid-cols-2 gap-6">
        {/* Otorgar préstamo */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="font-semibold text-gray-800 mb-4">Otorgar préstamo</h2>
          <form onSubmit={otorgar} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Empresa</label>
              <select value={empresaId} onChange={e => setEmpresaId(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccioná empresa —</option>
                {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto ($)</label>
              <input type="number" min="1" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Concepto</label>
              <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button type="submit" disabled={enviando}
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
              <select value={pagoPrestamoId} onChange={e => setPagoPrestamoId(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">— Seleccioná préstamo —</option>
                {vigentes.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.razonSocial} — Pendiente: ${fmt(p.saldoPendiente)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monto a pagar ($)</label>
              <input type="number" min="0.01" step="0.01" value={montoPago} onChange={e => setMontoPago(e.target.value)} required
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
            </div>
            <button type="submit" disabled={enviando}
              className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm mt-2">
              Registrar pago
            </button>
          </form>
        </div>
      </div>

      {msg && (
        <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2 text-sm flex justify-between">
          {msg} <button onClick={() => setMsg('')} className="text-blue-400 hover:text-blue-600">✕</button>
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
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="px-4 py-2 text-left">Empresa</th>
                <th className="px-4 py-2 text-right">Monto</th>
                <th className="px-4 py-2 text-right">Pendiente</th>
                <th className="px-4 py-2 text-center">Estado</th>
                <th className="px-4 py-2 text-left">CBU</th>
                <th className="px-4 py-2 text-left">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {prestamos.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{p.razonSocial}</td>
                  <td className="px-4 py-2 text-right">${fmt(p.monto)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${p.saldoPendiente > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    ${fmt(p.saldoPendiente)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.estado === 'pagado' ? 'bg-green-100 text-green-700' :
                      p.estado === 'moroso' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{p.estado}</span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-500">{p.cbu}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{new Date(p.createdAt).toLocaleDateString('es-AR')}</td>
                </tr>
              ))}
              {!prestamos.length && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-gray-400">Sin préstamos aún</td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
