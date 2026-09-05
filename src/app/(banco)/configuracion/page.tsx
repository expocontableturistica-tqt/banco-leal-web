'use client'

import { useEffect, useState } from 'react'

interface UsuarioInterno {
  id: string
  email: string
  name: string
  role: 'admin' | 'cajero' | 'operador'
  numeroCaja: number | null
  activo: boolean
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = { admin: 'Administrador', cajero: 'Cajero', operador: 'Operador' }
const ROLE_COLOR: Record<string, string> = {
  admin:    'bg-purple-100 text-purple-700',
  cajero:   'bg-blue-100 text-blue-700',
  operador: 'bg-yellow-100 text-yellow-700',
}

const emptyForm = { email: '', name: '', password: '', role: 'cajero', numeroCaja: '' }

export default function ConfiguracionPage() {
  const [usuarios, setUsuarios] = useState<UsuarioInterno[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function fetchUsuarios() {
    setLoading(true)
    const res = await fetch('/api/configuracion')
    const data = await res.json()
    setUsuarios(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { fetchUsuarios() }, [])

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const res = await fetch('/api/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        numeroCaja: form.role === 'cajero' && form.numeroCaja ? parseInt(form.numeroCaja) : null,
      }),
    })
    const data = await res.json()
    if (res.ok) { setShowModal(false); setForm(emptyForm); fetchUsuarios() }
    else setError(data.error || 'Error al crear usuario')
    setSaving(false)
  }

  async function handleToggle(id: string, activo: boolean) {
    await fetch('/api/configuracion', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, activo: !activo }),
    })
    fetchUsuarios()
  }

  async function handleEliminar(id: string, name: string) {
    if (!confirm(`¿Eliminar a ${name}?`)) return
    await fetch('/api/configuracion', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    fetchUsuarios()
  }

  const cajeros   = usuarios.filter(u => u.role === 'cajero')
  const operadores = usuarios.filter(u => u.role === 'operador')
  const admins    = usuarios.filter(u => u.role === 'admin')

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Configuración</h1>
          <p className="text-sm text-gray-500">Gestión de personal del banco</p>
        </div>
        <button
          onClick={() => { setShowModal(true); setError('') }}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          + Nuevo usuario
        </button>
      </div>

      {loading ? <p className="text-gray-500 text-sm">Cargando...</p> : (
        <div className="space-y-6">
          {/* Cajeros */}
          <Seccion titulo="Cajeros" subtitulo="Cada cajero opera una ventanilla independiente" usuarios={cajeros}
            onToggle={handleToggle} onEliminar={handleEliminar} />
          {/* Operadores */}
          <Seccion titulo="Operadores de Prestaciones" subtitulo="Gestionan cheques, préstamos y tarjetas" usuarios={operadores}
            onToggle={handleToggle} onEliminar={handleEliminar} />
          {/* Admins */}
          <Seccion titulo="Administradores" subtitulo="Acceso completo al sistema" usuarios={admins}
            onToggle={handleToggle} onEliminar={handleEliminar} />
        </div>
      )}

      {/* Modal nuevo usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">Nuevo usuario</h2>
            </div>
            <form onSubmit={handleCrear} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rol *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cajero', 'operador', 'admin'] as const).map(r => (
                    <label key={r} className={`flex items-center justify-center border rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                      form.role === r ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                    }`}>
                      <input type="radio" className="hidden" checked={form.role === r} onChange={() => setForm(f => ({ ...f, role: r }))} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input type="text" required autoFocus value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                {form.role === 'cajero' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">N° ventanilla <span className="text-gray-400">(opc.)</span></label>
                    <input type="number" min="1" value={form.numeroCaja}
                      onChange={e => setForm(f => ({ ...f, numeroCaja: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Auto" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="usuario@bancoleal.com" />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña inicial *</label>
                <input type="password" required minLength={6} value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mínimo 6 caracteres" />
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}

              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setForm(emptyForm); setError('') }}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {saving ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Seccion({ titulo, subtitulo, usuarios, onToggle, onEliminar }: {
  titulo: string
  subtitulo: string
  usuarios: UsuarioInterno[]
  onToggle: (id: string, activo: boolean) => void
  onEliminar: (id: string, name: string) => void
}) {
  return (
    <div>
      <div className="mb-3">
        <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
        <p className="text-xs text-gray-400">{subtitulo}</p>
      </div>
      {usuarios.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-5 text-center text-gray-400 text-sm">
          No hay {titulo.toLowerCase()} registrados.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Email</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Rol</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.name}
                    {u.numeroCaja && <span className="ml-1 text-xs text-gray-400">· V{u.numeroCaja}</span>}
                  </td>
                  <td className="px-4 py-3 text-gray-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[u.role]}`}>
                      {ROLE_LABEL[u.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${u.activo ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-4 py-3 text-right flex gap-3 justify-end">
                    <button onClick={() => onToggle(u.id, u.activo)}
                      className="text-xs text-gray-400 hover:text-gray-700 font-medium transition-colors">
                      {u.activo ? 'Desactivar' : 'Activar'}
                    </button>
                    <button onClick={() => onEliminar(u.id, u.name)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium transition-colors">
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
