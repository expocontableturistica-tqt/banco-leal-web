// Utilidades de exportación a Excel (.xlsx) y PDF para los listados del banco.
// Las librerías pesadas (xlsx, jspdf) se cargan con import() dinámico para que
// no entren en el bundle inicial de cada página.

export type Col<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
  align?: 'left' | 'right' | 'center'
  moneda?: boolean
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Section<T = any> = {
  name?: string
  columns: Col<T>[]
  rows: T[]
  /** Fila de totales al pie, con una celda por columna ('' donde no va nada). */
  foot?: (string | number)[]
}

type AnySection = Section<any>
/* eslint-enable @typescript-eslint/no-explicit-any */

function slugFecha() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`
}

function fmtMoneda(n: number) {
  return '$' + n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export async function exportarExcel(filenameBase: string, sections: AnySection[]) {
  const XLSX = await import('xlsx')
  const wb = XLSX.utils.book_new()

  sections.forEach((s, i) => {
    const head = s.columns.map(c => c.header)
    const body = s.rows.map(row =>
      s.columns.map(c => {
        const v = c.value(row)
        return v == null ? '' : v
      })
    )
    const aoa: (string | number)[][] = [head, ...body]
    if (s.foot) aoa.push(s.foot.map(v => (v == null ? '' : v)))

    const ws = XLSX.utils.aoa_to_sheet(aoa)

    // Ancho de columnas según el contenido
    ws['!cols'] = s.columns.map((c, ci) => {
      const largos = [String(c.header).length, ...body.map(r => String(r[ci] ?? '').length)]
      return { wch: Math.min(Math.max(...largos) + 2, 60) }
    })

    // Formato de moneda para columnas marcadas
    s.columns.forEach((c, ci) => {
      if (!c.moneda) return
      for (let r = 1; r <= body.length; r++) {
        const ref = XLSX.utils.encode_cell({ r, c: ci })
        const cell = ws[ref]
        if (cell && typeof cell.v === 'number') cell.z = '"$"#,##0.00'
      }
    })

    const nombre = (s.name || `Hoja ${i + 1}`).replace(/[\\/?*[\]:]/g, '').slice(0, 31)
    XLSX.utils.book_append_sheet(wb, ws, nombre)
  })

  XLSX.writeFile(wb, `${filenameBase}_${slugFecha()}.xlsx`)
}

export async function exportarPDF(filenameBase: string, titulo: string, sections: AnySection[]) {
  const { jsPDF } = await import('jspdf')
  const autoTable = (await import('jspdf-autotable')).default

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const anchoPag = doc.internal.pageSize.getWidth()
  const altoPag = doc.internal.pageSize.getHeight()

  doc.setFontSize(14)
  doc.setTextColor(17, 24, 39)
  doc.text('Banco Leal S.A.', 40, 42)
  doc.setFontSize(11)
  doc.setTextColor(55, 65, 81)
  doc.text(titulo, 40, 60)
  doc.setFontSize(9)
  doc.setTextColor(120, 120, 120)
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, 40, 74)

  let startY = 92

  sections.forEach(s => {
    if (s.name) {
      doc.setFontSize(10)
      doc.setTextColor(31, 41, 55)
      doc.text(s.name, 40, startY)
      startY += 6
    }

    const columnStyles: Record<number, { halign: 'left' | 'right' | 'center' }> = {}
    s.columns.forEach((c, ci) => {
      if (c.align) columnStyles[ci] = { halign: c.align }
      else if (c.moneda) columnStyles[ci] = { halign: 'right' }
    })

    autoTable(doc, {
      startY: startY + 8,
      head: [s.columns.map(c => c.header)],
      body: s.rows.map(row =>
        s.columns.map(c => {
          const v = c.value(row)
          if (v == null || v === '') return '—'
          if (c.moneda && typeof v === 'number') return fmtMoneda(v)
          return String(v)
        })
      ),
      foot: s.foot ? [s.foot.map(v => (v == null ? '' : String(v)))] : undefined,
      styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8 },
      footStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39], fontStyle: 'bold' },
      columnStyles,
      margin: { left: 40, right: 40 },
    })

    // @ts-expect-error lastAutoTable lo agrega el plugin en runtime
    startY = (doc.lastAutoTable?.finalY ?? startY) + 28
  })

  const paginas = doc.getNumberOfPages()
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Página ${i} de ${paginas}`, anchoPag - 110, altoPag - 20)
  }

  doc.save(`${filenameBase}_${slugFecha()}.pdf`)
}
