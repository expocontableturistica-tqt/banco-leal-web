import NextAuth, { type DefaultSession } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { compare } from 'bcryptjs'
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'

export type UserRole = 'admin' | 'cajero' | 'operador' | 'empresa' | 'socio'

export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Contraseña', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        const [user] = await db
          .select()
          .from(users)
          // Sin distinguir mayúsculas: en el celular el teclado suele poner la primera en mayúscula
          .where(sql`lower(${users.email}) = ${String(credentials.email).trim().toLowerCase()}`)
          .limit(1)
        if (!user || !user.activo) return null
        const ok = await compare(String(credentials.password), user.passwordHash)
        if (!ok) return null
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          entityId: user.entityId,
          numeroCaja: user.numeroCaja,
        }
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: UserRole }).role
        token.entityId = (user as { entityId: number | null }).entityId
        token.numeroCaja = (user as { numeroCaja: number | null }).numeroCaja
      }
      return token
    },
    session({ session, token }) {
      session.user.role = token.role as UserRole
      session.user.entityId = token.entityId as number | null
      session.user.numeroCaja = token.numeroCaja as number | null
      return session
    },
  },
})

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      role: UserRole
      entityId: number | null
      numeroCaja: number | null
    }
  }
}
