import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import Sidebar from '@/components/Sidebar'

export default async function BancoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || !['admin', 'cajero', 'operador'].includes(session.user?.role)) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        role={session.user.role as 'admin' | 'cajero' | 'operador'}
        userName={session.user.name ?? ''}
        numeroCaja={(session.user as { numeroCaja?: number | null }).numeroCaja}
      />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
    </div>
  )
}
