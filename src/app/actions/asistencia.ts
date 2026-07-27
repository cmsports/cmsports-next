'use server'

import { requirePerfil } from '@/lib/auth/require'
import { fechaChile, horaChile } from '@/lib/domain/fechaChile'
import { diaDesdeFecha, hhmm, inicioVentana, rangoHorario, ventanaAbierta } from '@/lib/domain/horario'

type BloqueDelJugador = {
  nombre: string
  dia_semana: string
  hora_inicio: string
  hora_fin: string
  activo: boolean
}

/**
 * Comprueba que el alumno tenga un bloque corriendo ahora mismo. Devuelve el
 * motivo en castellano cuando no, porque es lo que va a leer en pantalla.
 */
async function dentroDeSuBloque(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  jugadorId: string,
): Promise<{ error?: string }> {
  const dia = diaDesdeFecha(fechaChile())
  if (!dia) return { error: 'El club no tiene entrenamientos los fines de semana' }

  const { data, error } = await supabase
    .from('bloque_jugadores')
    .select('bloques_horario(nombre,dia_semana,hora_inicio,hora_fin,activo)')
    .eq('jugador_id', jugadorId)
    .is('vigente_hasta', null)
  if (error) return { error: 'No se pudieron verificar tus horarios: ' + error.message }

  const deHoy = ((data ?? []) as { bloques_horario: BloqueDelJugador | null }[])
    .map(r => r.bloques_horario)
    .filter((b): b is BloqueDelJugador => !!b && b.activo && b.dia_semana === dia)
    .sort((a, b) => hhmm(a.hora_inicio).localeCompare(hhmm(b.hora_inicio)))

  if (deHoy.length === 0) return { error: 'Hoy no tenés entrenamiento asignado' }

  const ahora = horaChile()
  if (deHoy.some(b => ventanaAbierta(b.hora_inicio, b.hora_fin, ahora))) return {}

  const proximo = deHoy.find(b => hhmm(b.hora_inicio) > ahora)
  if (proximo) {
    return { error: `Tu entrenamiento es a las ${hhmm(proximo.hora_inicio)}. Podés marcar tu llegada desde las ${inicioVentana(proximo.hora_inicio)}.` }
  }

  const ultimo = deHoy[deHoy.length - 1]
  return { error: `Ya cerró el registro de hoy (${rangoHorario(ultimo.hora_inicio, ultimo.hora_fin)}). Pedile al profe que te marque.` }
}

export async function registrarAsistenciaAction(
  clubId: string,
  jugadorId: string,
  fecha: string,
  hora: string
) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }

  const esStaff = perfil.rol === 'admin' || perfil.rol === 'profesor'
  if (clubId !== perfil.club_id) return { error: 'Acceso denegado' }
  if (!esStaff && jugadorId !== perfil.jugador_id) return { error: 'Acceso denegado' }

  // El alumno solo se marca mientras su bloque está corriendo, con media hora
  // de margen a cada lado. Al staff no se le aplica: si al profe se le pasó
  // registrar a alguien, tiene que poder hacerlo después.
  if (!esStaff) {
    const puede = await dentroDeSuBloque(supabase, jugadorId)
    if (puede.error) return { error: puede.error }
  }

  // Para el jugador, PostgreSQL fija fecha y hora en America/Santiago.
  // Así no dependemos del UTC ni del reloj configurado en su dispositivo.
  const args = esStaff
    ? { p_jugador_id: jugadorId, p_fecha: fecha, p_hora: hora }
    : { p_jugador_id: jugadorId }
  const { data, error } = await supabase.rpc('registrar_asistencia_segura', args)
  if (error) return { error: error.message }

  return { ok: true, asistenciaId: data as string }
}

// El cierre por bloque se quitó: la asistencia se pasa a mano, jugador por
// jugador. La función `registrar_bloque_asistencia` sigue en la base sin uso.

/**
 * Corrige el estado de un jugador en una fecha, desde Asistencia Histórica.
 *
 * `sin_registro` borra la fila y devuelve el día a azul. Todo pasa por la
 * función de la base, que además de auditar recalcula las sesiones usadas:
 * marcar una ausencia vieja mueve ese número hacia atrás.
 */
export async function corregirAsistencia(params: {
  jugadorId: string
  fecha: string
  estado: 'presente' | 'ausente' | 'sin_registro'
  motivo?: string
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden corregir la asistencia' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('registrar_asistencia_manual', {
    p_jugador_id: params.jugadorId,
    p_fecha:      params.fecha,
    p_estado:     params.estado,
    p_motivo:     params.motivo?.trim() || null,
  })
  if (error) return { error: error.message }

  return { ok: true }
}

/** Marca que un bloque no se dictó ese día: feriado, suspensión, lo que sea. */
export async function marcarSinClase(params: { bloqueId: string; fecha: string; motivo?: string }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden cambiar el horario' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('bloque_excepciones')
    .insert({ bloque_id: params.bloqueId, fecha: params.fecha, motivo: params.motivo?.trim() || null })
  // 23505 = ya estaba marcado; el resultado es el que se quería.
  if (error && error.code !== '23505') return { error: error.message }

  return { ok: true }
}

/** Deshace lo anterior: ese día vuelve a contar como entrenamiento. */
export async function quitarSinClase(params: { bloqueId: string; fecha: string }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!['admin', 'superadmin', 'profesor'].includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden cambiar el horario' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('bloque_excepciones')
    .delete().eq('bloque_id', params.bloqueId).eq('fecha', params.fecha)
  if (error) return { error: error.message }

  return { ok: true }
}

export async function eliminarAsistencia(asistenciaId: string) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }
  if (perfil.rol !== 'admin' && perfil.rol !== 'profesor') {
    return { error: 'Solo el admin o profesor puede eliminar asistencias' }
  }

  const { error } = await supabase.rpc('eliminar_asistencia_segura', {
    p_asistencia_id: asistenciaId,
  })
  if (error) return { error: error.message }

  return { ok: true }
}
