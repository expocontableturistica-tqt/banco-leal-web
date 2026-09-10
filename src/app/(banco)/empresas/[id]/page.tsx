import { redirect, notFound } from 'next/navigation'
import { auth } from '@/auth'
import { db } from '@/lib/db'
import { empresas, cuentas, movimientosCuenta, prestamos } from '@/lib/schema'
import { eq, desc } from 'drizzle-orm'
import Link from 'next/link'
import FichaExport from './FichaExport'

function fmt(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2 })
}

function formatCuit(digits: string) {
  if (digits.length !== 11) return digits
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
}

function fmtDate(str: string) {
  return new Date(str + 'Z').toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
}

export default async function EmpresaFichaPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session) redirect('/login')

  const { id: idStr } = await params
  const id = parseInt(idStr)
  if (isNaN(id)) notFound()

  const [empresa] = await db.select().from(empresas).where(eq(empresas.id, id)).limit(1)
  if (!empresa) notFound()

  const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.empresaId, id)).limit(1)

  const movimientos = cuenta
    ? await db.select().from(movimientosCuenta)
        .where(eq(movimientosCuenta.cuentaId, cuenta.id))
        .orderBy(desc(movimientosCuenta.createdAt))
        .limit(50)
    : []

  const loans = await db
    .select().from(prestamos)
    .where(eq(prestamos.empresaId, id))
    .orderBy(desc(prestamos.createdAt))

  const vigentes = loans.filter(p => p.estado === 'vigente')
  const totalDeuda = vigentes.reduce((acc, p) => acc + p.saldoPendiente, 0)

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back */}
      <div className="flex items-center justify-between gap-3">
        <Link href="/empresas" className="text-sm text-blue-600 hover:underline">← Volver a Empresas</Link>
        <FichaExport
          nombre={empresa.nombreFantasia || empresa.razonSocial}
          movimientos={movimientos}
          loans={loans}
        />
      </div>

      {/* Cabecera empresa */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-400 font-mono mb-1">{empresa.numeroEmpresa}</p>
            <h1 className="text-2xl font-bold text-gray-900">{empresa.razonSocial}</h1>
            {empresa.nombreFantasia && empresa.nombreFantasia !== empresa.razonSocial && (
              <p className="text-gray-500 text-sm mt-0.5">{empresa.nombreFantasia}</p>
            )}
            <div className="flex gap-4 mt-3 text-sm text-gray-500">
              {empresa.cuit && <span>CUIT: <span className="font-mono">{formatCuit(empresa.cuit)}</span></span>}
              {empresa.actividad && <span>Actividad: {empresa.actividad}</span>}
            </div>
          </div>
          {totalDeuda > 0 && (
            <div className="text-right">
              <p className="text-xs text-orange-500 font-medium uppercase tracking-wide">Deuda vigente</p>
              <p className="text-xl font-bold text-orange-600">${fmt(totalDeuda)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Cuenta bancaria */}
      {cuenta ? (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">Cuenta bancaria</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-gray-400">Tipo</p>
              <p className="font-medium text-gray-900">Cta. {cuenta.tipo === 'CA' ? 'Ahorro' : 'Corriente'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Saldo</p>
              <p className="text-xl font-bold text-green-700">${fmt(cuenta.saldo)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">CBU</p>
              <p className="font-mono text-xs text-gray-700 break-all">{cuenta.cbu}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Alias</p>
              <p className="font-mono text-sm text-gray-700">{cuenta.alias}</p>
            </div>
          </div>
          <div className="mt-3">
            <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-full font-medium ${
              cuenta.estado === 'activa' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${cuenta.estado === 'activa' ? 'bg-green-500' : 'bg-gray-400'}`} />
              {cuenta.estado === 'activa' ? 'Activa' : 'Inactiva'}
            </span>
          </div>
        </div>
      ) : (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
          Esta empresa no tiene cuenta bancaria registrada.
        </div>
      )}

      {/* Préstamos */}
      {loans.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Préstamos</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Concepto</th>
                <th className="text-right px-4 py-2 text-gray-500 font-medium">Monto</th>
                <th className="text-right px-4 py-2 text-gray-500 font-medium">Saldo pendiente</th>
                <th className="text-center px-4 py-2 text-gray-500 font-medium">Cuotas</th>
                <th className="text-center px-4 py-2 text-gray-500 font-medium">Estado</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loans.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-800">{p.concepto}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-700">${fmt(p.monto)}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium text-orange-700">${fmt(p.saldoPendiente)}</td>
                  <td className="px-4 py-3 text-center text-gray-600">{p.cuotasPagadas}/{p.cuotas}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      p.estado === 'vigente' ? 'bg-blue-50 text-blue-700' :
                      p.estado === 'pagado' ? 'bg-green-50 text-green-700' :
                      'bg-red-50 text-red-700'
                    }`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(p.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Movimientos de cuenta */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Movimientos de cuenta
          </h2>
          <span className="text-xs text-gray-400">{movimientos.length} últimos registros</span>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Sin movimientos registrados.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-2 text-gray-500 font-medium">Concepto</th>
                <th className="text-right px-4 py-2 text-gray-500 font-medium">Monto</th>
                <th className="text-right px-4 py-2 text-gray-500 font-medium">Saldo posterior</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movimientos.map(m => (
                <tr key={m.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-700">{m.concepto || '—'}</td>
                  <td className={`px-4 py-2.5 text-right font-mono font-medium ${
                    m.tipo === 'credito' ? 'text-green-700' : 'text-red-600'
                  }`}>
                    {m.tipo === 'credito' ? '+' : '−'}${fmt(m.monto)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-gray-600">${fmt(m.saldoPosterior)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
