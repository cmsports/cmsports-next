import { generarRoundRobin } from './torneos'

export interface PartidoFixtureLiga {
  jugadorA: string
  jugadorB: string
  orden: number
}

export function calcularTotalPartidos(numJugadores: number): number {
  return (numJugadores * (numJugadores - 1)) / 2
}

export function generarFixtureDivision(jugadorIds: string[]): PartidoFixtureLiga[] {
  return generarRoundRobin(jugadorIds).map(([jugadorA, jugadorB], orden) => ({
    jugadorA,
    jugadorB,
    orden,
  }))
}

// ─── Resultados Bo5 (Paso 5) ───────────────────────────────────────────────
// HC-08: únicos marcadores válidos en un partido Mejor de Cinco.

const RESULTADOS_BO5_VALIDOS = new Set(['3-0', '3-1', '3-2', '0-3', '1-3', '2-3'])

export function esResultadoBo5Valido(setsA: number, setsB: number): boolean {
  return RESULTADOS_BO5_VALIDOS.has(`${setsA}-${setsB}`)
}

export function determinarGanadorBo5(
  setsA: number,
  setsB: number,
  jugadorAId: string,
  jugadorBId: string,
): string {
  return setsA > setsB ? jugadorAId : jugadorBId
}

// ─── Ranking por división (Paso 7) ─────────────────────────────────────────
// Puntos: victoria 3, derrota 1, walkover ganado 3, walkover perdido 0.
// Orden: Puntos → Partidos Ganados → Diferencia de Sets → Sets a Favor →
// enfrentamiento directo.

export interface PartidoFinalizado {
  jugadorAId: string
  jugadorBId: string
  ganadorId: string
  esWalkover: boolean
  setsA: number | null
  setsB: number | null
}

export interface FilaRanking {
  jugadorId: string
  pj: number
  pg: number
  pp: number
  pts: number
  sf: number
  sc: number
  ds: number
}

export function calcularRankingDivision(
  jugadorIds: string[],
  partidos: PartidoFinalizado[],
): FilaRanking[] {
  const statsMap = new Map<string, FilaRanking>()
  for (const id of jugadorIds) {
    statsMap.set(id, { jugadorId: id, pj: 0, pg: 0, pp: 0, pts: 0, sf: 0, sc: 0, ds: 0 })
  }

  for (const p of partidos) {
    const ganador = statsMap.get(p.ganadorId)
    const perdedorId = p.ganadorId === p.jugadorAId ? p.jugadorBId : p.jugadorAId
    const perdedor = statsMap.get(perdedorId)
    if (!ganador || !perdedor) continue

    ganador.pj += 1
    ganador.pg += 1
    ganador.pts += 3

    perdedor.pj += 1
    perdedor.pp += 1
    perdedor.pts += p.esWalkover ? 0 : 1

    if (!p.esWalkover && p.setsA !== null && p.setsB !== null) {
      const setsGanador = p.ganadorId === p.jugadorAId ? p.setsA : p.setsB
      const setsPerdedor = p.ganadorId === p.jugadorAId ? p.setsB : p.setsA
      ganador.sf += setsGanador
      ganador.sc += setsPerdedor
      perdedor.sf += setsPerdedor
      perdedor.sc += setsGanador
    }
  }

  for (const fila of statsMap.values()) fila.ds = fila.sf - fila.sc

  const filas = Array.from(statsMap.values())
  filas.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.pg !== a.pg) return b.pg - a.pg
    if (b.ds !== a.ds) return b.ds - a.ds
    if (b.sf !== a.sf) return b.sf - a.sf
    const directo = partidos.find(
      p =>
        (p.jugadorAId === a.jugadorId && p.jugadorBId === b.jugadorId) ||
        (p.jugadorAId === b.jugadorId && p.jugadorBId === a.jugadorId),
    )
    if (directo?.ganadorId === a.jugadorId) return -1
    if (directo?.ganadorId === b.jugadorId) return 1
    return 0
  })

  return filas
}

// ─── Motor de programación (Paso 3) ────────────────────────────────────────
// Reglas inquebrantables (Anexo A): HC-01 (jugador no en 2 partidos a la vez),
// HC-02 (se permiten bloques consecutivos sin descanso mínimo — intencional),
// HC-03/HC-06 (una mesa, un partido por bloque), HC-04 (árbitro distinto a
// ambos jugadores). Eficiencia > equilibrio: se prioriza compactar los
// partidos de cada jugador en bloques contiguos.

export const BLOQUE_INICIO = '09:00'
export const BLOQUE_FIN = '17:00'
export const BLOQUE_DURACION_MIN = 30

function horaAMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function minutosAHora(min: number): string {
  const h = String(Math.floor(min / 60)).padStart(2, '0')
  const m = String(min % 60).padStart(2, '0')
  return `${h}:${m}`
}

export function generarBloquesHorario(
  inicio: string = BLOQUE_INICIO,
  fin: string = BLOQUE_FIN,
  pasoMinutos: number = BLOQUE_DURACION_MIN,
): string[] {
  const bloques: string[] = []
  for (let t = horaAMinutos(inicio); t < horaAMinutos(fin); t += pasoMinutos) {
    bloques.push(minutosAHora(t))
  }
  return bloques
}

export interface PartidoAProgramar {
  id: string
  divisionId: string
  jugadorAId: string
  jugadorBId: string
  ordenFixture: number
}

export interface PartidoProgramado extends PartidoAProgramar {
  fechaNumero: number
  mesaNumero: number
  bloqueHorario: string
  arbitroId: string | null
}

// Reparte los partidos pendientes entre las fechas disponibles, intercalando
// divisiones para que cada jornada combine varias divisiones, y respeta la
// capacidad física (mesas × bloques) de cada fecha.
export interface ResultadoDistribucionFechas {
  fechas: PartidoAProgramar[][]
  sobrantes: PartidoAProgramar[]
}

export function distribuirEnFechas(
  partidos: PartidoAProgramar[],
  numFechas: number,
  capacidadPorFecha: number,
): ResultadoDistribucionFechas {
  const porDivision = new Map<string, PartidoAProgramar[]>()
  for (const p of partidos) {
    const arr = porDivision.get(p.divisionId) ?? []
    arr.push(p)
    porDivision.set(p.divisionId, arr)
  }

  const colas = Array.from(porDivision.values()).map(arr => [...arr])
  const intercalados: PartidoAProgramar[] = []
  let quedan = true
  while (quedan) {
    quedan = false
    for (const cola of colas) {
      const siguiente = cola.shift()
      if (siguiente) {
        intercalados.push(siguiente)
        quedan = true
      }
    }
  }

  const fechas: PartidoAProgramar[][] = Array.from({ length: numFechas }, () => [])
  const sobrantes: PartidoAProgramar[] = []
  let fechaActual = 0
  for (const p of intercalados) {
    while (fechas[fechaActual].length >= capacidadPorFecha && fechaActual < numFechas - 1) fechaActual++
    if (fechas[fechaActual].length >= capacidadPorFecha) {
      sobrantes.push(p) // no caben en ninguna fecha regular — quedan para Fecha 5 (ajuste)
      continue
    }
    fechas[fechaActual].push(p)
  }
  return { fechas, sobrantes }
}

export interface ResultadoProgramacionFecha {
  programados: PartidoProgramado[]
  sinAsignar: PartidoAProgramar[]
}

// Normaliza un string de bloque horario al formato HH:MM, independiente de si
// viene de la BD ("09:00:00") o del scheduler ("09:00").
export function normalizarBloque(s: string | null | undefined): string | null {
  if (!s) return null
  return s.length >= 5 ? s.substring(0, 5) : s
}

// Asigna mesa y bloque horario a los partidos de una fecha, recorriendo los
// bloques en orden cronológico. Prioridad doble:
// 1. Continuación: partidos donde algún jugador jugó en el bloque inmediato anterior
// 2. Dentro de cada grupo, mayor peso = jugadores con más partidos pendientes
//    (compactación: los jugadores con muchos partidos quedan en bloques consecutivos
//     y pueden retirarse antes).
export function programarFecha(
  partidos: PartidoAProgramar[],
  fechaNumero: number,
  mesas: number[],
  bloques: string[],
): ResultadoProgramacionFecha {
  const pendientes = [...partidos]
  const programados: PartidoProgramado[] = []
  const ultimoBloqueJugador = new Map<string, number>()

  for (let bIdx = 0; bIdx < bloques.length && pendientes.length > 0; bIdx++) {
    const mesasLibres = [...mesas]

    // Peso = partidos pendientes del jugador A + del jugador B (desc)
    const pendientesPorJugador = new Map<string, number>()
    for (const p of pendientes) {
      pendientesPorJugador.set(p.jugadorAId, (pendientesPorJugador.get(p.jugadorAId) ?? 0) + 1)
      pendientesPorJugador.set(p.jugadorBId, (pendientesPorJugador.get(p.jugadorBId) ?? 0) + 1)
    }
    const peso = (p: PartidoAProgramar) =>
      (pendientesPorJugador.get(p.jugadorAId) ?? 0) + (pendientesPorJugador.get(p.jugadorBId) ?? 0)

    const continuacion: PartidoAProgramar[] = []
    const nuevos: PartidoAProgramar[] = []

    for (const p of pendientes) {
      const ultA = ultimoBloqueJugador.get(p.jugadorAId)
      const ultB = ultimoBloqueJugador.get(p.jugadorBId)
      if (ultA === bIdx || ultB === bIdx) continue
      if (ultA === bIdx - 1 || ultB === bIdx - 1) continuacion.push(p)
      else nuevos.push(p)
    }

    continuacion.sort((a, b) => peso(b) - peso(a))
    nuevos.sort((a, b) => peso(b) - peso(a))

    const candidatos = [...continuacion, ...nuevos]
    const usadosEsteBloque = new Set<string>()

    for (const p of candidatos) {
      if (mesasLibres.length === 0) break
      if (usadosEsteBloque.has(p.jugadorAId) || usadosEsteBloque.has(p.jugadorBId)) continue

      const mesa = mesasLibres.shift()!
      programados.push({ ...p, fechaNumero, mesaNumero: mesa, bloqueHorario: bloques[bIdx], arbitroId: null })
      usadosEsteBloque.add(p.jugadorAId)
      usadosEsteBloque.add(p.jugadorBId)
      ultimoBloqueJugador.set(p.jugadorAId, bIdx)
      ultimoBloqueJugador.set(p.jugadorBId, bIdx)

      const i = pendientes.indexOf(p)
      if (i >= 0) pendientes.splice(i, 1)
    }
  }

  return { programados, sinAsignar: pendientes }
}

// Asigna árbitros (HC-04): jugador de la misma división y fecha, distinto a
// ambos competidores, priorizando a quien tenga su propio partido más cerca
// en el tiempo (minimiza permanencia ociosa). Si nadie de los que juegan ese
// día sirve, recurre al resto del plantel de la división.
export function asignarArbitros(
  programados: PartidoProgramado[],
  jugadoresPorDivision: Map<string, string[]>,
): PartidoProgramado[] {
  const porGrupo = new Map<string, PartidoProgramado[]>()
  for (const p of programados) {
    const key = `${p.divisionId}::${p.fechaNumero}`
    const arr = porGrupo.get(key) ?? []
    arr.push(p)
    porGrupo.set(key, arr)
  }

  const arbitroUsadoEnBloque = new Map<string, Set<string>>()
  const resultado: PartidoProgramado[] = []

  for (const partidos of porGrupo.values()) {
    const ordenados = [...partidos].sort((a, b) => horaAMinutos(a.bloqueHorario) - horaAMinutos(b.bloqueHorario))

    for (const partido of ordenados) {
      const slotKey = `${partido.fechaNumero}::${partido.bloqueHorario}`
      const usadosEsteSlot = arbitroUsadoEnBloque.get(slotKey) ?? new Set<string>()
      const minutoPartido = horaAMinutos(partido.bloqueHorario)
      const jugadoresPartido = new Set([partido.jugadorAId, partido.jugadorBId])

      let mejorCandidato: string | null = null
      let mejorDistancia = Infinity

      for (const candidato of partidos) {
        if (candidato.id === partido.id) continue
        if (candidato.bloqueHorario === partido.bloqueHorario) continue // está jugando a esa hora

        for (const jc of [candidato.jugadorAId, candidato.jugadorBId]) {
          if (jugadoresPartido.has(jc)) continue
          if (usadosEsteSlot.has(jc)) continue
          const distancia = Math.abs(horaAMinutos(candidato.bloqueHorario) - minutoPartido)
          if (distancia < mejorDistancia) {
            mejorDistancia = distancia
            mejorCandidato = jc
          }
        }
      }

      if (!mejorCandidato) {
        const roster = jugadoresPorDivision.get(partido.divisionId) ?? []
        for (const jid of roster) {
          if (jugadoresPartido.has(jid) || usadosEsteSlot.has(jid)) continue
          mejorCandidato = jid
          break
        }
      }

      if (mejorCandidato) {
        usadosEsteSlot.add(mejorCandidato)
        arbitroUsadoEnBloque.set(slotKey, usadosEsteSlot)
      }
      resultado.push({ ...partido, arbitroId: mejorCandidato })
    }
  }

  return resultado
}

// ─── Diff de fixture (F2) ──────────────────────────────────────────────────
// Calcula qué cambia al modificar jugadores de una división con fixture ya
// generado. Función pura — no toca la BD, solo compara sets.

export interface DiffDivision {
  jugadoresAgregados: string[]
  jugadoresRemovidos: string[]
  partidosNuevos: Array<{ a: string; b: string }>
  partidosAAnular: Array<{ a: string; b: string }>
  partidosPreservados: Array<{ a: string; b: string }>
}

function canonicalKey(a: string, b: string): string {
  return a < b ? `${a}~${b}` : `${b}~${a}`
}

export function calcularDiffDivision(
  actuales: string[],
  nuevos: string[],
  partidosActivos: Array<{ jugadorAId: string; jugadorBId: string; jugado: boolean }>,
): DiffDivision {
  const setActual = new Set(actuales)
  const setNuevo = new Set(nuevos)

  const jugadoresAgregados = nuevos.filter(id => !setActual.has(id))
  const jugadoresRemovidos = actuales.filter(id => !setNuevo.has(id))
  const setRemovidos = new Set(jugadoresRemovidos)

  const partidosAAnular: Array<{ a: string; b: string }> = []
  const partidosPreservados: Array<{ a: string; b: string }> = []
  const paresExistentes = new Set<string>()

  for (const p of partidosActivos) {
    paresExistentes.add(canonicalKey(p.jugadorAId, p.jugadorBId))
    const involucraRemovido = setRemovidos.has(p.jugadorAId) || setRemovidos.has(p.jugadorBId)
    if (involucraRemovido) {
      if (p.jugado) partidosPreservados.push({ a: p.jugadorAId, b: p.jugadorBId })
      else partidosAAnular.push({ a: p.jugadorAId, b: p.jugadorBId })
    }
  }

  const partidosNuevos: Array<{ a: string; b: string }> = []
  for (let i = 0; i < nuevos.length; i++) {
    for (let j = i + 1; j < nuevos.length; j++) {
      if (!paresExistentes.has(canonicalKey(nuevos[i], nuevos[j]))) {
        partidosNuevos.push({ a: nuevos[i], b: nuevos[j] })
      }
    }
  }

  return { jugadoresAgregados, jugadoresRemovidos, partidosNuevos, partidosAAnular, partidosPreservados }
}

// ─── Validación de movimientos manuales / Drag & Drop (Paso 4) ────────────

export interface PartidoExistente {
  id: string
  fechaId: string | null
  mesaId: string | null
  bloqueHorario: string | null
  jugadorAId: string
  jugadorBId: string
  arbitroId: string | null
}

export interface DestinoMovimiento {
  fechaId: string
  mesaId: string
  bloqueHorario: string
}

export interface ResultadoValidacionMovimiento {
  valido: boolean
  motivo?: string
}

// Valida que mover `partido` al `destino` no rompa HC-01 (jugador en dos
// partidos a la vez), HC-03/HC-06 (mesa ocupada) ni HC-04 (conflicto de
// árbitro). `partidosDeLaFecha` debe incluir todos los partidos ya
// asignados a la fecha destino (puede incluir o no el propio partido).
export function validarMovimientoPartido(
  partido: PartidoExistente,
  destino: DestinoMovimiento,
  partidosDeLaFecha: PartidoExistente[],
): ResultadoValidacionMovimiento {
  const otros = partidosDeLaFecha.filter(p => p.id !== partido.id)
  const enMismoBloque = otros.filter(p => p.bloqueHorario === destino.bloqueHorario)

  if (enMismoBloque.some(p => p.mesaId === destino.mesaId)) {
    return { valido: false, motivo: 'La mesa ya está ocupada en ese horario' }
  }

  const jugadoresOcupados = new Set<string>()
  for (const p of enMismoBloque) {
    jugadoresOcupados.add(p.jugadorAId)
    jugadoresOcupados.add(p.jugadorBId)
  }
  if (jugadoresOcupados.has(partido.jugadorAId) || jugadoresOcupados.has(partido.jugadorBId)) {
    return { valido: false, motivo: 'Uno de los jugadores ya tiene otro partido en ese horario' }
  }

  if (partido.arbitroId) {
    if (partido.arbitroId === partido.jugadorAId || partido.arbitroId === partido.jugadorBId) {
      return { valido: false, motivo: 'El árbitro no puede ser uno de los jugadores del partido' }
    }
    if (jugadoresOcupados.has(partido.arbitroId)) {
      return { valido: false, motivo: 'El árbitro asignado tiene su propio partido en ese horario' }
    }
    const arbitrosOcupados = new Set(enMismoBloque.filter(p => p.arbitroId).map(p => p.arbitroId))
    if (arbitrosOcupados.has(partido.arbitroId)) {
      return { valido: false, motivo: 'El árbitro asignado ya está arbitrando otro partido en ese horario' }
    }
  }

  return { valido: true }
}
