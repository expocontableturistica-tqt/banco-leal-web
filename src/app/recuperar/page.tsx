'use client'
import { useState } from 'react'
import Link from 'next/link'

type Tipo = 'socio' | 'empresa'

const inputCls =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function Campo({ label, ayuda, ...props }: { label: string; ayuda?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input className={inputCls} {...props} />
      {ayuda && <p className="text-xs text-gray-400 mt-1">{ayuda}</p>}
    </div>
  )
}

const VACIO = { numeroSocio: '', dni: '', numeroEmpresa: '', cbu: '', password: '', password2: '' }

export default function RecuperarPage() {
  const [tipo, setTipo] = useState<Tipo>('socio')
  const [f, setF] = useState(VACIO)
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [usuario, setUsuario] = useState<string | null>(null)

  const set = (k: keyof typeof VACIO) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF(p => ({ ...p, [k]: e.target.value }))

  async function recuperar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (f.password !== f.password2) { setError('Las contraseñas no coinciden'); return }
    setEnviando(true)
    const res = await fetch('/api/recuperar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo, ...f }),
    })
    const data = await res.json().catch(() => ({}))
    setEnviando(false)
    if (!res.ok) { setError(data.error || 'No se pudo cambiar la clave'); return }
    setUsuario(data.usuario)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-8">
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 w-full max-w-md">
        <div className="text-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.jpg" alt="Banco Leal S.A." width={72} height={72}
            style={{ display: 'block', width: 72, height: 72, margin: '0 auto 10px', borderRadius: '50%', objectFit: 'contain' }} />
          <h1 className="text-xl font-bold text-gray-900">Recuperar contraseña</h1>
          <p className="text-sm text-gray-500 mt-1">Confirmá tus datos y elegí una clave nueva</p>
        </div>

        {usuario ? (
          <div className="text-center space-y-3">
            <div className="text-4xl">🔑</div>
            <h2 className="font-semibold text-gray-900">¡Clave cambiada!</h2>
            <p className="text-sm text-gray-600">Tu usuario es <b className="font-mono">{usuario}</b></p>
            <Link href="/login"
              className="block w-full bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg py-2 text-sm">
              Ingresar
            </Link>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-1 bg-gray-100 rounded-lg p-1 mb-5">
              {(['socio', 'empresa'] as const).map(t => (
                <button key={t} type="button" onClick={() => { setTipo(t); setError('') }}
                  className={`py-1.5 rounded-md text-sm font-medium transition-colors ${
                    tipo === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}>
                  {t === 'socio' ? '👤 Soy socio' : '🏢 Soy empresa'}
                </button>
              ))}
            </div>

            <form onSubmit={recuperar} className="space-y-4">
              {tipo === 'socio' ? (
                <>
                  <Campo label="N° de socio" value={f.numeroSocio} onChange={set('numeroSocio')} required inputMode="numeric"
                    ayuda="Si no lo recordás, pedíselo al banco." />
                  <Campo label="DNI" value={f.dni} onChange={set('dni')} required inputMode="numeric" placeholder="Sin puntos" />
                </>
              ) : (
                <>
                  <Campo label="N° de empresa" value={f.numeroEmpresa} onChange={set('numeroEmpresa')} required placeholder="EMP-35852" />
                  <Campo label="CBU de la empresa" value={f.cbu} onChange={set('cbu')} required inputMode="numeric" placeholder="22 números"
                    ayuda="Está en SistemaCobro → Configuración → Banco Leal Web." />
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Campo label="Clave nueva" type="password" value={f.password} onChange={set('password')} required minLength={6}
                  autoComplete="new-password" />
                <Campo label="Repetila" type="password" value={f.password2} onChange={set('password2')} required minLength={6}
                  autoComplete="new-password" />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={enviando}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg py-2 text-sm transition-colors">
                {enviando ? 'Verificando…' : 'Cambiar clave'}
              </button>
            </form>
          </>
        )}

        <p className="text-center text-sm text-gray-500 mt-5">
          <Link href="/login" className="text-blue-600 font-medium hover:underline">← Volver al ingreso</Link>
        </p>
      </div>
    </div>
  )
}
