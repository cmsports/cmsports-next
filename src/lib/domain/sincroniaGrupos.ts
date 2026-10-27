/**
 * ¿Lo que la pantalla tiene de los grupos cuadra con lo que tiene de los
 * partidos?
 *
 * La pantalla del torneo se mantiene al día escuchando `torneo_partidos`, y
 * cuando algo cambia recarga SOLO los partidos. Pero `grupo_jugadores` y
 * `torneo_grupos` no están en el tiempo real: cuando otra persona mueve a un
 * jugador de grupo —o se arman los grupos, o se saca a alguien—, esta pantalla
 * recibe los partidos nuevos y se queda con los integrantes viejos. El nombre
 * del rival se busca en la lista de integrantes del grupo, así que el partido
 * sale "contra —" aunque la base esté perfecta. Eso es lo que se vio en TC A y
 * TC B (2026-10-25) y se atribuyó, por error, a una lectura vieja del servidor.
 *
 * Esta función detecta el desajuste para que la pantalla recargue los grupos
 * completos en vez de dejar al usuario mirando una foto a medias.
 */

export type GrupoSincronia = { id: string; nombre?: string | null; en_preparacion?: boolean | null }
export type MiembroSincronia = { grupo_id?: string | null; jugador_id?: string | null }
export type PartidoSincronia = {
  grupo_id?: string | null
  fase?: string | null
  jugador_a?: string | null
  jugador_b?: string | null
}

const clave = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

/**
 * Ids de los grupos cuyos partidos no son exactamente los cruces de sus
 * integrantes (todos contra todos).
 *
 * Los partidos con un rival vacío no cuentan: son lo que deja borrar a un
 * jugador de la plataforma en pleno torneo, un daño de la base que recargar no
 * arregla. Contarlos haría recargar la pantalla en cada resultado, para siempre.
 *
 * No se mira la MESA (la bolsa de inscripción, no juega) ni los grupos en
 * preparación (sus partidos se habilitan al finalizarlos).
 */
export function gruposFueraDeSincronia(
  grupos: GrupoSincronia[],
  miembros: MiembroSincronia[],
  partidos: PartidoSincronia[],
): string[] {
  const fuera: string[] = []
  for (const g of grupos) {
    if (g.nombre === 'MESA' || g.en_preparacion) continue

    const ids = miembros
      .filter(m => m.grupo_id === g.id)
      .map(m => m.jugador_id)
      .filter((id): id is string => !!id)
    const esperados = new Set<string>()
    for (let i = 0; i < ids.length; i++) {
      for (let k = i + 1; k < ids.length; k++) esperados.add(clave(ids[i], ids[k]))
    }

    const reales = new Set<string>()
    for (const p of partidos) {
      if (p.fase !== 'grupos' || p.grupo_id !== g.id) continue
      if (!p.jugador_a || !p.jugador_b) continue
      reales.add(clave(p.jugador_a, p.jugador_b))
    }

    const iguales = esperados.size === reales.size && [...esperados].every(c => reales.has(c))
    if (!iguales) fuera.push(g.id)
  }
  return fuera
}
