import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const BANCO_ROLES = ['admin', 'cajero', 'operador']
const PORTAL_ROLES = ['empresa', 'socio']

// Rutas a las que cada rol puede acceder dentro del panel banco
const RUTAS_OPERADOR = ['/prestaciones', '/historial']
const RUTAS_CAJERO   = ['/dashboard', '/socios', '/empresas', '/cajero', '/caja', '/cuentas', '/historial', '/cambio', '/servicios']
const RUTAS_ADMIN    = [...RUTAS_CAJERO, '/prestaciones', '/cierre', '/libros', '/configuracion']

function puedeAcceder(path: string, rutas: string[]) {
  return rutas.some(r => path === r || path.startsWith(r + '/'))
}

export default auth((req) => {
  const { nextUrl, auth: session } = req
  const path = nextUrl.pathname

  // API MediaPago — verifica API key, no sesión
  if (path.startsWith('/api/mediapago')) {
    const key = req.headers.get('x-api-key')
    if (key !== process.env.MEDIAPAGO_API_KEY)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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

  // Panel banco
  const esPanelBanco = BANCO_ROLES.includes(role ?? '')
  const esPortal     = PORTAL_ROLES.includes(role ?? '')

  if (esPanelBanco) {
    if (path.startsWith('/portal'))
      return NextResponse.redirect(new URL('/dashboard', req.url))

    // Operador: solo prestaciones + historial
    if (role === 'operador' && !puedeAcceder(path, RUTAS_OPERADOR))
      return NextResponse.redirect(new URL('/prestaciones', req.url))

    // Cajero: no puede acceder a cierre/libros/config/prestaciones
    if (role === 'cajero' && !puedeAcceder(path, RUTAS_CAJERO))
      return NextResponse.redirect(new URL('/dashboard', req.url))

    return NextResponse.next()
  }

  // Portal empresa/socio
  if (esPortal) {
    if (!path.startsWith('/portal') && !path.startsWith('/api'))
      return NextResponse.redirect(new URL('/portal', req.url))
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/login', req.url))
})

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
