'use client'
import { useEffect, useState } from 'react'

type RolInterno = 'admin' | 'cajero' | 'operador'
type RolExterno = 'empresa' | 'socio'

interface Usuario {
  id: string; email: string; name: string; role: string
  numeroCaja: number | null; entityId: number | null
  activo: boolean; createdAt: string
  entidad?: { id: number; razonSocial?: string; nombre?: string; apellido?: string; numeroEmpresa?: string; numeroSocio?: string } | null
}
interface Empresa { id: number; razonSocial: string; numeroEmpresa: string }
interface Socio { id: number; nombre: string; apellido: string; numeroSocio: string }

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', cajero: 'Cajero', operador: 'Operador', empresa: 'Empresa', socio: 'Socio' }
const ROLE_COLOR: Record<string, string> = {
  admin: 'bg-purple-100 text-purple-700', cajero: 'bg-blue-100 text-blue-700',
  operador: 'bg-yellow-100 text-yellow-700', empresa: 'bg-green-100 text-green-700',
  socio: 'bg-orange-100 text-orange-700',
}

const emptyForm = { email: '', name: '', password: '', role: 'cajero', numeroCaja: '', entityId: '' }

export default function ConfiguracionPage() {
  const [tab, setTab] = useState<'personal' | 'empresas' | 'socios' | 'reset'>('personal')
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [externos, setExternos] = useState<Usuario[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [socios, setSocios] = useState<Socio[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [resetPwd, setResetPwd] = useState<{ id: string; name: string } | null>(null)
  const [newPwd, setNewPwd] = useState('')

  async function fetchTodo() {
    setLoading(true)
    const [u, e, emp, soc] = await Promise.all([
      fetch('/api/configuracion').then(r => r.json()),
      fetch('/api/configuracion?tipo=externos').then(r => r.json()),
      fetch('/api/empresas').then(r => r.json()),
      fetch('/api/socios').then(r => r.json()),
    ])
    setUsuarios(Array.isArray(u) ? u : [])
    setExternos(Array.isArray(e) ? e : [])
    setEmpresas(Array.isArray(emp) ? emp : [])
    setSocios(Array.isArray(soc) ? soc : [])
    setLoading(false)
  }

  useEffect(() => { fetchTodo() }, [])

  async function handleCrear(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    const body: Record<string, unknown> = { ...form }
    if (form.role === 'cajero') body.numeroCaja = form.numeroCaja ? parseInt(form.numeroCaja) : null
    if (form.role === 'empresa' || form.role === 'socio') body.entityId = parseInt(form.entityId)
    const res = await fetch('/api/configuracion', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const data = await res.json()
    if (res.ok) { setShowModal(false); setForm(emptyForm); fetchTodo() }
    else setError(data.error || 'Error al crear usuario')
    setSaving(false)
  }

  async function handleToggle(id: string, activo: boolean) {
    await fetch('/api/configuracion', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, activo: !activo }) })
    fetchTodo()
  }

  async function handleEliminar(id: string, name: string) {
    if (!confirm(`¿Eliminar a ${name}? Esta acción no se puede deshacer.`)) return
    await fetch('/api/configuracion', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    fetchTodo()
  }

  async function handleResetPwd(e: React.FormEvent) {
    e.preventDefault()
    if (!resetPwd) return
    setSaving(true)
    const res = await fetch('/api/configuracion', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetPassword: true, id: resetPwd.id, newPassword: newPwd }),
    })
    const data = await res.json()
    if (res.ok) { setMsg(`Contraseña de ${resetPwd.name} actualizada`); setResetPwd(null); setNewPwd('') }
    else setMsg('Error: ' + data.error)
    setSaving(false)
  }

  const cajeros   = usuarios.filter(u => u.role === 'cajero')
  const operadores = usuarios.filter(u => u.role === 'operador')
  const admins    = usuarios.filter(u => u.role === 'admin')
  const usuEmpresas = externos.filter(u => u.role === 'empresa')
  const usuSocios   = externos.filter(u => u.role === 'socio')

  const TABS = [
    { k: 'personal', l: 'Personal del banco' },
    { k: 'empresas', l: 'Usuarios Empresa' },
    { k: 'socios',   l: 'Usuarios Socio' },
    { k: 'reset',    l: '⚠ Reset del banco' },
  ] as const

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Configuración</h1>
          <p className="text-sm text-gray-500">Gestión de usuarios y administración del sistema</p>
        </div>
        {tab !== 'reset' && (
          <button onClick={() => { setShowModal(true); setError(''); setForm({ ...emptyForm, role: tab === 'empresas' ? 'empresa' : tab === 'socios' ? 'socio' : 'cajero' }) }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            + Nuevo usuario
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-6 w-fit">
        {TABS.map(t => (
          <button key={t.k} onClick={() => setTab(t.k)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t.k ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'} ${t.k === 'reset' ? 'text-red-500' : ''}`}>
            {t.l}
          </button>
        ))}
      </div>

      {msg && (
        <div className="mb-4 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg px-4 py-2 text-sm flex justify-between">
          {msg} <button onClick={() => setMsg('')} className="text-blue-400 hover:text-blue-600">✕</button>
        </div>
      )}

      {loading ? <p className="text-gray-500 text-sm">Cargando...</p> : (
        <>
          {/* Personal del banco */}
          {tab === 'personal' && (
            <div className="space-y-6">
              <Seccion titulo="Cajeros" subtitulo="Operan las ventanillas del banco" usuarios={cajeros} onToggle={handleToggle} onEliminar={handleEliminar} onResetPwd={u => { setResetPwd(u); setNewPwd('') }} />
              <Seccion titulo="Operadores" subtitulo="Gestionan prestaciones y servicios" usuarios={operadores} onToggle={handleToggle} onEliminar={handleEliminar} onResetPwd={u => { setResetPwd(u); setNewPwd('') }} />
              <Seccion titulo="Administradores" subtitulo="Acceso completo al sistema" usuarios={admins} onToggle={handleToggle} onEliminar={handleEliminar} onResetPwd={u => { setResetPwd(u); setNewPwd('') }} />
            </div>
          )}

          {/* Usuarios Empresa */}
          {tab === 'empresas' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Cada empresa puede tener un login para acceder al portal homebanking (ver saldo, movimientos y pagar préstamos).</p>
              <Seccion titulo="Usuarios de Empresa" subtitulo="Acceden al portal con su email y contraseña" usuarios={usuEmpresas} onToggle={handleToggle} onEliminar={handleEliminar} onResetPwd={u => { setResetPwd(u); setNewPwd('') }} showEntidad />
              {!usuEmpresas.length && (
                <div className="text-center text-gray-400 text-sm mt-4">
                  No hay usuarios de empresa. Creá uno con el botón de arriba.
                </div>
              )}
            </div>
          )}

          {/* Usuarios Socio */}
          {tab === 'socios' && (
            <div>
              <p className="text-sm text-gray-500 mb-4">Los socios pueden acceder al portal para ver su cuenta y movimientos.</p>
              <Seccion titulo="Usuarios de Socio" subtitulo="Acceden al portal con su email y contraseña" usuarios={usuSocios} onToggle={handleToggle} onEliminar={handleEliminar} onResetPwd={u => { setResetPwd(u); setNewPwd('') }} showEntidad />
              {!usuSocios.length && (
                <div className="text-center text-gray-400 text-sm mt-4">
                  No hay usuarios de socio.
                </div>
              )}
            </div>
          )}

          {/* Reset */}
          {tab === 'reset' && <ResetSection onMsg={setMsg} />}
        </>
      )}

      {/* Modal nuevo usuario */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">Nuevo usuario</h2>
              <button onClick={() => { setShowModal(false); setError('') }} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <form onSubmit={handleCrear} className="p-6 space-y-4">
              {/* Rol */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Rol *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cajero', 'operador', 'admin', 'empresa', 'socio'] as const).map(r => (
                    <label key={r} className={`flex items-center justify-center border rounded-lg px-2 py-2 cursor-pointer text-xs transition-colors ${form.role === r ? 'border-blue-500 bg-blue-50 text-blue-700 font-medium' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                      <input type="radio" className="hidden" checked={form.role === r} onChange={() => setForm(f => ({ ...f, role: r, entityId: '' }))} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </div>

              {/* Vincular entidad */}
              {form.role === 'empresa' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Empresa *</label>
                  <select required value={form.entityId} onChange={e => setForm(f => ({ ...f, entityId: e.target.value, name: empresas.find(x => x.id === parseInt(e.target.value))?.razonSocial ?? f.name }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">— Seleccioná empresa —</option>
                    {empresas.map(e => <option key={e.id} value={e.id}>{e.razonSocial} ({e.numeroEmpresa})</option>)}
                  </select>
                </div>
              )}
              {form.role === 'socio' && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Socio *</label>
                  <select required value={form.entityId} onChange={e => { const s = socios.find(x => x.id === parseInt(e.target.value)); setForm(f => ({ ...f, entityId: e.target.value, name: s ? `${s.nombre} ${s.apellido}` : f.name })) }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">— Seleccioná socio —</option>
                    {socios.map(s => <option key={s.id} value={s.id}>{s.apellido}, {s.nombre} ({s.numeroSocio})</option>)}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className={form.role === 'cajero' ? '' : 'col-span-2'}>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre completo *</label>
                  <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                {form.role === 'cajero' && (
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">N° ventanilla</label>
                    <input type="number" min="1" value={form.numeroCaja} onChange={e => setForm(f => ({ ...f, numeroCaja: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="Auto" />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Email *</label>
                <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={form.role === 'empresa' ? 'empresa@bancoleal.com' : 'usuario@bancoleal.com'} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Contraseña *</label>
                <input type="password" required minLength={6} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Mínimo 6 caracteres" />
              </div>

              {error && <p className="text-red-500 text-xs">{error}</p>}
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setShowModal(false); setForm(emptyForm); setError('') }}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Creando...' : 'Crear usuario'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal reset contraseña */}
      {resetPwd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-base font-bold text-gray-900">Resetear contraseña</h2>
              <p className="text-sm text-gray-500 mt-0.5">{resetPwd.name}</p>
            </div>
            <form onSubmit={handleResetPwd} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nueva contraseña *</label>
                <input type="password" required minLength={6} value={newPwd} onChange={e => setNewPwd(e.target.value)} autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Mínimo 6 caracteres" />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setResetPwd(null)}
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Guardando...' : 'Cambiar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Seccion({ titulo, subtitulo, usuarios, onToggle, onEliminar, onResetPwd, showEntidad }: {
  titulo: string; subtitulo: string; usuarios: Usuario[]
  onToggle: (id: string, activo: boolean) => void
  onEliminar: (id: string, name: string) => void
  onResetPwd: (u: { id: string; name: string }) => void
  showEntidad?: boolean
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
                {showEntidad && <th className="text-left px-4 py-3 text-gray-600 font-medium">Vinculado a</th>}
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Rol</th>
                <th className="text-center px-4 py-3 text-gray-600 font-medium">Estado</th>
                <th className="px-4 py-3 w-36"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-gray-50 ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {u.name}{u.numeroCaja ? <span className="ml-1 text-xs text-gray-400">· V{u.numeroCaja}</span> : null}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{u.email}</td>
                  {showEntidad && (
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {u.entidad?.razonSocial ?? (u.entidad ? `${u.entidad.apellido ?? ''} ${u.entidad.nombre ?? ''}`.trim() : '—')}
                      {u.entidad?.numeroEmpresa && <span className="ml-1 text-gray-400">({u.entidad.numeroEmpresa})</span>}
                      {u.entidad?.numeroSocio && <span className="ml-1 text-gray-400">({u.entidad.numeroSocio})</span>}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${ROLE_COLOR[u.role] ?? ''}`}>{ROLE_LABEL[u.role]}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${u.activo ? 'bg-green-500' : 'bg-gray-300'}`} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex gap-2 justify-end text-xs font-medium">
                      <button onClick={() => onResetPwd({ id: u.id, name: u.name })} className="text-gray-400 hover:text-gray-700">Contraseña</button>
                      <button onClick={() => onToggle(u.id, u.activo)} className="text-gray-400 hover:text-gray-700">{u.activo ? 'Desactivar' : 'Activar'}</button>
                      <button onClick={() => onEliminar(u.id, u.name)} className="text-red-400 hover:text-red-600">Eliminar</button>
                    </div>
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

function ResetSection({ onMsg }: { onMsg: (m: string) => void }) {
  const [ejecutando, setEjecutando] = useState(false)
  const [confirm, setConfirm] = useState<string | null>(null)

  async function ejecutar(tipo: string) {
    setEjecutando(true)
    const res = await fetch('/api/reset', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo }),
    })
    const data = await res.json()
    onMsg(res.ok ? data.mensaje : 'Error: ' + data.error)
    setConfirm(null)
    setEjecutando(false)
  }

  const OPCIONES = [
    {
      id: 'operaciones',
      titulo: 'Reset de operaciones',
      desc: 'Borra todas las transacciones (movimientos, préstamos, pagos, historial). Conserva socios, empresas, cuentas y usuarios.',
      color: 'amber',
      accion: 'Resetear operaciones',
    },
    {
      id: 'completo',
      titulo: 'Reset completo del banco',
      desc: 'Borra absolutamente todo: socios, empresas, cuentas, usuarios y transacciones. Solo queda tu usuario administrador.',
      color: 'red',
      accion: 'Reset completo',
    },
  ]

  return (
    <div className="space-y-4 max-w-xl">
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
        <strong>Zona peligrosa.</strong> Estas acciones son irreversibles. Usá solo antes de la expo o cuando necesites empezar desde cero.
      </div>

      {OPCIONES.map(op => (
        <div key={op.id} className={`bg-white rounded-xl border border-${op.color}-200 p-5`}>
          <h3 className={`font-semibold text-${op.color}-700 mb-1`}>{op.titulo}</h3>
          <p className="text-sm text-gray-600 mb-4">{op.desc}</p>
          {confirm === op.id ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-red-600">¿Estás seguro? Esta acción no se puede deshacer.</p>
              <div className="flex gap-2">
                <button onClick={() => setConfirm(null)} className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancelar</button>
                <button onClick={() => ejecutar(op.id)} disabled={ejecutando}
                  className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                  {ejecutando ? 'Ejecutando...' : 'Sí, confirmar'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirm(op.id)}
              className={`bg-${op.color}-600 hover:bg-${op.color}-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors`}>
              {op.accion}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
