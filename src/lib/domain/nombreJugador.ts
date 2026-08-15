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

/**
 * El nombre ya guardado, como para mostrarlo en una lista.
 *
 * En la base conviven "JORGE GONZALEZ NUÑEZ" —de las altas por planilla— con
 * "alejandro garces", que salió de escribirlo a mano al inscribirlo a un
 * torneo. Puestos uno debajo del otro en el ranking se ve el desorden, así que
 * se empareja acá: la ficha no se toca.
 *
 * Vive junto a `nombreDesdePartes` —y ya no dentro de la pantalla del Ranking,
 * que es donde nació— porque el PDF del ranking tiene que escribir exactamente
 * los mismos nombres que la pantalla de la que sale.
 */
export function enBonito(nombre: string): string {
  return nombre.trim().toLowerCase().split(/\s+/)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ')
}
