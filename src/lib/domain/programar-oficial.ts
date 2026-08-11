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
 */
export function programarPartidosGreedy(
  partidos: PartidoProgramar[],
  opts: { mesas: number; bloqueMinutos: number; inicio: Date },
): Map<string, SlotProgramado> {
  const resultado = new Map<string, SlotProgramado>()
  if (!partidos.length || opts.mesas < 1) return resultado

  const ordenados = [...partidos].sort((a, b) => a.prioridad - b.prioridad)
  const asignados: Array<{ partido: PartidoProgramar; slot: SlotProgramado }> = []

  for (const p of ordenados) {
    let bloque = 0
    let asignado = false

    while (!asignado && bloque < 500) {
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

/** Prioridad: fase grupos primero, luego playoff por orden de fase y llave. */
export function prioridadPartidoOficial(fase: string, orden: number): number {
  const fases = ['grupos', 'avance', '32vos', '16vos', '8vos', 'cuartos', 'semis', 'final'] as const
  const idx = fases.indexOf(fase as typeof fases[number])
  const faseIdx = idx >= 0 ? idx : 99
  return faseIdx * 1000 + orden
}
