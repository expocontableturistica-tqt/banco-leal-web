import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import Sidebar from '@/components/Sidebar'

export default async function BancoLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role)) {
    redirect('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={session.user.role as 'admin' | 'cajero'} userName={session.user.name ?? ''} />
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">{children}</main>
    </div>
  )
}
