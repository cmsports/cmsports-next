import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Torneos que siguen vivos y en cuyos GRUPOS está el jugador.
 *
 * Vivo = ni finalizado, ni archivado, ni cancelado. La MESA (la bolsa de
 * inscripción) no cuenta: no tiene partidos.
 *
 * Lo usan "Eliminar jugador" (para retirarlo antes de borrarlo) y el cierre de
 * un torneo (para no borrar a un retirado que todavía juega en otro). No vive
 * en un archivo `'use server'` a propósito: ahí cada export es un endpoint.
 */
export async function torneosVivosDelJugador(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  jugadorId: string,
): Promise<{ error?: string; torneos: { torneoId: string; nombre: string; grupo: string }[] }> {
  const { data: filas, error: errFilas } = await supabase.from('grupo_jugadores')
    .select('grupo_id').eq('jugador_id', jugadorId)
  if (errFilas) return { error: 'No se pudo revisar si el jugador está en un torneo', torneos: [] }
  const grupoIds = (filas ?? []).map((f: { grupo_id: string | null }) => f.grupo_id).filter((id): id is string => !!id)
  if (!grupoIds.length) return { torneos: [] }

  const { data: grupos, error: errGrupos } = await supabase.from('torneo_grupos')
    .select('id,nombre,torneo_id').in('id', grupoIds)
  if (errGrupos) return { error: 'No se pudo revisar si el jugador está en un torneo', torneos: [] }
  const delTorneo = ((grupos ?? []) as { id: string; nombre: string | null; torneo_id: string | null }[])
    .filter(g => g.nombre !== 'MESA' && !!g.torneo_id)
  if (!delTorneo.length) return { torneos: [] }

  const { data: torneos, error: errTorneos } = await supabase.from('torneos')
    .select('id,nombre,estado').in('id', [...new Set(delTorneo.map(g => g.torneo_id as string))])
  if (errTorneos) return { error: 'No se pudo revisar si el jugador está en un torneo', torneos: [] }
  const vivos = new Map(((torneos ?? []) as { id: string; nombre: string | null; estado: string | null }[])
    .filter(t => !['finalizado', 'archivado', 'cancelado'].includes(t.estado ?? ''))
    .map(t => [t.id, t.nombre ?? 'sin nombre']))

  return {
    torneos: delTorneo
      .filter(g => vivos.has(g.torneo_id as string))
      .map(g => ({ torneoId: g.torneo_id as string, nombre: vivos.get(g.torneo_id as string)!, grupo: g.nombre ?? '' })),
  }
}
