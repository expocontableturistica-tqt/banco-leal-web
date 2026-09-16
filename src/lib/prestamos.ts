// Formas de entrega de un préstamo: depósito en cuenta, efectivo y QR MediaPago.
// Se guarda como JSON en prestamos.entrega; los préstamos anteriores a esta opción
// no lo tienen y se depositaron completos en la cuenta.

export interface Entrega {
  cuenta: number
  efectivo: number
  qr: number
  qrPayload?: Record<string, unknown> & { ts: number }
}

export function leerEntrega(json: string | null, monto: number): Entrega {
  if (json) {
    try {
      const e = JSON.parse(json)
      return {
        cuenta: Number(e.cuenta) || 0,
        efectivo: Number(e.efectivo) || 0,
        qr: Number(e.qr) || 0,
        ...(e.qrPayload ? { qrPayload: e.qrPayload } : {}),
      }
    } catch { /* formato viejo o dañado: se toma como depósito en cuenta */ }
  }
  return { cuenta: monto, efectivo: 0, qr: 0 }
}

export function r2(n: number) {
  return Math.round(n * 100) / 100
}
