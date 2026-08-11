/** Asignación greedy de mesas y horarios para torneo oficial. */

export type PartidoProgramar = {
  id: string
  inscritoA: string | null
  inscritoB: string | null
  /** Prioridad menor = se programa antes (grupos antes que llaves). */
  prioridad: number
}

export type SlotProgramado = {
  mesa: number
  programadoEn: Date
}

function jugadoresEnConflicto(
  a: PartidoProgramar,
  b: PartidoProgramar,
): boolean {
  const idsA = [a.inscritoA, a.inscritoB].filter(Boolean) as string[]
  const idsB = [b.inscritoA, b.inscritoB].filter(Boolean) as string[]
  return idsA.some(id => idsB.includes(id))
}

/**
 * Asigna mesa y hora a cada partido sin solapar jugadores ni mesas.
 * Los bloques son discretos: inicio + n × bloqueMinutos.
 * Si un partido no cabe en `maxBloques` (default 500), queda fuera del Map.
 */
export function programarPartidosGreedy(
  partidos: PartidoProgramar[],
  opts: { mesas: number; bloqueMinutos: number; inicio: Date; maxBloques?: number },
): Map<string, SlotProgramado> {
  const resultado = new Map<string, SlotProgramado>()
  if (!partidos.length || opts.mesas < 1) return resultado

  const maxBloques = opts.maxBloques ?? 500
  const ordenados = [...partidos].sort((a, b) => a.prioridad - b.prioridad)
  const asignados: Array<{ partido: PartidoProgramar; slot: SlotProgramado }> = []

  for (const p of ordenados) {
    let bloque = 0
    let asignado = false

    while (!asignado && bloque < maxBloques) {
      for (let mesa = 1; mesa <= opts.mesas; mesa++) {
        const programadoEn = new Date(opts.inicio.getTime() + bloque * opts.bloqueMinutos * 60_000)
        const slot: SlotProgramado = { mesa, programadoEn }

        const mesaOcupada = asignados.some(a =>
          a.slot.mesa === mesa && a.slot.programadoEn.getTime() === programadoEn.getTime(),
        )
        if (mesaOcupada) continue

        const jugadorOcupado = asignados.some(a =>
          a.slot.programadoEn.getTime() === programadoEn.getTime() && jugadoresEnConflicto(a.partido, p),
        )
        if (jugadorOcupado) continue

        asignados.push({ partido: p, slot })
        resultado.set(p.id, slot)
        asignado = true
        break
      }
      if (!asignado) bloque++
    }
  }

  return resultado
}

/** Igual que greedy, pero reporta IDs que no cupieron (maña silenciosa antes). */
export function programarPartidosGreedyConInforme(
  partidos: PartidoProgramar[],
  opts: { mesas: number; bloqueMinutos: number; inicio: Date; maxBloques?: number },
): { asignaciones: Map<string, SlotProgramado>; omitidos: string[] } {
  const asignaciones = programarPartidosGreedy(partidos, opts)
  const omitidos = partidos.filter(p => !asignaciones.has(p.id)).map(p => p.id)
  return { asignaciones, omitidos }
}

/** Prioridad: fase grupos primero, luego playoff por orden de fase y llave. */
export function prioridadPartidoOficial(fase: string, orden: number): number {
  const fases = ['grupos', 'avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'tercer_lugar', 'final'] as const
  const idx = fases.indexOf(fase as typeof fases[number])
  const faseIdx = idx >= 0 ? idx : 99
  return faseIdx * 1000 + orden
}

export type PartidoProgramaSlot = {
  id: string
  inscritoA: string | null
  inscritoB: string | null
  mesa: number | null
  programadoEn: string | Date | null
}

export type ConflictoPrograma = {
  partidoId: string
  otroId: string
  tipo: 'mesa' | 'jugador'
  motivo: string
}

/** Conflictos de mesa u jugador en el mismo bloque horario (§4.4, 4.7). */
export function detectarConflictosPrograma(partidos: PartidoProgramaSlot[]): ConflictoPrograma[] {
  const conSlot = partidos.filter(p => p.mesa != null && p.mesa > 0 && p.programadoEn)
  const out: ConflictoPrograma[] = []
  const visto = new Set<string>()

  for (let i = 0; i < conSlot.length; i++) {
    for (let j = i + 1; j < conSlot.length; j++) {
      const a = conSlot[i]
      const b = conSlot[j]
      const tA = new Date(a.programadoEn!).getTime()
      const tB = new Date(b.programadoEn!).getTime()
      if (tA !== tB) continue

      const pairKey = [a.id, b.id].sort().join('|')
      if (visto.has(pairKey)) continue

      if (a.mesa === b.mesa) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'mesa',
          motivo: `Mesa ${a.mesa} ocupada por dos partidos a la misma hora`,
        })
        continue
      }

      const idsA = [a.inscritoA, a.inscritoB].filter(Boolean) as string[]
      const idsB = [b.inscritoA, b.inscritoB].filter(Boolean) as string[]
      const solape = idsA.find(id => idsB.includes(id))
      if (solape) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'jugador',
          motivo: 'Un jugador está en dos partidos a la misma hora',
        })
      }
    }
  }
  return out
}

/** Valida un slot propuesto contra el resto del programa. */
export function conflictosAlAsignar(
  partidos: PartidoProgramaSlot[],
  partidoId: string,
  mesa: number,
  programadoEn: Date,
): ConflictoPrograma[] {
  const proyectado = partidos.map(p =>
    p.id === partidoId
      ? { ...p, mesa, programadoEn: programadoEn.toISOString() }
      : p,
  )
  return detectarConflictosPrograma(proyectado).filter(
    c => c.partidoId === partidoId || c.otroId === partidoId,
  )
}

/**
 * Partido con clave de persona para conflictos multi-evento (§4.3).
 * `claveJugador*` = jugador_id o nombre normalizado (los inscrito_id no cruzan eventos).
 */
export type PartidoProgramaMulti = PartidoProgramaSlot & {
  eventoId?: string
  claveJugadorA?: string | null
  claveJugadorB?: string | null
  eventoNombre?: string
  labelPartido?: string
}

export type ConflictoProgramaEnriquecido = ConflictoPrograma & {
  eventoIdA?: string
  eventoIdB?: string
  labelA?: string
  labelB?: string
}

function clavesDe(p: PartidoProgramaMulti): string[] {
  const out: string[] = []
  if (p.claveJugadorA) out.push(p.claveJugadorA)
  if (p.claveJugadorB) out.push(p.claveJugadorB)
  // Fallback intra-evento: inscrito ids
  if (!p.claveJugadorA && p.inscritoA) out.push(`ins:${p.inscritoA}`)
  if (!p.claveJugadorB && p.inscritoB) out.push(`ins:${p.inscritoB}`)
  return out
}

/** Conflictos de mesa o misma persona (multi-evento) a la misma hora. */
export function detectarConflictosProgramaMulti(
  partidos: PartidoProgramaMulti[],
): ConflictoProgramaEnriquecido[] {
  const conSlot = partidos.filter(p => p.mesa != null && p.mesa > 0 && p.programadoEn)
  const out: ConflictoProgramaEnriquecido[] = []
  const visto = new Set<string>()

  for (let i = 0; i < conSlot.length; i++) {
    for (let j = i + 1; j < conSlot.length; j++) {
      const a = conSlot[i]
      const b = conSlot[j]
      const tA = new Date(a.programadoEn!).getTime()
      const tB = new Date(b.programadoEn!).getTime()
      if (tA !== tB) continue

      const pairKey = [a.id, b.id].sort().join('|')
      if (visto.has(pairKey)) continue

      if (a.mesa === b.mesa) {
        visto.add(pairKey)
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'mesa',
          motivo: `Mesa ${a.mesa} ocupada por dos partidos a la misma hora`,
          eventoIdA: a.eventoId,
          eventoIdB: b.eventoId,
          labelA: a.labelPartido,
          labelB: b.labelPartido,
        })
        continue
      }

      const clavesA = new Set(clavesDe(a))
      const solape = clavesDe(b).find(k => clavesA.has(k))
      if (solape) {
        visto.add(pairKey)
        const cruzado = a.eventoId && b.eventoId && a.eventoId !== b.eventoId
        out.push({
          partidoId: a.id,
          otroId: b.id,
          tipo: 'jugador',
          motivo: cruzado
            ? 'Un jugador está en dos eventos a la misma hora'
            : 'Un jugador está en dos partidos a la misma hora',
          eventoIdA: a.eventoId,
          eventoIdB: b.eventoId,
          labelA: a.labelPartido,
          labelB: b.labelPartido,
        })
      }
    }
  }
  return out
}
