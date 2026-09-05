import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { signOut } from '@/auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session || !['empresa', 'socio'].includes(session.user?.role)) {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="BL" className="w-7 h-7 rounded-full" />
          <span className="font-bold text-gray-900">Banco Leal S.A.</span>
          <span className="text-xs bg-gray-100 text-gray-500 rounded px-2 py-0.5 ml-2 capitalize">
            {session.user.role}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{session.user.name}</span>
          <form action={async () => { 'use server'; await signOut({ redirectTo: '/login' }) }}>
            <button className="text-sm text-red-500 hover:text-red-700">Salir</button>
          </form>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">{children}</main>
    </div>
  )
}
