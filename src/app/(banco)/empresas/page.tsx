'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

interface Empresa {
  id: number
  numeroEmpresa: string
  razonSocial: string
  nombreFantasia: string
  cuit: string
  actividad: string
  createdAt: string
}

const emptyForm = { razonSocial: '', nombreFantasia: '', cuit: '', actividad: '' }

function formatCuit(digits: string) {
  if (digits.length !== 11) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

export default function EmpresasPage() {
  const { data: session } = useSession()
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [buscar, setBuscar] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAdmin = session?.user?.role === 'admin'
  const canEdit = isAdmin || session?.user?.role === 'cajero'

  async function fetchEmpresas() {
    setLoading(true)
    const res = await fetch('/api/empresas')
    const data = await res.json()
    setEmpresas(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchEmpresas() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setShowModal(false)
      setForm(emptyForm)
      fetchEmpresas()
    } else {
      const data = await res.json()
      setError(data.error || 'Error al guardar')
    }
    setSaving(false)
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const fd = new FormData()
    fd.append('tipo', 'empresas')
    fd.append('file', file)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) setImportMsg(`Importación: ${data.creados} empresas creadas, ${data.omitidos} omitidas`)
    else setImportMsg('Error: ' + data.error)
    e.target.value = ''
    fetchEmpresas()
  }

  async function handleDelete(id: number, nombre: string) {
    if (!confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`)) return
    await fetch('/api/empresas', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchEmpresas()
  }

  const filtradas = empresas.filter(e => {
    const q = buscar.toLowerCase()
    return (
      e.numeroEmpresa.toLowerCase().includes(q) ||
      e.razonSocial.toLowerCase().includes(q) ||
      e.nombreFantasia.toLowerCase().includes(q) ||
      e.cuit.includes(q)
    )
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Empresas</h1>
          <p className="text-sm text-gray-500">{empresas.length} empresas registradas</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".xlsx" className="hidden" onChange={handleImport} />
            <a
              href="/api/import/template?tipo=empresas"
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Planilla modelo
            </a>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Importar Excel
            </button>
            <button
              onClick={() => { setShowModal(true); setError('') }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Nueva empresa
            </button>
          </div>
        )}
      </div>

      {importMsg && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2 text-sm flex justify-between">
          {importMsg} <button onClick={() => setImportMsg('')} className="text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}

      {/* Buscador */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Buscar por razón social, nombre fantasía, N° o CUIT..."
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
          {buscar ? 'Sin resultados para esa búsqueda.' : 'No hay empresas registradas.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">N° Empresa</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Razón social</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Nombre fantasía</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">CUIT</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Actividad</th>
                {isAdmin && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtradas.map(e => (
                <tr key={e.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-600">{e.numeroEmpresa}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{e.razonSocial}</td>
                  <td className="px-4 py-3 text-gray-500">{e.nombreFantasia || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono">
                    {e.cuit ? formatCuit(e.cuit) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{e.actividad || '—'}</td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(e.id, e.razonSocial)}
                        className="text-red-400 hover:text-red-600 text-xs font-medium transition-colors"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nueva empresa */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Nueva empresa</h2>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Razón social *</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={form.razonSocial}
                  onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Nombre fantasía <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.nombreFantasia}
                  onChange={e => setForm(f => ({ ...f, nombreFantasia: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  CUIT <span className="text-gray-400">(opcional, 11 dígitos sin guiones)</span>
                </label>
                <input
                  type="text"
                  value={form.cuit}
                  onChange={e => setForm(f => ({ ...f, cuit: e.target.value.replace(/\D/g, '').slice(0, 11) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="20123456780"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Actividad <span className="text-gray-400">(opcional)</span>
                </label>
                <input
                  type="text"
                  value={form.actividad}
                  onChange={e => setForm(f => ({ ...f, actividad: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Ej: Comercio minorista"
                />
              </div>
              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setForm(emptyForm); setError('') }}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
