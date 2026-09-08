import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import * as XLSX from 'xlsx'

const TEMPLATES = {
  empresas: {
    headers: ['Razón Social', 'Nombre Fantasía', 'CUIT', 'Actividad'],
    ejemplo: [
      ['La Panadería del Centro', 'Panadería Centro', '', 'Panadería y confitería'],
      ['Ferretería El Clavo', 'El Clavo', '', 'Ferretería y materiales'],
    ],
    sheetName: 'Empresas',
    filename: 'plantilla_empresas.xlsx',
    notas: ['INSTRUCCIONES:', 'Completá desde la fila 4 en adelante (borrar los ejemplos)', 'Razón Social es obligatorio', 'CUIT: solo números sin guiones (ej: 20123456789), opcional', 'Las demás columnas son opcionales'],
  },
  socios: {
    headers: ['Apellido', 'Nombre', 'DNI', 'Presupuesto'],
    ejemplo: [
      ['García', 'Juan', '40123456', '50000'],
      ['Rodríguez', 'María', '41234567', '50000'],
    ],
    sheetName: 'Socios',
    filename: 'plantilla_socios.xlsx',
    notas: ['INSTRUCCIONES:', 'Completá desde la fila 4 en adelante (borrar los ejemplos)', 'Apellido y Nombre son obligatorios', 'DNI: opcional', 'Presupuesto: monto asignado (puede quedar en 0)'],
  },
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session || !['admin', 'cajero'].includes(session.user?.role ?? ''))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const tipo = searchParams.get('tipo') as keyof typeof TEMPLATES | null
  if (!tipo || !TEMPLATES[tipo])
    return NextResponse.json({ error: 'tipo debe ser "empresas" o "socios"' }, { status: 400 })

  const { headers, ejemplo, sheetName, filename, notas } = TEMPLATES[tipo]

  const wb = XLSX.utils.book_new()

  // Armar filas: notas, luego encabezados, luego ejemplos
  const notasRows: string[][] = notas.map((n, i) => i === 0 ? [n] : ['', n])
  const aoa: unknown[][] = [
    ...notasRows,
    headers,
    ...ejemplo,
  ]

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Ancho de columnas
  const colWidths = headers.map((h, ci) =>
    Math.max(h.length, ...ejemplo.map(r => String(r[ci] ?? '').length), 15)
  )
  ws['!cols'] = colWidths.map(w => ({ wch: w + 3 }))

  XLSX.utils.book_append_sheet(wb, ws, sheetName)

  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
  const uint8 = new Uint8Array(buf)

  return new Response(uint8, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
