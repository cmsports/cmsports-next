// Filtrar por `activo` no alcanza para saber si un grupo sigue existiendo.
//
// Dar de baja un bloque no lo borra ni le toca `activo`: le cierra la vigencia
// (`vigente_hasta`). Las pantallas que preguntaban solo por `activo` seguían
// mostrando para siempre los grupos cerrados —en la grilla del horario, en los
// cupos, al inscribir gente— y `generarSemana` les seguía generando clases.
//
// Este filtro es la única forma correcta de pedir "los grupos que existen tal
// día". Va en todas las consultas de `bloques_horario` que alimentan pantallas.

/** Lo mínimo de un query de Supabase para poder encadenarle el filtro. */
type Encadenable<T> = {
  lte(columna: string, valor: string): T
  or(filtro: string): T
}

/** Los bloques que estaban vigentes esa fecha. Ambos extremos cuentan. */
export function soloVigentes<T extends Encadenable<T>>(query: T, fecha: string): T {
  return query
    .lte('vigente_desde', fecha)
    .or(`vigente_hasta.is.null,vigente_hasta.gte.${fecha}`)
}
