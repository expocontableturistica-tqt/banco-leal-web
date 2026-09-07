import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  movimientosCuenta, movimientosCaja, prestamos, transacciones,
  prestaciones, operacionesCambio, pagosServicios, codigosExternos,
  asientosManuales, cuentas, caja, socios, empresas, users, reservasDivisas,
} from '@/lib/schema'
import { ne, isNull, not } from 'drizzle-orm'
import bcrypt from 'bcryptjs'

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tipo, nuevaPasswordAdmin } = await req.json()

  if (tipo === 'operaciones') {
    // Borra todas las transacciones pero mantiene cuentas, socios, empresas, usuarios
    await db.delete(movimientosCuenta)
    await db.delete(movimientosCaja)
    await db.delete(prestamos)
    await db.delete(transacciones)
    await db.delete(prestaciones)
    await db.delete(operacionesCambio)
    await db.delete(pagosServicios)
    await db.delete(codigosExternos)
    await db.delete(asientosManuales)
    // Poner saldo 0 en todas las cuentas
    await db.update(cuentas).set({ saldo: 0 })
    // Poner saldo 0 en todas las cajas
    await db.update(caja).set({ saldoEfectivo: 0 })
    // Poner reservas a 0
    await db.update(reservasDivisas).set({ monto: 0 })
    return NextResponse.json({ ok: true, mensaje: 'Operaciones borradas. Cuentas, socios, empresas y usuarios conservados.' })
  }

  if (tipo === 'completo') {
    // Borra todo excepto el usuario admin actual
    await db.delete(movimientosCuenta)
    await db.delete(movimientosCaja)
    await db.delete(prestamos)
    await db.delete(transacciones)
    await db.delete(prestaciones)
    await db.delete(operacionesCambio)
    await db.delete(pagosServicios)
    await db.delete(codigosExternos)
    await db.delete(asientosManuales)
    await db.delete(cuentas)
    await db.update(caja).set({ saldoEfectivo: 0 })
    await db.update(reservasDivisas).set({ monto: 0 })
    // Borrar todos los users menos el admin actual
    await db.delete(users).where(ne(users.id, session.user.id as string))
    // Borrar socios y empresas
    await db.delete(socios)
    await db.delete(empresas)
    return NextResponse.json({ ok: true, mensaje: 'Reset completo. Solo queda el usuario administrador.' })
  }

  if (tipo === 'password_admin' && nuevaPasswordAdmin) {
    if (nuevaPasswordAdmin.length < 6)
      return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })
    const hash = await bcrypt.hash(nuevaPasswordAdmin, 10)
    await db.update(users).set({ passwordHash: hash }).where(not(isNull(users.id)))
    return NextResponse.json({ ok: true, mensaje: 'Contraseña de todos los usuarios actualizada.' })
  }

  return NextResponse.json({ error: 'tipo inválido' }, { status: 400 })
}
