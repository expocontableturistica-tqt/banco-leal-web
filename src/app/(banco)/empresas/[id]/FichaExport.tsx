'use client'

import ExportButtons from '@/components/ExportButtons'

type Mov = { createdAt: string; concepto: string | null; tipo: string; monto: number; saldoPosterior: number }
type Loan = { concepto: string | null; monto: number; saldoPendiente: number; cuotas: number; cuotasPagadas: number; estado: string; createdAt: string }

function fmtDate(str: string) {
  return new Date(str + 'Z').toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

function slugify(s: string) {
  return (
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w]+/g, '_')
      .replace(/^_|_$/g, '') || 'empresa'
  )
}

export default function FichaExport({ nombre, movimientos, loans }: { nombre: string; movimientos: Mov[]; loans: Loan[] }) {
  const sections = [
    {
      name: 'Movimientos de cuenta',
      columns: [
        { header: 'Fecha', value: (m: Mov) => fmtDate(m.createdAt) },
        { header: 'Concepto', value: (m: Mov) => m.concepto || '' },
        { header: 'Tipo', value: (m: Mov) => m.tipo },
        { header: 'Monto', value: (m: Mov) => (m.tipo === 'credito' ? m.monto : -m.monto), moneda: true },
        { header: 'Saldo posterior', value: (m: Mov) => m.saldoPosterior, moneda: true },
      ],
      rows: movimientos,
    },
    ...(loans.length
      ? [{
          name: 'Préstamos',
          columns: [
            { header: 'Concepto', value: (p: Loan) => p.concepto || '' },
            { header: 'Monto', value: (p: Loan) => p.monto, moneda: true },
            { header: 'Saldo pendiente', value: (p: Loan) => p.saldoPendiente, moneda: true },
            { header: 'Cuotas', value: (p: Loan) => `${p.cuotasPagadas}/${p.cuotas}`, align: 'center' as const },
            { header: 'Estado', value: (p: Loan) => p.estado },
            { header: 'Fecha', value: (p: Loan) => fmtDate(p.createdAt) },
          ],
          rows: loans,
        }]
      : []),
  ]

  return (
    <ExportButtons filenameBase={`empresa_${slugify(nombre)}`} titulo={`Ficha de empresa — ${nombre}`} sections={sections} />
  )
}
