/** Arma el nombre que se muestra a partir de las partes del ingreso. */
export function nombreDesdePartes(partes: {
  nombres?: string | null
  apellido1?: string | null
  apellido2?: string | null
  apellido3?: string | null
}): string {
  return [partes.nombres, partes.apellido1, partes.apellido2, partes.apellido3]
    .map(valor => (valor ?? '').trim())
    .filter(valor => valor && valor.toLowerCase() !== 'no')
    .join(' ')
}

export function fechaNacimientoInput(valor: string | null | undefined): string {
  if (!valor) return ''
  return valor.slice(0, 10)
}
