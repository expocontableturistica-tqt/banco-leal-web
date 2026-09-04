import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import bcrypt from 'bcryptjs'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
})

const db = drizzle(client)

const hash = await bcrypt.hash('admin123', 10)

await client.execute({
  sql: `INSERT OR IGNORE INTO users (id, email, password_hash, name, role, activo, created_at)
        VALUES (lower(hex(randomblob(16))), ?, ?, 'Administrador', 'admin', 1, datetime('now'))`,
  args: ['admin@bancoleal.com', hash],
})

console.log('✅ Admin creado: admin@bancoleal.com / admin123')
client.close()
