// La base guarda las fechas en UTC y con un espacio ("2026-09-22 14:30:00"),
// mientras que el banco trabaja en hora de Argentina (UTC-3). Comparar contra un
// ISO ("2026-09-22T03:00:00.000Z") dejaba afuera TODOS los movimientos del día,
// así que los resúmenes de hoy daban siempre cero.

const ARG_MS = 3 * 60 * 60 * 1000

function formatoBase(ms: number) {
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ')
}

/** Medianoche de hoy en Argentina, en el formato de la base. */
export function comienzoDelDia() {
  const ahoraArg = new Date(Date.now() - ARG_MS)
  const medianoche = Date.UTC(ahoraArg.getUTCFullYear(), ahoraArg.getUTCMonth(), ahoraArg.getUTCDate()) + ARG_MS
  return formatoBase(medianoche)
}

/** Principio (o fin) de una fecha YYYY-MM-DD elegida en Argentina. */
export function limiteDelDia(fecha: string, fin = false) {
  const [a, m, d] = fecha.split('-').map(Number)
  return formatoBase(Date.UTC(a, m - 1, d, fin ? 23 : 0, fin ? 59 : 0, fin ? 59 : 0) + ARG_MS)
}
