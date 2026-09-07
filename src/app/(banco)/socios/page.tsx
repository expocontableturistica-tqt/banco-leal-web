'use client'

import { useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'

interface Socio {
  id: number
  numeroSocio: string
  nombre: string
  apellido: string
  dni: string
  montoAsignado: number
  createdAt: string
}

const emptyForm = { nombre: '', apellido: '', dni: '', montoAsignado: '' }

export default function SociosPage() {
  const { data: session } = useSession()
  const [socios, setSocios] = useState<Socio[]>([])
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

  async function fetchSocios() {
    setLoading(true)
    const res = await fetch('/api/socios')
    const data = await res.json()
    setSocios(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchSocios() }, [])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const res = await fetch('/api/socios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre,
        apellido: form.apellido,
        dni: form.dni,
        montoAsignado: parseFloat(form.montoAsignado) || 0,
      }),
    })
    if (res.ok) {
      setShowModal(false)
      setForm(emptyForm)
      fetchSocios()
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
    fd.append('tipo', 'socios')
    fd.append('file', file)
    const res = await fetch('/api/import', { method: 'POST', body: fd })
    const data = await res.json()
    if (res.ok) setImportMsg(`Importación: ${data.creados} socios creados, ${data.omitidos} omitidos`)
    else setImportMsg('Error: ' + data.error)
    e.target.value = ''
    fetchSocios()
  }

  async function handleDelete(id: number, nombre: string) {
    if (!confirm(`¿Eliminar a ${nombre}? Esta acción no se puede deshacer.`)) return
    await fetch('/api/socios', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchSocios()
  }

  const filtrados = socios.filter(s => {
    const q = buscar.toLowerCase()
    return (
      s.numeroSocio.includes(q) ||
      s.nombre.toLowerCase().includes(q) ||
      s.apellido.toLowerCase().includes(q) ||
      (s.dni && s.dni.includes(q))
    )
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Socios</h1>
          <p className="text-sm text-gray-500">{socios.length} socios registrados</p>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.txt" className="hidden" onChange={handleImport} />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Importar CSV
            </button>
            <button
              onClick={() => { setShowModal(true); setError('') }}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              + Nuevo socio
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
          placeholder="Buscar por nombre, apellido, N° socio o DNI..."
          value={buscar}
          onChange={e => setBuscar(e.target.value)}
          className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Tabla */}
      {loading ? (
        <p className="text-gray-500 text-sm">Cargando...</p>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          {buscar ? 'Sin resultados para esa búsqueda.' : 'No hay socios registrados.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">N° Socio</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Apellido y nombre</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">DNI</th>
                <th className="text-right px-4 py-3 text-gray-600 font-medium">Monto asignado</th>
                {isAdmin && <th className="px-4 py-3 w-20"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtrados.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-gray-600">{s.numeroSocio}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{s.apellido}, {s.nombre}</td>
                  <td className="px-4 py-3 text-gray-500">{s.dni || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">
                    ${s.montoAsignado.toLocaleString('es-AR', { minimumFractionDigits: 2 })}
                  </td>
                  {isAdmin && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleDelete(s.id, `${s.nombre} ${s.apellido}`)}
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

      {/* Modal nuevo socio */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Nuevo socio</h2>
            </div>
            <form onSubmit={handleAdd} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Apellido *</label>
                  <input
                    type="text"
                    required
                    value={form.apellido}
                    onChange={e => setForm(f => ({ ...f, apellido: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">DNI <span className="text-gray-400">(opcional)</span></label>
                <input
                  type="text"
                  value={form.dni}
                  onChange={e => setForm(f => ({ ...f, dni: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Sin puntos"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Monto asignado ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montoAsignado}
                  onChange={e => setForm(f => ({ ...f, montoAsignado: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
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
