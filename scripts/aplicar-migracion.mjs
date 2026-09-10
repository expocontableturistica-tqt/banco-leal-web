// Aplica un archivo de migración de drizzle/ a la base Turso.
// Uso:  node scripts/aplicar-migracion.mjs 0006_nombre.sql
// CREATE TABLE / INDEX se convierten a IF NOT EXISTS: correrlo dos veces no rompe nada.
import { createClient } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnv(file) {
  let raw
  try { raw = readFileSync(join(root, file), 'utf8') } catch { return {} }
  const env = {}
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}

const archivo = process.argv[2]
if (!archivo) {
  console.error('Indicá el archivo:  node scripts/aplicar-migracion.mjs 0006_nombre.sql')
  process.exit(1)
}

const env = { ...loadEnv('.env.local'), ...loadEnv('.env'), ...process.env }
const url = (env.TURSO_DATABASE_URL ?? '').replace('libsql://', 'https://')
const authToken = env.TURSO_AUTH_TOKEN
if (!url || !authToken) {
  console.error('No encontré TURSO_DATABASE_URL / TURSO_AUTH_TOKEN en .env.local')
  process.exit(1)
}

const stmts = readFileSync(join(root, 'drizzle', basename(archivo)), 'utf8')
  .split('--> statement-breakpoint')
  .map(s => s.trim())
  .filter(Boolean)
  .map(s => s
    .replace(/^CREATE TABLE /i, 'CREATE TABLE IF NOT EXISTS ')
    .replace(/^CREATE UNIQUE INDEX /i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX /i, 'CREATE INDEX IF NOT EXISTS '))

const client = createClient({ url, authToken })
try {
  for (const stmt of stmts) {
    await client.execute(stmt)
    console.log('OK :', stmt.replace(/\s+/g, ' ').slice(0, 70), '…')
  }
  console.log('\n✓ Migración aplicada:', basename(archivo))
} catch (e) {
  console.error('Error aplicando la migración:', e.message)
  process.exit(1)
} finally {
  client.close()
}
