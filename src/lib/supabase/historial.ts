import { createClient } from '@/lib/supabase/client'
import type { DatosHistorial } from '@/lib/domain/historialAsistencia'

const supabase = createClient()

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

  const [{ data: bloques }, { data: inscripciones }, { data: asistencias }, { data: excepciones }] =
    await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,vigente_desde,vigente_hasta')
        .eq('club_id', clubId),
      db.from('bloque_jugadores')
        .select('bloque_id,jugador_id,vigente_desde,vigente_hasta')
        .eq('jugador_id', jugadorId),
      db.from('asistencia')
        .select('jugador_id,fecha,estado')
        .eq('jugador_id', jugadorId).gte('fecha', desde).lte('fecha', hasta),
      db.from('bloque_excepciones')
        .select('bloque_id,fecha').gte('fecha', desde).lte('fecha', hasta),
    ])

  return {
    bloques: bloques ?? [],
    inscripciones: inscripciones ?? [],
    asistencias: asistencias ?? [],
    excepciones: excepciones ?? [],
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

  const [{ data: bloques }, { data: inscripciones }, { data: asistencias }, { data: excepciones }] =
    await Promise.all([
      db.from('bloques_horario')
        .select('id,nombre,sede,dia_semana,vigente_desde,vigente_hasta')
        .eq('club_id', clubId),
      db.from('bloque_jugadores')
        .select('bloque_id,jugador_id,vigente_desde,vigente_hasta'),
      db.from('asistencia')
        .select('jugador_id,fecha,estado')
        .eq('club_id', clubId).gte('fecha', desde).lte('fecha', hasta),
      db.from('bloque_excepciones')
        .select('bloque_id,fecha').gte('fecha', desde).lte('fecha', hasta),
    ])

  return {
    bloques: bloques ?? [],
    inscripciones: inscripciones ?? [],
    asistencias: asistencias ?? [],
    excepciones: excepciones ?? [],
  }
}
