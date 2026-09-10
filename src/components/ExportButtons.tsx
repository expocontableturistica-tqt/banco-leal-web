'use client'

import { useState } from 'react'
import { exportarExcel, exportarPDF, type Section } from '@/lib/export'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Props = {
  filenameBase: string
  titulo: string
  sections: Section<any>[]
  disabled?: boolean
  className?: string
}

export default function ExportButtons({ filenameBase, titulo, sections, disabled, className }: Props) {
  const [busy, setBusy] = useState<'' | 'xlsx' | 'pdf'>('')

  const totalRows = sections.reduce((a, s) => a + s.rows.length, 0)
  const off = disabled || totalRows === 0 || busy !== ''

  async function run(kind: 'xlsx' | 'pdf') {
    if (off) return
    setBusy(kind)
    try {
      if (kind === 'xlsx') await exportarExcel(filenameBase, sections)
      else await exportarPDF(filenameBase, titulo, sections)
    } catch (e) {
      console.error('Export error', e)
      alert('No se pudo generar el archivo. Reintentá en unos segundos.')
    } finally {
      setBusy('')
    }
  }

  const base =
    'inline-flex items-center gap-1.5 border rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className={`flex gap-2 ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => run('xlsx')}
        disabled={off}
        title={totalRows === 0 ? 'No hay datos para exportar' : 'Descargar planilla Excel'}
        className={`${base} border-green-300 text-green-700 hover:bg-green-50`}
      >
        {busy === 'xlsx' ? 'Generando…' : '↓ Excel'}
      </button>
      <button
        type="button"
        onClick={() => run('pdf')}
        disabled={off}
        title={totalRows === 0 ? 'No hay datos para exportar' : 'Descargar PDF'}
        className={`${base} border-red-300 text-red-700 hover:bg-red-50`}
      >
        {busy === 'pdf' ? 'Generando…' : '↓ PDF'}
      </button>
    </div>
  )
}
