import { auth } from '@/auth'

export default async function PortalPage() {
  const session = await auth()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">
        Bienvenido, {session?.user?.name}
      </h1>
      <p className="text-sm text-gray-500 mb-6">Panel de {session?.user?.role}</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: 'Mis cuentas', href: '/portal/cuentas', icon: '🏦', desc: 'Ver saldos y CBU' },
          { label: 'Transferir', href: '/portal/transferencias', icon: '💸', desc: 'Enviar fondos' },
          { label: 'Movimientos', href: '/portal/movimientos', icon: '📋', desc: 'Historial de operaciones' },
        ].map(item => (
          <a
            key={item.href}
            href={item.href}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow"
          >
            <div className="text-2xl mb-2">{item.icon}</div>
            <p className="font-semibold text-gray-900">{item.label}</p>
            <p className="text-sm text-gray-500 mt-0.5">{item.desc}</p>
          </a>
        ))}
      </div>
    </div>
  )
}
