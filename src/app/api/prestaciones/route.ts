import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { caja, movimientosCaja, prestaciones, socios, transacciones } from '@/lib/schema'
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm'
import { qrDesdePayload, qrPrestacionMediaPago } from '@/lib/qr'
import { ES_TIPO_PRESTACION, PLANES_TARJETA } from '@/lib/prestaciones'
import { r2 } from '@/lib/prestamos'

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function leerDatos(json: string | null): Record<string, unknown> {
  try { return json ? JSON.parse(json) : {} } catch { return {} }
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'operador'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)

  // ?qr=ID → volver a mostrar el QR de una prestación ya emitida
  const qrDe = parseInt(searchParams.get('qr') ?? '')
  if (qrDe) {
    const [p] = await db.select().from(prestaciones).where(eq(prestaciones.id, qrDe)).limit(1)
    const payload = leerDatos(p?.datos ?? null).qrPayload as { ts: number } | undefined
    if (!payload) return NextResponse.json({ error: 'Esta prestación es anterior al QR de MediaPago' }, { status: 404 })
    const venceTs = payload.ts + 86400
    return NextResponse.json({
      dataUrl: await qrDesdePayload(payload),
      venceTs,
      vencido: venceTs * 1000 < Date.now(),
    })
  }

  const socioId = searchParams.get('socioId')
  const tipo = searchParams.get('tipo')

  const rows = await db.select({
    id: prestaciones.id,
    socioId: prestaciones.socioId,
    tipo: prestaciones.tipo,
    descripcion: prestaciones.descripcion,
    datos: prestaciones.datos,
    tid: prestaciones.tid,
    createdAt: prestaciones.createdAt,
    socioNombre: socios.nombre,
    socioApellido: socios.apellido,
    socioNumero: socios.numeroSocio,
  })
  .from(prestaciones)
  .leftJoin(socios, eq(prestaciones.socioId, socios.id))
  .orderBy(desc(prestaciones.id))
  .limit(100)

  // Drizzle SQLite no tiene where condicional elegante; filtramos en JS
  const filtrados = rows
    .filter(r => (!socioId || String(r.socioId) === socioId) && (!tipo || r.tipo === tipo))
    .map(r => {
      const { qrPayload, ...datos } = leerDatos(r.datos)
      return { ...r, datos: JSON.stringify(datos), tieneQr: !!qrPayload }
    })

  return NextResponse.json(filtrados)
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'operador'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { socioId, tipo, descripcion, datos } = await req.json()

  if (!socioId || !tipo)
    return NextResponse.json({ error: 'socioId y tipo son requeridos' }, { status: 400 })
  if (!ES_TIPO_PRESTACION(tipo))
    return NextResponse.json({ error: 'Tipo de prestación inválido' }, { status: 400 })

  const [socio] = await db.select().from(socios).where(eq(socios.id, socioId)).limit(1)
  if (!socio) return NextResponse.json({ error: 'Socio no encontrado' }, { status: 404 })

  const d = (datos ?? {}) as Record<string, unknown>
  const texto = (v: unknown) => String(v ?? '').trim()
  const numero = (v: unknown) => r2(Number(v))

  // Cada tipo viaja con los datos que la app espera; si falta alguno, el QR no sirve
  let datosQr: Record<string, unknown>
  if (tipo === 'banco_tarjeta') {
    const plan = texto(d.plan)
    if (!PLANES_TARJETA.some(p => p.plan === plan))
      return NextResponse.json({ error: 'Elegí un plan de tarjeta válido' }, { status: 400 })
    datosQr = { plan, titular: texto(d.titular) || `${socio.nombre} ${socio.apellido}`.toUpperCase() }
  } else if (tipo === 'banco_seguro') {
    const tipoSeguro = texto(d.tipoSeguro)
    const cobertura = numero(d.cobertura)
    const vigencia = Math.trunc(Number(d.vigencia))
    if (!tipoSeguro) return NextResponse.json({ error: 'Indicá el tipo de seguro' }, { status: 400 })
    if (!(cobertura > 0)) return NextResponse.json({ error: 'Indicá el monto de la cobertura' }, { status: 400 })
    if (!(vigencia > 0 && vigencia <= 120)) return NextResponse.json({ error: 'La vigencia va de 1 a 120 meses' }, { status: 400 })
    datosQr = { tipoSeguro, cobertura, vigencia }
  } else if (tipo === 'banco_limite') {
    const tarjetaRef = texto(d.tarjetaRef)
    const incremento = numero(d.incremento)
    if (!/^\d{4}$/.test(tarjetaRef))
      return NextResponse.json({ error: 'Poné los últimos 4 números de la tarjeta del socio' }, { status: 400 })
    if (!(incremento > 0)) return NextResponse.json({ error: 'Indicá en cuánto aumenta el límite' }, { status: 400 })
    datosQr = { tarjetaRef, incremento }
  } else {
    const monto = numero(d.monto)
    const motivo = texto(d.motivo)
    if (!(monto > 0)) return NextResponse.json({ error: 'Indicá el monto del bono' }, { status: 400 })
    if (!motivo) return NextResponse.json({ error: 'Indicá el motivo del bono' }, { status: 400 })
    datosQr = { monto, motivo }
  }

  // El bono se acredita en la billetera del socio: la plata sale de la bóveda al
  // emitir el QR, porque MediaPago no le avisa al banco cuando lo escanea.
  const montoBono = tipo === 'banco_bono' ? (datosQr.monto as number) : 0
  let boveda: typeof caja.$inferSelect | undefined
  if (montoBono > 0) {
    ;[boveda] = await db.select().from(caja)
      .where(and(isNull(caja.userId), eq(caja.estado, 'abierta')))
      .orderBy(desc(caja.id)).limit(1)
    if (!boveda)
      return NextResponse.json({ error: 'La bóveda está cerrada. Abrila desde el menú Caja.' }, { status: 400 })
    if (boveda.saldoEfectivo + 0.001 < montoBono)
      return NextResponse.json({ error: `Saldo insuficiente en bóveda (disponible: $${fmt(boveda.saldoEfectivo)})` }, { status: 400 })
  }

  const qr = await qrPrestacionMediaPago(tipo, datosQr)

  if (boveda) {
    const [bovedaAct] = await db.update(caja)
      .set({ saldoEfectivo: sql`round(${caja.saldoEfectivo} - ${montoBono}, 2)` })
      .where(and(eq(caja.id, boveda.id), eq(caja.estado, 'abierta'), gte(caja.saldoEfectivo, montoBono - 0.001)))
      .returning()
    if (!bovedaAct)
      return NextResponse.json({ error: 'Saldo insuficiente en bóveda' }, { status: 400 })
    await db.insert(transacciones).values({
      tid: qr.tid,
      monto: montoBono,
      socioId,
      descripcion: `Bono MediaPago: ${datosQr.motivo}`,
    })
    await db.insert(movimientosCaja).values({
      cajaId: boveda.id,
      tipo: 'egreso',
      monto: montoBono,
      concepto: `Bono a ${socio.apellido}, ${socio.nombre} (${datosQr.motivo})`,
      saldoPosterior: bovedaAct.saldoEfectivo,
    })
  }

  const [creada] = await db.insert(prestaciones).values({
    socioId,
    tipo,
    descripcion: String(descripcion ?? ''),
    datos: JSON.stringify({ ...datosQr, qrPayload: qr.payload }),
    tid: qr.tid,
  }).returning()

  return NextResponse.json({ ...creada, dataUrl: qr.dataUrl, payload: qr.payload }, { status: 201 })
}
