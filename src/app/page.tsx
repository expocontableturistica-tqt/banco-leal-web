import { redirect } from 'next/navigation'
import { auth } from '@/auth'

export default async function Home() {
  const session = await auth()
  if (!session) redirect('/login')
  const role = session.user?.role
  if (role === 'empresa' || role === 'socio') redirect('/portal')
  if (role === 'operador') redirect('/prestaciones')
  redirect('/dashboard')
}
