/**
 * La regla que no se puede romper en la fase de grupos.
 *
 * Todo partido de un grupo es entre dos integrantes de ESE grupo, y todo par
 * de integrantes tiene su partido. Parece obvio, pero ningún motor de la base
 * lo exige: los grupos y los partidos se escriben en pasos separados desde la
 * Server Action, y si un paso falla a la mitad —o una lectura devuelve la foto
 * de antes— queda un estado que se ve normal hasta que alguien juega.
 *
 * Así pasó el 2026-10-25 en TC A y TC B: al mover a un jugador, el grupo de
 * origen siguió con partidos contra el que se había ido ("vs —") y el de
 * destino sin los partidos del que llegó. Las migraciones 213 y 214 repararon
 * a mano lo mismo en otro torneo (partidos apuntando a jugadores que no están
 * inscritos en ningún grupo).
 *
 * Esta función no repara nada: solo mira y cuenta lo que está mal, para que
 * la pantalla del torneo lo muestre antes de que se juegue sobre eso y para
 * que las pruebas de cada acción comprueben el estado final, no solo el
 * mensaje que devuelve.
 */

export type GrupoDelTorneo = { id: string; nombre: string | null; en_preparacion?: boolean | null }
export type MiembroDeGrupo = { grupo_id: string; jugador_id: string | null }
export type PartidoDeGrupo = {
  id: string
  grupo_id: string | null
  jugador_a: string | null
  jugador_b: string | null
}

export type CodigoInconsistencia =
  | 'partido_en_grupo_inexistente'
  | 'partido_sin_rival'
  | 'partido_con_jugador_ajeno'
  | 'pareja_sin_partido'
  | 'partido_repetido'
  | 'jugador_en_dos_grupos'
  | 'grupo_sin_jugadores'

export type Inconsistencia = {
  codigo: CodigoInconsistencia
  grupoId: string | null
  grupo: string
  partidoId?: string
  jugadorIds: string[]
  detalle: string
}

/** El grupo MESA es la lista de inscritos, no un grupo que se juegue. */
const esMesa = (g: GrupoDelTorneo) => g.nombre === 'MESA'

const clavePar = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`)

export function inconsistenciasDeGrupos(params: {
  grupos: GrupoDelTorneo[]
  miembros: MiembroDeGrupo[]
  /** Solo los partidos de la fase de grupos. */
  partidos: PartidoDeGrupo[]
  /** 2 en una liguilla a doble rueda: cada pareja juega dos veces. */
  ruedas?: 1 | 2
  /** Para escribir "Juan Pérez" en vez de un id. Sin esto se usa el id. */
  nombreDe?: (jugadorId: string) => string
}): Inconsistencia[] {
  const { grupos, miembros, partidos, ruedas = 1 } = params
  const nombre = (id: string | null) => (id ? (params.nombreDe?.(id) ?? id) : '—')
  const grupoPorId = new Map(grupos.map(g => [g.id, g]))
  const etiqueta = (g: GrupoDelTorneo | undefined) => g?.nombre ?? 'sin nombre'

  const miembrosPorGrupo = new Map<string, Set<string>>()
  for (const m of miembros) {
    if (!m.jugador_id) continue
    const set = miembrosPorGrupo.get(m.grupo_id) ?? new Set<string>()
    set.add(m.jugador_id)
    miembrosPorGrupo.set(m.grupo_id, set)
  }

  const out: Inconsistencia[] = []

  // 1. Cada partido contra los integrantes de su grupo.
  const partidosPorPar = new Map<string, number>()
  for (const p of partidos) {
    const grupo = p.grupo_id ? grupoPorId.get(p.grupo_id) : undefined
    if (!p.grupo_id || !grupo) {
      out.push({
        codigo: 'partido_en_grupo_inexistente', grupoId: p.grupo_id, grupo: 'sin grupo', partidoId: p.id,
        jugadorIds: [p.jugador_a, p.jugador_b].filter((x): x is string => !!x),
        detalle: `Hay un partido (${nombre(p.jugador_a)} vs ${nombre(p.jugador_b)}) que apunta a un grupo que ya no existe.`,
      })
      continue
    }
    if (!p.jugador_a || !p.jugador_b) {
      out.push({
        codigo: 'partido_sin_rival', grupoId: grupo.id, grupo: etiqueta(grupo), partidoId: p.id,
        jugadorIds: [p.jugador_a, p.jugador_b].filter((x): x is string => !!x),
        detalle: `En el grupo ${etiqueta(grupo)} hay un partido sin rival (${nombre(p.jugador_a)} vs ${nombre(p.jugador_b)}).`,
      })
      continue
    }
    const integrantes = miembrosPorGrupo.get(grupo.id) ?? new Set<string>()
    const ajenos = [p.jugador_a, p.jugador_b].filter(j => !integrantes.has(j))
    if (ajenos.length) {
      out.push({
        codigo: 'partido_con_jugador_ajeno', grupoId: grupo.id, grupo: etiqueta(grupo), partidoId: p.id,
        jugadorIds: ajenos,
        detalle: `En el grupo ${etiqueta(grupo)}, el partido ${nombre(p.jugador_a)} vs ${nombre(p.jugador_b)} incluye a ${ajenos.map(nombre).join(' y ')}, que no está en ese grupo.`,
      })
      continue
    }
    const k = `${grupo.id}#${clavePar(p.jugador_a, p.jugador_b)}`
    partidosPorPar.set(k, (partidosPorPar.get(k) ?? 0) + 1)
  }

  // 2. Cada grupo que se juega: todos contra todos, sin repetir de más.
  for (const g of grupos) {
    if (esMesa(g) || g.en_preparacion) continue
    const ids = [...(miembrosPorGrupo.get(g.id) ?? [])]
    if (!ids.length) {
      out.push({
        codigo: 'grupo_sin_jugadores', grupoId: g.id, grupo: etiqueta(g), jugadorIds: [],
        detalle: `El grupo ${etiqueta(g)} no tiene ningún jugador.`,
      })
      continue
    }
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const veces = partidosPorPar.get(`${g.id}#${clavePar(ids[i], ids[j])}`) ?? 0
        if (veces === 0) {
          out.push({
            codigo: 'pareja_sin_partido', grupoId: g.id, grupo: etiqueta(g), jugadorIds: [ids[i], ids[j]],
            detalle: `En el grupo ${etiqueta(g)} falta el partido ${nombre(ids[i])} vs ${nombre(ids[j])}.`,
          })
        } else if (veces > ruedas) {
          out.push({
            codigo: 'partido_repetido', grupoId: g.id, grupo: etiqueta(g), jugadorIds: [ids[i], ids[j]],
            detalle: `En el grupo ${etiqueta(g)}, ${nombre(ids[i])} vs ${nombre(ids[j])} está ${veces} veces y debería estar ${ruedas}.`,
          })
        }
      }
    }
  }

  // 3. Un jugador no puede estar en dos grupos que se juegan. MESA no cuenta:
  // ahí queda la inscripción como respaldo mientras se arman los grupos.
  const enGrupo = new Map<string, string[]>()
  for (const g of grupos) {
    if (esMesa(g)) continue
    for (const j of miembrosPorGrupo.get(g.id) ?? []) enGrupo.set(j, [...(enGrupo.get(j) ?? []), g.id])
  }
  for (const [jugador, gids] of enGrupo) {
    if (gids.length < 2) continue
    out.push({
      codigo: 'jugador_en_dos_grupos', grupoId: null, grupo: gids.map(id => etiqueta(grupoPorId.get(id))).join(' y '),
      jugadorIds: [jugador],
      detalle: `${nombre(jugador)} figura en ${gids.length} grupos a la vez (${gids.map(id => etiqueta(grupoPorId.get(id))).join(', ')}).`,
    })
  }

  return out
}
