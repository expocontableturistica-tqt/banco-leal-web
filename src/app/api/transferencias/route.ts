import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { cuentas, movimientosCuenta, codigosExternos } from '@/lib/schema'
import { eq } from 'drizzle-orm'
import { generarCodigoTransfer, verificarCodigoTransfer } from '@/lib/qr'

// POST /api/transferencias
// body: { accion: 'emitir' | 'acreditar', cuentaId, monto, concepto, codigo? }
export async function POST(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { accion, cuentaId, monto, concepto, codigo } = body

  if (accion === 'emitir') {
    const m = Math.round((parseFloat(monto) || 0) * 100) / 100
    if (m <= 0) return NextResponse.json({ error: 'El monto debe ser mayor a 0' }, { status: 400 })

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    if (cuenta.estado === 'inactiva') return NextResponse.json({ error: 'Cuenta inactiva' }, { status: 400 })
    if (cuenta.saldo < m) return NextResponse.json({ error: 'Saldo insuficiente' }, { status: 400 })

    const cod = generarCodigoTransfer(m)
    const nuevoSaldo = Math.round((cuenta.saldo - m) * 100) / 100

    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuentaId))
    await db.insert(movimientosCuenta).values({
      cuentaId, tipo: 'debito', monto: -m,
      concepto: concepto ?? `Transferencia enviada (${cod})`,
      saldoPosterior: nuevoSaldo,
    })
    await db.insert(codigosExternos).values({ codigo: cod, tipo: 'emitido', monto: m, cuentaId })

    return NextResponse.json({ ok: true, codigo: cod, monto: m, saldoNuevo: nuevoSaldo })
  }

  if (accion === 'acreditar') {
    const v = verificarCodigoTransfer(codigo)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

    const previo = await db.select().from(codigosExternos).where(eq(codigosExternos.codigo, v.codigo!)).limit(1)
    if (previo[0]?.tipo === 'acreditado') return NextResponse.json({ error: 'Código ya acreditado' }, { status: 400 })
    if (previo[0]?.tipo === 'emitido') return NextResponse.json({ error: 'Código emitido por este banco: acreditarlo en el otro sistema' }, { status: 400 })

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.id, cuentaId)).limit(1)
    if (!cuenta) return NextResponse.json({ error: 'Cuenta no encontrada' }, { status: 404 })
    if (cuenta.estado === 'inactiva') return NextResponse.json({ error: 'Cuenta inactiva' }, { status: 400 })

    const nuevoSaldo = Math.round((cuenta.saldo + v.monto!) * 100) / 100
    await db.update(cuentas).set({ saldo: nuevoSaldo }).where(eq(cuentas.id, cuentaId))
    await db.insert(movimientosCuenta).values({
      cuentaId, tipo: 'credito', monto: v.monto!,
      concepto: concepto ?? `Transferencia recibida (${v.codigo})`,
      saldoPosterior: nuevoSaldo,
    })
    await db.insert(codigosExternos).values({ codigo: v.codigo!, tipo: 'acreditado', monto: v.monto!, cuentaId })

    return NextResponse.json({ ok: true, monto: v.monto, saldoNuevo: nuevoSaldo })
  }

  return NextResponse.json({ error: 'Acción desconocida' }, { status: 400 })
}
