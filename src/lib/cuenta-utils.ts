import { db } from '@/lib/db'
import { cuentas } from '@/lib/schema'
import { generarCBU } from '@/lib/qr'
import { max } from 'drizzle-orm'

export async function crearCuentaEmpresa(empresaId: number, tipo: 'CA' | 'CC' = 'CA') {
  const [{ maxId }] = await db.select({ maxId: max(cuentas.id) }).from(cuentas)
  const nextId = (maxId ?? 0) + 1
  const [cuenta] = await db.insert(cuentas).values({
    empresaId,
    tipo,
    cbu: generarCBU(nextId + 1000000),
    alias: `BANCO.LEAL.EMP${String(empresaId).padStart(5, '0')}`,
    saldo: 0,
    estado: 'activa',
  }).returning()
  return cuenta
}

export async function crearCuentaSocio(socioId: number) {
  const [{ maxId }] = await db.select({ maxId: max(cuentas.id) }).from(cuentas)
  const nextId = (maxId ?? 0) + 1
  const [cuenta] = await db.insert(cuentas).values({
    socioId,
    tipo: 'CA',
    cbu: generarCBU(nextId),
    alias: `BANCO.LEAL.SOC${String(socioId).padStart(5, '0')}`,
    saldo: 0,
    estado: 'activa',
  }).returning()
  return cuenta
}
