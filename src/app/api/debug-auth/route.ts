import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { users } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { compare } from 'bcryptjs'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const email = searchParams.get('email') ?? 'admin@bancoleal.com'

  const dbUrl = process.env.TURSO_DATABASE_URL ?? 'NOT_SET'

  try {
    const [user] = await db.select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      activo: users.activo,
      hasHash: users.passwordHash,
    }).from(users).where(eq(users.email, email)).limit(1)

    if (!user) return NextResponse.json({ found: false, email })

    const ok = await compare('admin123', user.hasHash)
    return NextResponse.json({
      found: true,
      email: user.email,
      name: user.name,
      role: user.role,
      activo: user.activo,
      passwordOk: ok,
    })
  } catch (e: unknown) {
    return NextResponse.json({ error: String(e), dbUrl }, { status: 500 })
  }
}
