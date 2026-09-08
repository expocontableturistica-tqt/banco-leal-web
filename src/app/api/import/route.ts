import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { socios, empresas } from '@/lib/schema'
import { crearCuentaEmpresa } from '@/lib/cuenta-utils'
import * as XLSX from 'xlsx'

// Normaliza un header: "Razón Social" → "razon_social"
function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
}

const KNOWN_HEADERS = new Set([
  'razon_social', 'razon', 'empresa', 'nombre', 'apellido',
  'cuit', 'dni', 'actividad', 'presupuesto', 'monto',
  'nombre_fantasia', 'documento',
])

function parseExcel(buffer: Buffer): Record<string, string>[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  if (!ws) return []

  const aoa: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
  if (aoa.length < 2) return []

  // Buscar la fila real de encabezados (puede haber filas de instrucciones arriba)
  let headerIdx = 0
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    const normalized = (aoa[i] as string[]).map(normalizeHeader)
    if (normalized.some(h => KNOWN_HEADERS.has(h))) { headerIdx = i; break }
  }

  const headers = (aoa[headerIdx] as string[]).map(normalizeHeader)

  return (aoa.slice(headerIdx + 1) as unknown[][])
    .map(row => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = String(row[i] ?? '').trim() })
      return obj
    })
    .filter(r => Object.values(r).some(v => v))
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

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  let rows: Record<string, string>[]
  try {
    rows = parseExcel(buffer)
  } catch {
    return NextResponse.json({ error: 'No se pudo leer el archivo Excel. Asegurate de usar el formato .xlsx' }, { status: 400 })
  }

  if (!rows.length) return NextResponse.json({ error: 'El archivo no tiene filas con datos' }, { status: 400 })

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
        actividad: (r.actividad || r.rubro || '').trim(),
      }).returning()
      await crearCuentaEmpresa(creada.id)
      creados++
    }
    return NextResponse.json({ ok: true, creados, omitidos })
  }

  return NextResponse.json({ error: 'tipo debe ser socios o empresas' }, { status: 400 })
}
