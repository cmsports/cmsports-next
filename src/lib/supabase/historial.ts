import { createClient } from '@/lib/supabase/client'
import type { DatosHistorial, InscripcionVigente, RegistroAsistencia } from '@/lib/domain/historialAsistencia'

const supabase = createClient()

const PAGINA = 1000

/**
 * Trae todas las filas de una consulta, de a 1000.
 *
 * PostgREST corta en 1000 filas y no avisa: no da error, devuelve las primeras
 * mil y la aplicación cree que eso es todo. El 2026-08-29 el reporte de
 * asistencia por bloque de un mes ya pedía 1008 filas de `asistencia`, así que
 * ocho jornadas presentes llegaban sin registro y el cálculo las contaba como
 * faltas. Crece con el club: no es un caso raro, es de acá en adelante.
 */
async function todas<T>(consulta: { range: (a: number, b: number) => PromiseLike<{ data: T[] | null }> }): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += PAGINA) {
    const { data } = await consulta.range(desde, desde + PAGINA - 1)
    out.push(...(data ?? []))
    if (!data || data.length < PAGINA) return out
  }
}

/**
 * Trae todo lo que el motor de asistencia necesita para un jugador y un rango.
 *
 * Vive acá y no dentro de cada pantalla para que el calendario histórico, la
 * ficha del jugador y los reportes lean exactamente los mismos datos. Si cada
 * uno armara su propia consulta, alcanzaría con que a una se le olvidara filtrar
 * por vigencia para que mostraran números distintos.
 */
export async function cargarHistorialJugador(
  clubId: string,
  jugadorId: string,
  desde: string,
  hasta: string,
): Promise<DatosHistorial> {
  // Los tipos generados de Supabase no traen las columnas de vigencia ni estado.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [{ data: bloques }, { data: inscripciones }, { data: asistencias }, { data: excepciones }, { data: extras }] =
    await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,vigente_desde,vigente_hasta')
        .eq('club_id', clubId),
      db.from('bloque_jugadores')
        .select('bloque_id,jugador_id,vigente_desde,vigente_hasta')
        .eq('jugador_id', jugadorId),
      db.from('asistencia')
        .select('jugador_id,fecha,estado')
        .eq('jugador_id', jugadorId).gte('fecha', desde).lte('fecha', hasta),
      db.from('bloque_excepciones')
        .select('bloque_id,fecha').gte('fecha', desde).lte('fecha', hasta),
      // Si la migración 098 todavía no corrió, esto devuelve error y data null.
      // El `?? []` lo absorbe: el calendario queda como antes en vez de romperse.
      db.from('clases_extraordinarias')
        .select('id,jugador_id,fecha,bloque_id,monto')
        .eq('jugador_id', jugadorId).gte('fecha', desde).lte('fecha', hasta),
    ])

  return {
    bloques: bloques ?? [],
    inscripciones: inscripciones ?? [],
    asistencias: asistencias ?? [],
    excepciones: excepciones ?? [],
    extraordinarias: extras ?? [],
  }
}

/** Lo mismo pero para todo el club, cuando hay que rankear o promediar. */
export async function cargarHistorialClub(
  clubId: string,
  desde: string,
  hasta: string,
): Promise<DatosHistorial> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Las dos grandes van paginadas: son de todo el club y ya pasan las mil filas.
  const [{ data: bloques }, inscripciones, asistencias, { data: excepciones }, { data: extras }] =
    await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,hora_inicio,hora_fin,vigente_desde,vigente_hasta')
        .eq('club_id', clubId),
      todas<InscripcionVigente>(db.from('bloque_jugadores')
        .select('bloque_id,jugador_id,vigente_desde,vigente_hasta')
        .order('bloque_id').order('jugador_id')),
      todas<RegistroAsistencia>(db.from('asistencia')
        .select('jugador_id,fecha,estado')
        .eq('club_id', clubId).gte('fecha', desde).lte('fecha', hasta)
        .order('fecha').order('jugador_id')),
      db.from('bloque_excepciones')
        .select('bloque_id,fecha').gte('fecha', desde).lte('fecha', hasta),
      db.from('clases_extraordinarias')
        .select('jugador_id,fecha')
        .eq('club_id', clubId).gte('fecha', desde).lte('fecha', hasta),
    ])

  return {
    bloques: bloques ?? [],
    inscripciones,
    asistencias,
    excepciones: excepciones ?? [],
    extraordinarias: extras ?? [],
  }
}
