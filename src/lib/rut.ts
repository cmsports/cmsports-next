export function formatRut(value: string): string {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length <= 1) return clean
  return clean.slice(0, -1) + '-' + clean.slice(-1)
}

// Valida el dígito verificador (módulo 11). Sin esto pasaban RUTs con formato
// correcto pero inexistentes, y el club recién lo notaba al federar al jugador.
export function rutValido(value: string): boolean {
  const clean = value.replace(/[^0-9kK]/g, '').toUpperCase()
  if (clean.length < 8 || clean.length > 9) return false

  const cuerpo = clean.slice(0, -1)
  const dv = clean.slice(-1)
  if (!/^\d+$/.test(cuerpo)) return false

  let suma = 0
  let multiplicador = 2
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * multiplicador
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1
  }

  const resto = 11 - (suma % 11)
  const dvEsperado = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto)
  return dv === dvEsperado
}
