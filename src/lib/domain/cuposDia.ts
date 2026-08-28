// Cupos de un día concreto: quién libera el suyo y quién toma uno liberado.
//
// El horario semanal (`bloques_horario` + `bloque_jugadores`) dice quién va
// SIEMPRE. Esto dice qué pasa UN día: "el martes 3 no voy", "el jueves 5 viene
// Pedro a recuperar". Son hechos por fecha, no cambios de horario, y por eso no
// tocan `bloque_jugadores`: si tocaran, el alumno saldría del grupo.
//
// Todo acá es aritmética pura sobre fechas ISO y horas HH:MM, sin `Date.now()`,
// para que la regla de las 24 horas se pueda probar sin esperar un día.

import { diaDesdeFecha, minutosDelDia } from './horario'

/** Aviso mínimo para conservar el derecho a recuperar la clase. */
export const HORAS_AVISO = 24

/** Cuántos días hacia adelante se ofrecen bloques para recuperar. */
export const DIAS_VENTANA = 14

/**
 * Suma días a una fecha ISO sin que el cambio de horario mueva el resultado.
 *
 * Se ancla al mediodía UTC: los saltos de DST en Chile son de una hora a
 * medianoche, así que desde el mediodía nunca alcanzan a correr el día.
 */
export function sumarDias(fechaISO: string, dias: number): string {
  const d = new Date(`${fechaISO}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Días de diferencia entre dos fechas ISO (negativo si la segunda es anterior). */
export function diasEntre(desdeISO: string, hastaISO: string): number {
  const a = Date.parse(`${desdeISO}T12:00:00Z`)
  const b = Date.parse(`${hastaISO}T12:00:00Z`)
  return Math.round((b - a) / 86400000)
}

/**
 * Minutos que faltan para que empiece esa clase.
 *
 * Negativo si ya empezó. `ahoraHHmm` y `hoyISO` vienen de `fechaChile()` /
 * `horaChile()`: la hora de Chile es la única que le sirve al alumno.
 */
export function minutosHastaLaClase(params: {
  fecha: string
  horaInicio: string
  hoy: string
  ahora: string
}): number {
  return diasEntre(params.hoy, params.fecha) * 1440
    + minutosDelDia(params.horaInicio)
    - minutosDelDia(params.ahora)
}

/**
 * Si al cancelar esa clase conserva el derecho a recuperarla.
 *
 * Avisar con 24 horas o más deja al profe tiempo de ofrecer el cupo a otro; con
 * menos, el cupo igual se libera pero la clase se pierde. La clase ya empezada
 * nunca da derecho.
 */
export function conservaDerecho(params: {
  fecha: string
  horaInicio: string
  hoy: string
  ahora: string
}): boolean {
  return minutosHastaLaClase(params) >= HORAS_AVISO * 60
}

export type BloqueSemanal = {
  id: string
  dia_semana: string
  hora_inicio: string
}

export type Ocurrencia<B extends BloqueSemanal> = { bloque: B; fecha: string }

/**
 * Las veces que cada bloque se dicta entre hoy y `dias` días más.
 *
 * Un bloque es "los martes a las 17:00"; el alumno cancela "el martes 3 de
 * septiembre". Esto convierte lo primero en lo segundo. Sale ordenado por fecha
 * y hora, que es como se lee una agenda.
 *
 * `excluir` son las fechas ya suspendidas (`bloque_excepciones`): un feriado no
 * se cancela ni se recupera, no hubo clase que perder.
 */
export function ocurrencias<B extends BloqueSemanal>(params: {
  bloques: B[]
  hoy: string
  dias?: number
  excluir?: ReadonlySet<string>
}): Ocurrencia<B>[] {
  const dias = params.dias ?? DIAS_VENTANA
  const excluir = params.excluir ?? new Set<string>()
  const salida: Ocurrencia<B>[] = []

  for (let i = 0; i <= dias; i++) {
    const fecha = sumarDias(params.hoy, i)
    const dia = diaDesdeFecha(fecha)
    if (!dia) continue // el club no abre fin de semana
    for (const bloque of params.bloques) {
      if (bloque.dia_semana !== dia) continue
      if (excluir.has(`${bloque.id}|${fecha}`)) continue
      salida.push({ bloque, fecha })
    }
  }

  return salida.sort((a, b) =>
    a.fecha.localeCompare(b.fecha) || a.bloque.hora_inicio.localeCompare(b.bloque.hora_inicio))
}

/**
 * En qué bloques puede recuperar: los de SU grupo, en días que no son suyos.
 *
 * Sin este filtro se le ofrecía a un adulto meterse en la clase de menores. Se
 * vio recién con datos reales: los bloques de Adultos estaban llenos, así que
 * los únicos con lugar eran los de Menores y la pantalla los listó sin más.
 *
 * Si el alumno no tiene grupo asignado en ninguno de sus bloques —`grupo_id` es
 * opcional desde la migración 085— no se filtra nada. Es preferible ofrecerle de
 * más que dejarlo sin ninguna opción por un dato que el club no cargó.
 */
export function bloquesDondeRecuperar<B extends { id: string; grupo_id?: string | null }>(
  params: { mios: B[]; delClub: B[] },
): B[] {
  const esMio = new Set(params.mios.map(b => b.id))
  const misGrupos = new Set(params.mios.map(b => b.grupo_id).filter(Boolean))

  return params.delClub.filter(b =>
    !esMio.has(b.id) && (misGrupos.size === 0 || misGrupos.has(b.grupo_id)))
}

// Cuántos lugares quedan en un bloque un día NO se calcula acá: la cuenta
// necesita contar `bloque_jugadores`, y desde la migración 101 el alumno no
// puede leer las inscripciones ajenas. Vive en `cupos_libres_por_dia`
// (migración 226), que devuelve el número sin devolver la lista.
