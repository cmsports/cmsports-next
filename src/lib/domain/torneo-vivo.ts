type Registro = Record<string, unknown>

export type JugadorVivo = { id: string; nombre: string; grupo_id: string | null }
export type GrupoVivo = { id: string; nombre: string }
export type PartidoVivo = {
  id: string
  fase: string | null
  grupo_id: string | null
  orden: number | null
  jugador_a: string | null
  jugador_b: string | null
  ganador: string | null
  nombre_a: string | null
  nombre_b: string | null
}
export type SnapshotTorneoVivo = {
  torneo: { id: string; nombre: string; fase: string | null; estado: string | null }
  grupos: GrupoVivo[]
  jugadores: JugadorVivo[]
  partidos: PartidoVivo[]
}

function esRegistro(valor: unknown): valor is Registro {
  return !!valor && typeof valor === 'object' && !Array.isArray(valor)
}

function texto(valor: unknown): string | null {
  return typeof valor === 'string' && valor.trim() ? valor : null
}

function numero(valor: unknown): number | null {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null
}

/**
 * Convierte el resultado público de Supabase en un snapshot seguro y estable.
 * Durante la propagación de un ganador pueden existir cupos todavía vacíos; son
 * estados válidos y nunca deben derribar la vista del espectador.
 */
export function normalizarSnapshotTorneoVivo(data: unknown): SnapshotTorneoVivo | null {
  if (!esRegistro(data) || !esRegistro(data.torneo)) return null

  const torneoId = texto(data.torneo.id)
  if (!torneoId) return null

  const gruposPorId = new Map<string, GrupoVivo>()
  if (Array.isArray(data.grupos)) {
    for (const fila of data.grupos) {
      if (!esRegistro(fila)) continue
      const id = texto(fila.id)
      if (!id) continue
      gruposPorId.set(id, { id, nombre: texto(fila.nombre) ?? 'Grupo' })
    }
  }
  const grupos = [...gruposPorId.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
  )

  const gruposVisibles = new Set(grupos.map(grupo => grupo.id))
  const jugadoresPorId = new Map<string, JugadorVivo>()
  if (Array.isArray(data.jugadores)) {
    for (const fila of data.jugadores) {
      if (!esRegistro(fila)) continue
      const id = texto(fila.id)
      if (!id) continue
      const grupoId = texto(fila.grupo_id)
      const candidato = {
        id,
        nombre: texto(fila.nombre) ?? 'Jugador',
        grupo_id: grupoId,
      }
      const actual = jugadoresPorId.get(id)
      // Un jugador puede aparecer también en MESA. Se conserva su grupo visible.
      if (!actual || (gruposVisibles.has(grupoId ?? '') && !gruposVisibles.has(actual.grupo_id ?? ''))) {
        jugadoresPorId.set(id, candidato)
      }
    }
  }
  const jugadores = [...jugadoresPorId.values()].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es') || a.id.localeCompare(b.id),
  )

  const nombrePorJugador = new Map(jugadores.map(jugador => [jugador.id, jugador.nombre]))
  const partidosPorId = new Map<string, PartidoVivo>()
  if (Array.isArray(data.partidos)) {
    for (const fila of data.partidos) {
      if (!esRegistro(fila)) continue
      const id = texto(fila.id)
      if (!id) continue
      const jugadorA = texto(fila.jugador_a)
      const jugadorB = texto(fila.jugador_b)
      partidosPorId.set(id, {
        id,
        fase: texto(fila.fase),
        grupo_id: texto(fila.grupo_id),
        orden: numero(fila.orden),
        jugador_a: jugadorA,
        jugador_b: jugadorB,
        ganador: texto(fila.ganador),
        nombre_a: texto(fila.nombre_a) ?? (jugadorA ? nombrePorJugador.get(jugadorA) ?? null : null),
        nombre_b: texto(fila.nombre_b) ?? (jugadorB ? nombrePorJugador.get(jugadorB) ?? null : null),
      })
    }
  }
  const partidos = [...partidosPorId.values()].sort((a, b) =>
    (a.fase ?? '').localeCompare(b.fase ?? '') ||
    (a.orden ?? Number.MAX_SAFE_INTEGER) - (b.orden ?? Number.MAX_SAFE_INTEGER) ||
    a.id.localeCompare(b.id),
  )

  return {
    torneo: {
      id: torneoId,
      nombre: texto(data.torneo.nombre) ?? 'Torneo',
      fase: texto(data.torneo.fase),
      estado: texto(data.torneo.estado),
    },
    grupos,
    jugadores,
    partidos,
  }
}

export function firmaSnapshotTorneoVivo(snapshot: SnapshotTorneoVivo): string {
  return JSON.stringify(snapshot)
}
