'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'

interface Cuenta {
  id: number
  socioId: number | null
  empresaId: number | null
  tipo: 'CA' | 'CC'
  cbu: string
  alias: string
  saldo: number
  estado: 'activa' | 'inactiva'
  createdAt: string
}
interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }
interface Empresa { id: number; razonSocial: string; nombreFantasia: string; numeroEmpresa: string }

export default function CuentasPage() {
  const { data: session } = useSession()
  const [cuentas, setCuentas] = useState<Cuenta[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [titular, setTitular] = useState<'socio' | 'empresa'>('socio')
  const [socioId, setSocioId] = useState('')
  const [empresaId, setEmpresaId] = useState('')
  const [tipo, setTipo] = useState<'CA' | 'CC'>('CA')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')

  const canEdit = ['admin', 'cajero'].includes(session?.user?.role ?? '')

  async function fetchAll() {
    setLoading(true)
    const [c, s, e] = await Promise.all([
      fetch('/api/cuentas').then(r => r.json()),
      fetch('/api/socios').then(r => r.json()),
      fetch('/api/empresas').then(r => r.json()),
    ])
    setCuentas(Array.isArray(c) ? c : [])
    setSocios(Array.isArray(s) ? s : [])
    setEmpresas(Array.isArray(e) ? e : [])
    setLoading(false)
  }

  useEffect(() => { fetchAll() }, [])

  function getNombreTitular(c: Cuenta) {
    if (c.socioId) {
      const s = socios.find(x => x.id === c.socioId)
      return s ? `${s.apellido}, ${s.nombre} (${s.numeroSocio})` : `Socio #${c.socioId}`
    }
    if (c.empresaId) {
      const e = empresas.find(x => x.id === c.empresaId)
      return e ? (e.nombreFantasia || e.razonSocial) + ` (${e.numeroEmpresa})` : `Empresa #${c.empresaId}`
    }
    return '—'
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const body: Record<string, unknown> = { tipo }
    if (titular === 'socio') body.socioId = parseInt(socioId)
    else body.empresaId = parseInt(empresaId)

    const res = await fetch('/api/cuentas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setShowModal(false)
      setSocioId(''); setEmpresaId(''); setTipo('CA'); setTitular('socio')
      fetchAll()
    } else {
      const data = await res.json()
      setError(data.error || 'Error al crear cuenta')
    }
    setSaving(false)
  }

  async function handleToggle(id: number) {
    await fetch('/api/cuentas', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion: 'toggle' }),
    })
    fetchAll()
  }

  const filtradas = cuentas.filter(c => {
    const q = buscar.toLowerCase()
    const nombre = getNombreTitular(c).toLowerCase()
    return (
      c.cbu.includes(q) ||
      c.alias.toLowerCase().includes(q) ||
      nombre.includes(q) ||
      c.tipo.toLowerCase().includes(q)
    )
  })

  const totalSaldo = cuentas.filter(c => c.estado === 'activa').reduce((a, c) => a + c.saldo, 0)

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Cuentas</h1>
          <p className="text-sm text-gray-500">
            {cuentas.length} cuentas · saldo total activas:{' '}
            <span className="font-medium text-gray-700">
              ${totalSaldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
            </span>
          </p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowModal(true); setError('') }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            + Nueva cuenta
          </button>
        )}
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por titular, CBU, alias o tipo..."
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : filtradas.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          {buscar ? 'Sin resultados para esa búsqueda.' : 'No hay cuentas registradas.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Titular</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Alias</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">CBU</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Saldo</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                {canEdit && <th className="px-4 py-3 w-24"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map(c => (
                <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.estado === 'inactiva' ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-gray-900 font-medium">{getNombreTitular(c)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                      c.tipo === 'CA' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'
                    }`}>
                      {c.tipo === 'CA' ? 'Cta. Ahorro' : 'Cta. Corriente'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{c.alias}</td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">{c.cbu}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${c.saldo.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${
                      c.estado === 'activa' ? 'bg-green-500' : 'bg-gray-300'
                    }`} />
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleToggle(c.id)}
                        className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors"
                      >
                        {c.estado === 'activa' ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nueva cuenta */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Nueva cuenta bancaria</h2>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              {/* Tipo de titular */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Titular</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['socio', 'empresa'] as const).map(t => (
                    <label
                      key={t}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                        titular === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input type="radio" className="hidden" checked={titular === t} onChange={() => setTitular(t)} />
                      {t === 'socio' ? '👤 Socio' : '🏢 Empresa'}
                    </label>
                  ))}
                </div>
              </div>

              {/* Select socio o empresa */}
              {titular === 'socio' ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Socio *</label>
                  <select
                    required
                    value={socioId}
                    onChange={e => setSocioId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar socio...</option>
                    {socios.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.apellido}, {s.nombre} — {s.numeroSocio}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Empresa *</label>
                  <select
                    required
                    value={empresaId}
                    onChange={e => setEmpresaId(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Seleccionar empresa...</option>
                    {empresas.map(e => (
                      <option key={e.id} value={e.id}>
                        {e.nombreFantasia || e.razonSocial} — {e.numeroEmpresa}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Tipo de cuenta */}
              <div>
                <p className="text-xs font-medium text-gray-700 mb-2">Tipo de cuenta</p>
                <div className="grid grid-cols-2 gap-2">
                  {(['CA', 'CC'] as const).map(t => (
                    <label
                      key={t}
                      className={`flex items-center gap-2 border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                        tipo === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <input type="radio" className="hidden" checked={tipo === t} onChange={() => setTipo(t)} />
                      {t === 'CA' ? 'Cta. Ahorro' : 'Cta. Corriente'}
                    </label>
                  ))}
                </div>
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setError('') }}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Creando...' : 'Crear cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
