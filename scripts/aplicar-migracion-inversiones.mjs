// Crea la tabla `inversiones` en la base Turso (migración 0005).
// Uso:  node --env-file=.env.local scripts/aplicar-migracion-inversiones.mjs
//
// Es seguro: solo hace CREATE TABLE IF NOT EXISTS, no toca datos existentes.
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const url = (process.env.TURSO_DATABASE_URL ?? '').replace('libsql://', 'https://')
const authToken = process.env.TURSO_AUTH_TOKEN
if (!url || !authToken) {
  console.error('Faltan TURSO_DATABASE_URL / TURSO_AUTH_TOKEN. Corré con:  node --env-file=.env.local scripts/aplicar-migracion-inversiones.mjs')
  process.exit(1)
}

const here = dirname(fileURLToPath(import.meta.url))
const sqlPath = join(here, '..', 'drizzle', '0005_salty_gertrude_yorkes.sql')
const raw = readFileSync(sqlPath, 'utf8')

const stmts = raw
  .split('--> statement-breakpoint')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s.replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS '))

const client = createClient({ url, authToken })

try {
  for (const stmt of stmts) {
    await client.execute(stmt)
    console.log('OK :', stmt.replace(/\s+/g, ' ').slice(0, 70), '…')
  }
  const check = await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='inversiones'")
  console.log(check.rows.length ? '\n✓ Tabla `inversiones` lista.' : '\n✗ Algo falló: la tabla no aparece.')
} catch (e) {
  console.error('Error aplicando la migración:', e.message)
  process.exit(1)
} finally {
  client.close()
}
