/**
 * Validación de UUID para lo que se interpola en un filtro de PostgREST.
 *
 * `.eq('id', x)` es seguro: el valor viaja como parámetro. `.or(...)` NO lo es:
 * recibe un string en el lenguaje de filtros de PostgREST, donde la coma separa
 * condiciones y el punto separa columna/operador/valor. Interpolar ahí un id
 * que llegó del navegador deja ensanchar el filtro:
 *
 *   .or(`jugador_a_id.eq.${id},jugador_b_id.eq.${id}`)
 *
 * con `id = "x,jugador_a_id.not.is.null"` pasa a significar "todos los partidos".
 * Los demás `.eq()` de la consulta y el RLS acotan el daño —no cruza de club—,
 * pero dentro de la propia liga alcanza para resolver por walkover partidos que
 * no correspondían.
 *
 * Los ids de este sistema son todos `gen_random_uuid()`, así que exigir la forma
 * exacta no rechaza nada legítimo.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && UUID_RE.test(valor)
}

/**
 * El mismo valor si es un UUID; si no, lanza. Pensado para usarse justo antes
 * de construir el string de un `.or()`, donde devolver un id inválido y seguir
 * es peor que cortar.
 */
export function uuidOrFail(valor: unknown, queEs = 'identificador'): string {
  if (!esUuid(valor)) throw new Error(`El ${queEs} no tiene un formato válido`)
  return valor
}
