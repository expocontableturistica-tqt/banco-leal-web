export default function DashboardPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-6">Resumen del día</p>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Socios', value: '—', icon: '👥' },
          { label: 'Cuentas activas', value: '—', icon: '🏦' },
          { label: 'Saldo total', value: '—', icon: '💰' },
          { label: 'Caja', value: '—', icon: '🗄️' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="text-xl mb-1">{card.icon}</div>
            <p className="text-xs text-gray-500">{card.label}</p>
            <p className="text-lg font-bold text-gray-900">{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
