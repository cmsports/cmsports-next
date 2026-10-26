'use server'

import { requireStaffClub, requirePerfil } from '@/lib/auth/require'
import { esUuid } from '@/lib/domain/uuid'
import { validarCreacion, validarEdicion, type ResultadoVotacion, type VotanteVotacion } from '@/lib/domain/votaciones'

// Todo pasa por los RPC de la migración 303: ellos validan módulo, club, rol,
// que el votante esté habilitado y que no vote dos veces. Acá solo se corta
// lo que no tiene forma de ser válido, antes de viajar a la base.
//
// Los tipos generados todavía no conocen estas funciones, de ahí el `as any`
// (mismo criterio que `registrarLicencia`).

export async function crearVotacion(params: {
  titulo: string
  descripcion?: string
  tipo: 'jugadores' | 'opciones'
  votantes: string[]
  candidatos: string[]
  opciones: string[]
}) {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }

  if (params.tipo !== 'jugadores' && params.tipo !== 'opciones') return { error: 'Tipo de votación inválido' }
  if (![...params.votantes, ...params.candidatos].every(esUuid)) return { error: 'Hay jugadores con un identificador inválido' }
  const invalido = validarCreacion(params)
  if (invalido) return { error: invalido }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('crear_votacion_atomico', {
    p_titulo: params.titulo,
    p_descripcion: params.descripcion ?? null,
    p_tipo: params.tipo,
    p_votantes: params.votantes,
    p_candidatos: params.tipo === 'jugadores' ? params.candidatos : [],
    p_opciones: params.tipo === 'opciones' ? params.opciones : [],
  })
  if (error) return { error: error.message }
  return { success: true, id: data as string }
}

/** `votantes: null` deja la lista de votantes como está (solo nombre y descripción). */
export async function editarVotacion(params: {
  votacionId: string
  titulo: string
  descripcion?: string
  votantes: string[] | null
}) {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId)) return { error: 'Votación inválida' }
  if (params.votantes && !params.votantes.every(esUuid)) return { error: 'Hay jugadores con un identificador inválido' }
  const invalido = validarEdicion(params)
  if (invalido) return { error: invalido }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('editar_votacion_atomico', {
    p_votacion_id: params.votacionId,
    p_titulo: params.titulo,
    p_descripcion: params.descripcion ?? null,
    p_votantes: params.votantes,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function votantesDeVotacion(params: { votacionId: string }): Promise<{ error: string } | { votantes: VotanteVotacion[] }> {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId)) return { error: 'Votación inválida' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('votantes_de_votacion', { p_votacion_id: params.votacionId })
  if (error) return { error: error.message }
  return { votantes: (data ?? []) as VotanteVotacion[] }
}

export async function cambiarEstadoVotacion(params: { votacionId: string; estado: 'abierta' | 'cerrada' }) {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId)) return { error: 'Votación inválida' }
  if (params.estado !== 'abierta' && params.estado !== 'cerrada') return { error: 'Estado inválido' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('cambiar_estado_votacion_atomico', {
    p_votacion_id: params.votacionId,
    p_estado: params.estado,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function eliminarVotacion(params: { votacionId: string }) {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId)) return { error: 'Votación inválida' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('eliminar_votacion_atomico', { p_votacion_id: params.votacionId })
  if (error) return { error: error.message }
  return { success: true }
}

export async function votar(params: { votacionId: string; opcionId: string }) {
  const { error: authErr, supabase } = await requirePerfil()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId) || !esUuid(params.opcionId)) return { error: 'Votación inválida' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc('votar_atomico', {
    p_votacion_id: params.votacionId,
    p_opcion_id: params.opcionId,
  })
  if (error) return { error: error.message }
  return { success: true }
}

export async function resultadosDeVotacion(params: { votacionId: string }): Promise<{ error: string } | { resultado: ResultadoVotacion }> {
  const { error: authErr, supabase } = await requireStaffClub()
  if (authErr || !supabase) return { error: authErr ?? 'Sin sesión' }
  if (!esUuid(params.votacionId)) return { error: 'Votación inválida' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('resultados_votacion', { p_votacion_id: params.votacionId })
  if (error) return { error: error.message }
  return { resultado: data as ResultadoVotacion }
}
