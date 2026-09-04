import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const BANCO_ROLES = ['admin', 'cajero']
const PORTAL_ROLES = ['empresa', 'socio']

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const path = nextUrl.pathname

  // API MediaPago — verifica API key, no sesión
  if (path.startsWith('/api/mediapago')) {
    const key = req.headers.get('x-api-key')
    if (key !== process.env.MEDIAPAGO_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.next()
  }

  // Rutas públicas
  if (path === '/login' || path.startsWith('/_next') || path.startsWith('/api/auth')) {
    return NextResponse.next()
  }

  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  const role = session.user?.role as string | undefined

  // Panel banco → solo admin y cajero
  if (path.startsWith('/dashboard') || path.startsWith('/socios') ||
      path.startsWith('/empresas') || path.startsWith('/cuentas') ||
      path.startsWith('/cajero') || path.startsWith('/caja') ||
      path.startsWith('/historial') || path.startsWith('/cambio') ||
      path.startsWith('/prestaciones') || path.startsWith('/servicios') ||
      path.startsWith('/cierre') || path.startsWith('/libros') ||
      path.startsWith('/configuracion')) {
    if (!role || !BANCO_ROLES.includes(role)) {
      return NextResponse.redirect(new URL('/portal', req.url))
    }
  }

  // Portal → solo empresa y socio
  if (path.startsWith('/portal')) {
    if (!role || !PORTAL_ROLES.includes(role)) {
      return NextResponse.redirect(new URL('/dashboard', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
