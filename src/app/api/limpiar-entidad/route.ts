import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import {
  movimientosCuenta, prestamos, transacciones, prestaciones,
  operacionesCambio, pagosServicios, codigosExternos, cuentas,
} from '@/lib/schema'
import { eq, inArray } from 'drizzle-orm'

export async function POST(req: Request) {
  const session = await auth()
  if (!session || session.user?.role !== 'admin')
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { tipo, id } = await req.json()
  if (!tipo || !id) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  if (tipo === 'empresa') {
    const cuentasEmp = await db.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.empresaId, id))
    const cuentaIds = cuentasEmp.map(c => c.id)
    if (cuentaIds.length) {
      await db.delete(movimientosCuenta).where(inArray(movimientosCuenta.cuentaId, cuentaIds))
      await db.delete(codigosExternos).where(inArray(codigosExternos.cuentaId, cuentaIds))
      await db.update(cuentas).set({ saldo: 0 }).where(inArray(cuentas.id, cuentaIds))
    }
    await db.delete(prestamos).where(eq(prestamos.empresaId, id))
    return NextResponse.json({ ok: true, mensaje: 'Movimientos y préstamos de la empresa borrados. La cuenta y la empresa se conservan.' })
  }

  if (tipo === 'socio') {
    const cuentasSoc = await db.select({ id: cuentas.id }).from(cuentas).where(eq(cuentas.socioId, id))
    const cuentaIds = cuentasSoc.map(c => c.id)
    if (cuentaIds.length) {
      await db.delete(movimientosCuenta).where(inArray(movimientosCuenta.cuentaId, cuentaIds))
      await db.delete(codigosExternos).where(inArray(codigosExternos.cuentaId, cuentaIds))
      await db.update(cuentas).set({ saldo: 0 }).where(inArray(cuentas.id, cuentaIds))
    }
    await db.delete(transacciones).where(eq(transacciones.socioId, id))
    await db.delete(prestaciones).where(eq(prestaciones.socioId, id))
    await db.delete(operacionesCambio).where(eq(operacionesCambio.socioId, id))
    await db.delete(pagosServicios).where(eq(pagosServicios.socioId, id))
    return NextResponse.json({ ok: true, mensaje: 'Movimientos y transacciones del socio borrados. La cuenta y el socio se conservan.' })
  }

  return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
}
