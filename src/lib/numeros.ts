export function generarNumeroSocio(usados: Set<string>): string {
  let n: string
  do { n = String(Math.floor(100000 + Math.random() * 900000)) } while (usados.has(n))
  return n
}
