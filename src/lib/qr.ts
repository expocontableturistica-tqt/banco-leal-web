import QRCode from 'qrcode'
import { createHash, randomBytes } from 'crypto'

const SECRET = process.env.QR_SECRET ?? 'MEDIAPAGO_ESCOLAR_2024'

export function firmarPayload(payload: object): string {
  const json = JSON.stringify(payload)
  const sig = createHash('sha256').update(SECRET + json).digest('hex').slice(0, 16).toUpperCase()
  return Buffer.from(JSON.stringify({ ...payload, sig })).toString('base64url')
}

export function verificarPayload(token: string): { ok: boolean; payload?: Record<string, unknown>; error?: string } {
  try {
    const raw = JSON.parse(Buffer.from(token, 'base64url').toString('utf8'))
    const { sig, ...rest } = raw
    const esperada = createHash('sha256')
      .update(SECRET + JSON.stringify(rest))
      .digest('hex').slice(0, 16).toUpperCase()
    if (sig !== esperada) return { ok: false, error: 'Firma inválida' }
    return { ok: true, payload: rest }
  } catch {
    return { ok: false, error: 'Token malformado' }
  }
}

export async function generarQRDataUrl(payload: object): Promise<string> {
  const token = firmarPayload(payload)
  return QRCode.toDataURL(token, { width: 300, margin: 2 })
}

// ── QR que lee la app MediaPago ─────────────────────────────────────────────
// La app espera JSON plano (no el token de arriba) y valida
// SHA256("clave|…").slice(0, 16) en hexadecimal minúscula. Vence a las 24 h.
// La app no le avisa al banco cuando lo escanea.

function firmaMediaPago(mensaje: string): string {
  return createHash('sha256').update(`${SECRET}|${mensaje}`).digest('hex').slice(0, 16)
}

export function qrDesdePayload(payload: object): Promise<string> {
  return QRCode.toDataURL(JSON.stringify(payload), { errorCorrectionLevel: 'M', width: 300, margin: 2 })
}

/** Carga dinero en la billetera MediaPago de quien lo escanea. */
export async function qrCargaMediaPago(monto: number) {
  const v = 1
  const tid = randomBytes(8).toString('hex')
  const ts = Math.floor(Date.now() / 1000)
  const payload = { v, monto, tid, ts, sig: firmaMediaPago(`${v}|${monto}|${tid}|${ts}`) }
  return { tid, payload, dataUrl: await qrDesdePayload(payload) }
}

/**
 * Prestación bancaria (tarjeta, seguro, límite, bono, préstamo). Cada tipo lleva
 * sus propios datos; MediaPago los lee tal cual (ver src/lib/prestaciones.ts).
 */
export async function qrPrestacionMediaPago(tipo: string, datos: Record<string, unknown>) {
  const tid = randomBytes(8).toString('hex')
  const ts = Math.floor(Date.now() / 1000)
  const payload = {
    v: 2, tipo, ...datos, tid, ts,
    sig: firmaMediaPago(`prestacion|${tipo}|${tid}|${ts}`),
  }
  return { tid, payload, dataUrl: await qrDesdePayload(payload) }
}

/** Préstamo personal: MediaPago lo muestra como préstamo y lo acredita en la billetera. */
export async function qrPrestamoMediaPago(monto: number, cuotas: number) {
  return qrPrestacionMediaPago('banco_prestamo', { monto, cuotas, tasaMensual: 0 })
}

// ── Códigos de transferencia BF-XXXX ────────────────────────────────────────

const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function _sigTransfer(cents: number, rnd: string): string {
  return createHash('sha256')
    .update(`${SECRET}|transferencia|${cents}|${rnd}`)
    .digest('hex').slice(0, 6).toUpperCase()
}

export function generarCodigoTransfer(monto: number): string {
  const cents = Math.round((monto || 0) * 100)
  const bytes = randomBytes(4)
  let rnd = ''
  for (let i = 0; i < 4; i++) rnd += ABC[bytes[i] % ABC.length]
  return `BF-${cents.toString(36).toUpperCase()}-${rnd}-${_sigTransfer(cents, rnd)}`
}

export function verificarCodigoTransfer(codigo: string): { ok: boolean; monto?: number; codigo?: string; error?: string } {
  const t = String(codigo ?? '').trim().toUpperCase().replace(/\s+/g, '')
  const m = t.match(/^BF-([0-9A-Z]+)-([0-9A-Z]{4})-([0-9A-Z]{6})$/)
  if (!m) return { ok: false, error: 'El código no tiene el formato esperado' }
  const cents = parseInt(m[1], 36)
  if (!Number.isFinite(cents) || cents <= 0) return { ok: false, error: 'Monto inválido' }
  if (_sigTransfer(cents, m[2]) !== m[3]) return { ok: false, error: 'Código inválido o adulterado' }
  return { ok: true, monto: cents / 100, codigo: t }
}

export function generarCBU(cuentaId: number): string {
  const base1 = '0000030'
  const w1 = [7, 1, 3, 9, 7, 1, 3]
  const s1 = base1.split('').reduce((s, d, i) => s + parseInt(d) * w1[i], 0)
  const d1 = (10 - (s1 % 10)) % 10
  const num = String(cuentaId).padStart(13, '0')
  const w2 = [3, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3, 9]
  const s2 = num.split('').reduce((s, d, i) => s + parseInt(d) * w2[i], 0)
  const d2 = (10 - (s2 % 10)) % 10
  return base1 + d1 + num + d2
}
