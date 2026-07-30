'use server'

import { requirePerfil } from '@/lib/auth/require'
import { fechaChile } from '@/lib/domain/fechaChile'

const STAFF = ['admin', 'superadmin', 'profesor']
// Lo que toca plata: el profesor queda afuera.
const ADMIN = ['admin', 'superadmin']

/**
 * Nadie asistió a una clase que no ocurrió.
 *
 * El calendario deja mirar hacia adelante —ver quién entrena el martes que viene
 * es planificación— y la pantalla no muestra los botones esos días. Pero la
 * pantalla no es el guardia: queda la pestaña vieja, la cola de offline que
 * despierta tarde y quien llame la acción por su cuenta. Una presencia con fecha
 * futura descuenta una sesión del plan y nadie la va a ir a corregir, porque el
 * día todavía no venció.
 */
function fechaFutura(fecha: string): boolean {
  return fecha > fechaChile()
}

/**
 * Registra la asistencia de un jugador. Solo el profesor o el administrador.
 *
 * El jugador —adulto o menor— ya no se marca solo: se quitó su autorregistro
 * junto con la ventana horaria que lo acompañaba. El guardia de verdad está en
 * `registrar_asistencia_segura` (migración 105); este es el que da el mensaje
 * en castellano y evita el viaje a la base.
 */
export async function registrarAsistenciaAction(
  clubId: string,
  jugadorId: string,
  fecha: string,
  hora: string
) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr }

  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el profesor o el administrador registran la asistencia' }
  }
  if (clubId !== perfil.club_id) return { error: 'Acceso denegado' }
  if (fechaFutura(fecha)) {
    return { error: 'Ese día todavía no llega: la asistencia se pasa el mismo día o después' }
  }

  const { data, error } = await supabase.rpc('registrar_asistencia_segura', {
    p_jugador_id: jugadorId, p_fecha: fecha, p_hora: hora,
  })
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
  // Corregir el futuro no es corregir: es inventarlo. Vale igual para 'ausente',
  // que también escribe una fila y cuenta en el porcentaje del jugador.
  if (fechaFutura(params.fecha)) {
    return { error: 'Ese día todavía no llega: no hay nada que corregir' }
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

/**
 * El jugador vino a un grupo que no es el suyo.
 *
 * No entra en `asistencia`: no descuenta sesión ni cuenta en su porcentaje. Es
 * un hecho aparte, que se cobra aparte. Quién puede y qué es "un grupo que no
 * es el suyo" lo decide la función de la base, no esta capa.
 */
export async function registrarClaseExtraordinaria(params: {
  jugadorId: string
  fecha: string
  /** El grupo al que vino. Opcional: el que hoy no entrena no tiene ninguno, y
   *  anotar que vino no puede depender de saberlo. Se completa después. */
  bloqueId?: string | null
  hora?: string | null
  monto?: number | null
  motivo?: string | null
}) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden registrar una clase extraordinaria' }
  }
  // La visita también se cobra: anotarla antes de que ocurra es facturar algo
  // que todavía no pasó.
  if (fechaFutura(params.fecha)) {
    return { error: 'Ese día todavía no llega: la visita se anota cuando ocurre' }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('registrar_clase_extraordinaria', {
    p_jugador_id: params.jugadorId,
    p_fecha:      params.fecha,
    // `|| null` y no `?? null`: una cadena vacía tiene que llegar como nulo. Un
    // "" en un campo uuid revienta con «invalid input syntax for type uuid».
    p_bloque_id:  params.bloqueId || null,
    p_hora:       params.hora ?? null,
    p_monto:      params.monto ?? null,
    p_motivo:     params.motivo?.trim() || null,
  })
  if (error) return { error: error.message }

  return { ok: true, id: data as string }
}

/**
 * Le pone —o le cambia— el grupo a una clase extra.
 *
 * Existe porque registrar a alguien que hoy no entrena no exige elegir grupo:
 * primero se anota que vino, y a cuál fue se completa después.
 */
export async function asignarBloqueClaseExtraordinaria(params: { id: string; bloqueId: string | null }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden cambiar el grupo' }
  }

  if (!params.id) return { error: 'Falta la clase a modificar' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('asignar_bloque_clase_extraordinaria', {
    p_id: params.id, p_bloque_id: params.bloqueId || null,
  })
  if (error) return { error: error.message }

  return { ok: true }
}

/** Cuánto se le cobra por esa clase. null la deja otra vez por asignar. */
export async function asignarMontoClaseExtraordinaria(params: { id: string; monto: number | null }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  // El profesor puede cambiar el monto vía el RPC; la restricción admin-only
  // que había acá fue levantada para permitir monto = 0 (sin cargo).
  if (!ADMIN.includes(perfil.rol ?? '') && !['profesor'].includes(perfil.rol ?? '')) {
    return { error: 'El precio de una clase extra lo pone un administrador o el profesor' }
  }
  if (!params.id) return { error: 'Falta la clase a modificar' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('asignar_monto_clase_extraordinaria', {
    p_id: params.id, p_monto: params.monto,
  })
  if (error) return { error: error.message }

  return { ok: true }
}

/** La borra. La base la rechaza si ya se cobró. */
export async function eliminarClaseExtraordinaria(params: { id: string }) {
  const { error: authErr, supabase, perfil } = await requirePerfil()
  if (authErr || !supabase || !perfil) return { error: authErr ?? 'Sin sesión' }
  if (!STAFF.includes(perfil.rol ?? '')) {
    return { error: 'Solo el admin o el profesor pueden borrar una clase extraordinaria' }
  }
  if (!params.id) return { error: 'Falta la clase a borrar' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('eliminar_clase_extraordinaria', { p_id: params.id })
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
