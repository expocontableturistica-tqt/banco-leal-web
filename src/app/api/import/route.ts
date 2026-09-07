import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { socios, empresas } from '@/lib/schema'
import { crearCuentaEmpresa } from '@/lib/cuenta-utils'

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
  return lines.slice(1).map(line => {
    const cols = line.split(/[,;\t]/).map(c => c.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = cols[i] ?? '' })
    return row
  }).filter(r => Object.values(r).some(v => v))
}

function generarNumero(prefix: string, usados: Set<string>): string {
  let n: string
  do { n = prefix + String(Math.floor(10000 + Math.random() * 90000)) } while (usados.has(n))
  return n
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const formData = await req.formData()
  const tipo = formData.get('tipo') as string
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'Archivo requerido' }, { status: 400 })

  const text = await file.text()
  const rows = parseCSV(text)
  if (!rows.length) return NextResponse.json({ error: 'El archivo no tiene filas válidas' }, { status: 400 })

  if (tipo === 'socios') {
    const existing = await db.select({ ns: socios.numeroSocio }).from(socios)
    const usados = new Set(existing.map(r => r.ns))
    let creados = 0, omitidos = 0

    for (const r of rows) {
      const nombre = (r.nombre || '').trim()
      const apellido = (r.apellido || '').trim()
      if (!nombre && !apellido) { omitidos++; continue }
      const ns = generarNumero('S', usados)
      usados.add(ns)
      await db.insert(socios).values({
        numeroSocio: ns,
        nombre,
        apellido,
        dni: (r.dni || r.documento || '').trim(),
        montoAsignado: parseFloat(r.presupuesto || r.monto || '0') || 0,
      })
      creados++
    }
    return NextResponse.json({ ok: true, creados, omitidos })
  }

  if (tipo === 'empresas') {
    const existing = await db.select({ ne: empresas.numeroEmpresa }).from(empresas)
    const usados = new Set(existing.map(r => r.ne))
    let creados = 0, omitidos = 0

    for (const r of rows) {
      const razonSocial = (r.razon_social || r.razon || r.empresa || r.nombre || '').trim()
      if (!razonSocial) { omitidos++; continue }
      const cuit = (r.cuit || '').replace(/\D/g, '')
      if (cuit && cuit.length !== 11) { omitidos++; continue }
      const ne = generarNumero('EMP-', usados)
      usados.add(ne)
      const [creada] = await db.insert(empresas).values({
        numeroEmpresa: ne,
        razonSocial,
        nombreFantasia: (r.nombre_fantasia || '').trim(),
        cuit,
        actividad: (r.actividad || '').trim(),
      }).returning()
      await crearCuentaEmpresa(creada.id)
      creados++
    }
    return NextResponse.json({ ok: true, creados, omitidos })
  }

  return NextResponse.json({ error: 'tipo debe ser socios o empresas' }, { status: 400 })
}
