// Datos que la app MediaPago espera en cada prestación.
// Ver MediaPago/src/screens/QRScannerScreen.js (handleConfirmPrestacion) y
// MediaPago/src/services/storage.js (PLANES_TARJETA): si el plan no coincide
// exactamente, la app rechaza el QR con "Plan no válido".

export const PLANES_TARJETA = [
  { plan: 'Visa Classic',       limite: 50000 },
  { plan: 'Visa Gold',          limite: 100000 },
  { plan: 'Mastercard Classic', limite: 50000 },
  { plan: 'Mastercard Gold',    limite: 150000 },
  { plan: 'Amex Platinum',      limite: 300000 },
] as const

export const TIPOS_SEGURO = [
  'Seguro de vida',
  'Seguro del hogar',
  'Seguro de accidentes personales',
  'Seguro contra robo',
  'Seguro de la compra',
] as const

export type TipoPrestacion = 'banco_tarjeta' | 'banco_seguro' | 'banco_limite' | 'banco_bono'

export const TIPOS_PRESTACION: {
  key: TipoPrestacion
  label: string
  icon: string
  desc: string
  mueveDinero: boolean
}[] = [
  { key: 'banco_tarjeta', label: 'Tarjeta',           icon: '💳', desc: 'Tarjeta de crédito virtual', mueveDinero: false },
  { key: 'banco_seguro',  label: 'Seguro',            icon: '🛡️', desc: 'Cobertura por unos meses',   mueveDinero: false },
  { key: 'banco_limite',  label: 'Aumento de límite', icon: '📈', desc: 'Más límite en una tarjeta',  mueveDinero: false },
  { key: 'banco_bono',    label: 'Bono',              icon: '🎁', desc: 'Dinero a la billetera',      mueveDinero: true },
]

export const ES_TIPO_PRESTACION = (t: string): t is TipoPrestacion =>
  TIPOS_PRESTACION.some(x => x.key === t)

/** Resumen legible de una prestación, con los datos que viajan en el QR. */
export function detallePrestacion(tipo: string, d: Record<string, unknown>): string {
  const $ = (n: unknown) => `$${Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  switch (tipo) {
    case 'banco_tarjeta': return `Plan ${d.plan ?? '—'}`
    case 'banco_seguro':  return `${d.tipoSeguro ?? '—'} · Cobertura ${$(d.cobertura)} · ${d.vigencia ?? 0} meses`
    case 'banco_limite':  return `+${$(d.incremento)} en la tarjeta ****${d.tarjetaRef ?? '—'}`
    case 'banco_bono':    return `${$(d.monto)} · ${d.motivo ?? '—'}`
    // Tipos viejos que ya no se emiten
    case 'banco_prestamo': return `${$(d.monto)}${d.cuotas ? ` · ${d.cuotas} cuotas` : ''}`
    default: return d.monto ? $(d.monto) : '—'
  }
}
