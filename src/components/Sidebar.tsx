'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'

type Role = 'admin' | 'cajero' | 'operador'

const NAV: { href: string; label: string; icon: string; roles: Role[] }[] = [
  { href: '/dashboard',     label: 'Dashboard',        icon: '📊', roles: ['admin', 'cajero'] },
  { href: '/socios',        label: 'Socios',            icon: '👥', roles: ['admin', 'cajero'] },
  { href: '/empresas',      label: 'Empresas',          icon: '🏢', roles: ['admin', 'cajero'] },
  { href: '/cajero',        label: 'Cajero',            icon: '💵', roles: ['admin', 'cajero'] },
  { href: '/cuentas',       label: 'Cuentas',           icon: '🏦', roles: ['admin', 'cajero'] },
  { href: '/caja',          label: 'Caja',              icon: '🗄️', roles: ['admin', 'cajero'] },
  { href: '/historial',     label: 'Historial',         icon: '📋', roles: ['admin', 'cajero', 'operador'] },
  { href: '/cambio',        label: 'Mesa de Cambio',    icon: '💱', roles: ['admin', 'cajero'] },
  { href: '/prestaciones',  label: 'Prestaciones',      icon: '⭐', roles: ['admin', 'operador'] },
  { href: '/servicios',     label: 'Servicios',         icon: '⚙️', roles: ['admin', 'cajero'] },
  { href: '/cierre',        label: 'Cierre del Día',    icon: '🔒', roles: ['admin'] },
  { href: '/libros',        label: 'Libros Contables',  icon: '📖', roles: ['admin'] },
  { href: '/configuracion', label: 'Configuración',     icon: '🔧', roles: ['admin'] },
]

const ROLE_LABEL: Record<Role, string> = {
  admin:    'Administrador',
  cajero:   'Cajero',
  operador: 'Operador',
}

export default function Sidebar({ role, userName, numeroCaja }: { role: Role; userName: string; numeroCaja?: number | null }) {
  const path = usePathname()
  const items = NAV.filter(n => n.roles.includes(role))

  return (
    <aside className="w-56 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-gray-100">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-mark.svg" alt="BL" className="w-8 h-9 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Banco Leal S.A.</p>
            <p className="text-xs text-gray-400">
              {ROLE_LABEL[role]}
              {role === 'cajero' && numeroCaja ? ` · Ventanilla ${numeroCaja}` : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {items.map(item => {
          const active = path === item.href || path.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-4 py-2 text-sm transition-colors ${
                active
                  ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-gray-100">
        <p className="text-xs font-medium text-gray-700 truncate">{userName}</p>
        <p className="text-xs text-gray-400 truncate mb-2">{ROLE_LABEL[role]}</p>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="text-xs text-red-500 hover:text-red-700 transition-colors"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}
