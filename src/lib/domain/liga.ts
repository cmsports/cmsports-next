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

// ─── Resultados Bo5 ────────────────────────────────────────────────────────
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

// ─── Ranking por división ──────────────────────────────────────────────────
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

  // Fase 1: orden primario por estadísticas agregadas.
  // Criterios transitivos — nunca producen ciclos, sort es estable.
  filas.sort((a, b) => {
    if (b.pts !== a.pts) return b.pts - a.pts
    if (b.pg !== a.pg) return b.pg - a.pg
    if (b.ds !== a.ds) return b.ds - a.ds
    return b.sf - a.sf
  })

  // Fase 2: para cada grupo de jugadores con estadísticas idénticas, aplicar
  // desempate por enfrentamiento directo mediante mini-ranking dentro del grupo.
  // Usar sort-comparator con find() aquí sería no-transitivo para ciclos
  // (A > B > C > A), produciendo orden indefinido en JS. El mini-ranking calcula
  // puntos/DS/SF solo entre los empatados: en un ciclo perfecto quedan iguales
  // y el orden del Fase 1 se preserva (estable y reproducible).
  const claveOrden = (f: FilaRanking) => `${f.pts}|${f.pg}|${f.ds}|${f.sf}`
  let i = 0
  while (i < filas.length) {
    let j = i + 1
    while (j < filas.length && claveOrden(filas[j]) === claveOrden(filas[i])) j++

    if (j - i > 1) {
      const grupo = filas.slice(i, j)
      const grupoIds = new Set(grupo.map(f => f.jugadorId))
      const partidosGrupo = partidos.filter(
        p => grupoIds.has(p.jugadorAId) && grupoIds.has(p.jugadorBId),
      )

      if (partidosGrupo.length > 0) {
        const mini = new Map<string, { pts: number; ds: number; sf: number }>()
        for (const id of grupoIds) mini.set(id, { pts: 0, ds: 0, sf: 0 })

        for (const p of partidosGrupo) {
          const mg = mini.get(p.ganadorId)
          const perdedorId = p.ganadorId === p.jugadorAId ? p.jugadorBId : p.jugadorAId
          const mp = mini.get(perdedorId)
          if (!mg || !mp) continue
          mg.pts += 3
          mp.pts += p.esWalkover ? 0 : 1
          if (!p.esWalkover && p.setsA !== null && p.setsB !== null) {
            const sG = p.ganadorId === p.jugadorAId ? p.setsA : p.setsB
            const sP = p.ganadorId === p.jugadorAId ? p.setsB : p.setsA
            mg.sf += sG; mg.ds += sG - sP
            mp.sf += sP; mp.ds += sP - sG
          }
        }

        grupo.sort((a, b) => {
          const ma = mini.get(a.jugadorId)!
          const mb = mini.get(b.jugadorId)!
          if (mb.pts !== ma.pts) return mb.pts - ma.pts
          if (mb.ds !== ma.ds) return mb.ds - ma.ds
          return mb.sf - ma.sf
        })
        for (let k = 0; k < grupo.length; k++) filas[i + k] = grupo[k]
      }
    }

    i = j
  }

  return filas
}

// ─── Motor de programación ─────────────────────────────────────────────────
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

// ─── Motor de eficiencia operacional (single-mesa por división) ───────────────
//
// Principio rector: eficiencia > equilibrio. Minimizar la permanencia total
// de cada jugador en el recinto (= último bloque activo − primer bloque activo).
//
// Algoritmo en tres fases:
//   1. Circle method: genera n-1 rondas donde cada jugador aparece exactamente
//      una vez. Garantiza que partidos consecutivos de rondas adyacentes
//      comparten jugador → base natural para encadenar.
//   2. Greedy de cadena dentro de cada fecha: re-ordena el slice de partidos
//      de la fecha priorizando continuidad (partido siguiente comparte jugador
//      con el anterior). Desempate: jugador con más partidos pendientes entra
//      primero y se va antes.
//   3. Árbitros por ventana de actividad: para el partido del bloque t se
//      elige el candidato cuya ventana [primera_actividad, última_actividad]
//      ya contenga t (delta permanencia = 0), o el que menos la extienda.

// Circle method (Berge): devuelve n-1 rondas de pares de índices.
// Para n par: cada ronda tiene n/2 partidos; para n impar: (n-1)/2.
function circleMethodRounds(n: number): Array<Array<[number, number]>> {
  const m = n % 2 === 0 ? n : n + 1
  const arr = Array.from({ length: m }, (_, i) => i)
  const rounds: Array<Array<[number, number]>> = []
  for (let r = 0; r < m - 1; r++) {
    const ronda: Array<[number, number]> = []
    for (let k = 0; k < m / 2; k++) {
      const a = arr[k], b = arr[m - 1 - k]
      if (a < n && b < n) ronda.push([a, b])
    }
    rounds.push(ronda)
    // Rotar: mantener arr[0] fijo, rotar arr[1..m-1] a la derecha
    const last = arr[m - 1]
    for (let i = m - 1; i > 1; i--) arr[i] = arr[i - 1]
    arr[1] = last
  }
  return rounds
}

// Greedy de cadena: ordena los partidos de una fecha para minimizar permanencia.
// Prioridades:
//   1. Cadena directa (comparte jugador con el anterior)
//   2. Cadena rota → elegir el candidato que cierre la mayor cantidad de ventanas abiertas
//      (menos jugadores quedarán esperando sin partido)
//   3. Desempate: mayor peso = jugadores con más partidos pendientes (posibilidad de cadena larga)
function ordenarPorCadena(matchesFecha: PartidoAProgramar[]): PartidoAProgramar[] {
  if (matchesFecha.length === 0) return []
  const pendientes = [...matchesFecha]
  const secuencia: PartidoAProgramar[] = []
  const ventanaAbierta = new Set<string>()

  const contarPendientes = () => {
    const m = new Map<string, number>()
    for (const p of pendientes) {
      m.set(p.jugadorAId, (m.get(p.jugadorAId) ?? 0) + 1)
      m.set(p.jugadorBId, (m.get(p.jugadorBId) ?? 0) + 1)
    }
    return m
  }

  while (pendientes.length > 0) {
    const pxj = contarPendientes()
    const peso = (p: PartidoAProgramar) => (pxj.get(p.jugadorAId) ?? 0) + (pxj.get(p.jugadorBId) ?? 0)

    let candidatos = pendientes
    let usarCostoCierre = false

    if (secuencia.length > 0) {
      const ult = secuencia[secuencia.length - 1]
      const jugUlt = new Set([ult.jugadorAId, ult.jugadorBId])
      const cadena = pendientes.filter(p => jugUlt.has(p.jugadorAId) || jugUlt.has(p.jugadorBId))
      if (cadena.length > 0) {
        candidatos = cadena
      } else {
        // Cadena rota: usar costo de cierre para elegir el mejor reinicio
        usarCostoCierre = true
        const urgentes = pendientes.filter(
          p => ventanaAbierta.has(p.jugadorAId) || ventanaAbierta.has(p.jugadorBId),
        )
        if (urgentes.length > 0) candidatos = urgentes
      }
    }

    let mejor = candidatos[0]
    let mejorPeso = peso(mejor)
    // Cuando la cadena se rompe, minimizar cuántas ventanas quedan abiertas tras elegir este partido
    // (un jugador con ventana abierta que NO está en el partido elegido espera un bloque más)
    let mejorCosto = usarCostoCierre
      ? [...ventanaAbierta].filter(j => j !== mejor.jugadorAId && j !== mejor.jugadorBId).length
      : 0

    for (let i = 1; i < candidatos.length; i++) {
      const c = candidatos[i]
      const pw = peso(c)
      if (usarCostoCierre) {
        const costo = [...ventanaAbierta].filter(j => j !== c.jugadorAId && j !== c.jugadorBId).length
        if (costo < mejorCosto || (costo === mejorCosto && pw > mejorPeso)) {
          mejor = c; mejorPeso = pw; mejorCosto = costo
        }
      } else {
        if (pw > mejorPeso) { mejor = c; mejorPeso = pw }
      }
    }

    secuencia.push(mejor)
    pendientes.splice(pendientes.indexOf(mejor), 1)

    for (const jid of [mejor.jugadorAId, mejor.jugadorBId]) {
      ventanaAbierta.add(jid)
      if (!pendientes.some(p => p.jugadorAId === jid || p.jugadorBId === jid)) {
        ventanaAbierta.delete(jid)
      }
    }
  }

  return secuencia
}

// Programa una división completa en su mesa asignada.
// Estrategia: agrupar rondas completas por fecha para concentrar los partidos de cada
// jugador en la menor cantidad de fechas posible. Aplica `ordenarPorCadena` dentro de
// cada fecha para que los partidos de cada jugador sean consecutivos (sin huecos largos).
// Los partidos que no entran en ninguna fecha van a sinAsignar (ajuste manual).
export function programarDivision(
  partidos: PartidoAProgramar[],
  jugadorIds: string[],
  numFechas: number,
  bloques: string[],
  mesaNumero: number,
): { programados: PartidoProgramado[]; sinAsignar: PartidoAProgramar[] } {
  if (partidos.length === 0) return { programados: [], sinAsignar: [] }

  const porPar = new Map<string, PartidoAProgramar>()
  for (const p of partidos) {
    porPar.set([p.jugadorAId, p.jugadorBId].sort().join('~'), p)
  }

  // Construir lista de rondas según circle method
  const rondas: PartidoAProgramar[][] = []
  const vistos = new Set<string>()
  for (const ronda of circleMethodRounds(jugadorIds.length)) {
    const matchesRonda: PartidoAProgramar[] = []
    for (const [iA, iB] of ronda) {
      const key = [jugadorIds[iA], jugadorIds[iB]].sort().join('~')
      const p = porPar.get(key)
      if (p && !vistos.has(p.id)) { matchesRonda.push(p); vistos.add(p.id) }
    }
    if (matchesRonda.length > 0) rondas.push(matchesRonda)
  }
  // Partidos no cubiertos (jugadores extra sin ronda asignada)
  const extra: PartidoAProgramar[] = []
  for (const p of partidos) {
    if (!vistos.has(p.id)) extra.push(p)
  }
  if (extra.length > 0) rondas.push(extra)

  // Empacar rondas completas en fechas: una ronda entra completa o no entra.
  // Esto garantiza que cada jugador tenga sus partidos concentrados en pocas fechas.
  const capacidad = bloques.length
  const programados: PartidoProgramado[] = []
  const sinAsignar: PartidoAProgramar[] = []

  let f = 0
  let matchesFecha: PartidoAProgramar[] = []

  const cerrarFecha = () => {
    if (matchesFecha.length === 0) return
    const ordenados = ordenarPorCadena(matchesFecha)
    for (let b = 0; b < ordenados.length; b++) {
      programados.push({
        ...ordenados[b],
        fechaNumero: f + 1,
        mesaNumero,
        bloqueHorario: bloques[b],
        arbitroId: null,
      })
    }
    f++
    matchesFecha = []
  }

  for (const ronda of rondas) {
    if (f >= numFechas) {
      // Sin fechas disponibles: esta ronda queda sin programar
      sinAsignar.push(...ronda)
      continue
    }

    if (matchesFecha.length + ronda.length <= capacidad) {
      // La ronda entra completa en la fecha actual
      matchesFecha.push(...ronda)
    } else {
      // No entra: cerrar fecha actual (si tiene partidos) y abrir una nueva
      cerrarFecha()
      if (f >= numFechas) {
        sinAsignar.push(...ronda)
      } else if (ronda.length <= capacidad) {
        matchesFecha.push(...ronda)
      } else {
        // Ronda más grande que la capacidad: programar lo que quepa, resto a sinAsignar
        matchesFecha.push(...ronda.slice(0, capacidad))
        sinAsignar.push(...ronda.slice(capacidad))
      }
    }
  }
  // Cerrar la última fecha si tiene partidos
  if (matchesFecha.length > 0 && f < numFechas) cerrarFecha()
  else sinAsignar.push(...matchesFecha)

  return { programados, sinAsignar }
}

// Asigna árbitros con regla de adyacencia estricta:
// - Prioridad 1: jugador del partido anterior (bloque i-1) que no juega en el actual
//   → ya terminó su partido, sigue en la mesa de todas formas
// - Prioridad 2: jugador del partido siguiente (bloque i+1) que no juega en el actual
//   → está por jugar y ya está llegando al salón
// - Fallback: cualquier jugador de la división con menos veces arbitrado
//   (solo si no hay nadie adyacente disponible)
// Desempate dentro de cada prioridad: menor cantidad de veces que ha arbitrado.
export function asignarArbitrosEficiente(
  programados: PartidoProgramado[],
  jugadoresPorDivision: Map<string, string[]>,
  bloques: string[],
): PartidoProgramado[] {
  const bIdx = new Map(bloques.map((b, i) => [b, i]))

  const grupos = new Map<string, PartidoProgramado[]>()
  for (const p of programados) {
    const k = `${p.divisionId}::${p.fechaNumero}`
    if (!grupos.has(k)) grupos.set(k, [])
    grupos.get(k)!.push(p)
  }

  const resultado: PartidoProgramado[] = []

  for (const partidos of grupos.values()) {
    const seq = [...partidos].sort(
      (a, b) => (bIdx.get(a.bloqueHorario) ?? 0) - (bIdx.get(b.bloqueHorario) ?? 0),
    )
    const roster = jugadoresPorDivision.get(seq[0].divisionId) ?? []
    const vecesArb = new Map<string, number>()

    // Índices de bloque donde cada jugador JUEGA en esta fecha.
    // Se usa para no asignar árbitro a alguien cuyo último partido ya pasó
    // (lo obligaría a quedarse cuando ya se iba a ir).
    const bloquesJugador = new Map<string, number[]>()
    for (let pi = 0; pi < seq.length; pi++) {
      for (const j of [seq[pi].jugadorAId, seq[pi].jugadorBId]) {
        if (!bloquesJugador.has(j)) bloquesJugador.set(j, [])
        bloquesJugador.get(j)!.push(pi)
      }
    }
    const tienePartidoMasTarde = (j: string, desdeIdx: number) =>
      (bloquesJugador.get(j) ?? []).some(bi => bi > desdeIdx)

    const menosArbitrado = (candidatos: string[]) =>
      candidatos.reduce((best, c) =>
        (vecesArb.get(c) ?? 0) < (vecesArb.get(best) ?? 0) ? c : best,
      )

    for (let i = 0; i < seq.length; i++) {
      const partido = seq[i]
      const jugando = new Set([partido.jugadorAId, partido.jugadorBId])

      // Bloque anterior: solo incluir si AÚN TIENEN partidos después del bloque
      // actual → siguen en el salón de todas formas, no hay costo de permanencia.
      // Si su último partido fue el bloque anterior, están a punto de irse;
      // obligarlos a arbitrar extiende su permanencia innecesariamente.
      const delAnterior = i > 0
        ? [seq[i - 1].jugadorAId, seq[i - 1].jugadorBId].filter(
            j => !jugando.has(j) && tienePartidoMasTarde(j, i),
          )
        : []

      // Bloque siguiente: van a llegar para jugar, estarán presentes de todas formas.
      const delSiguiente = i < seq.length - 1
        ? [seq[i + 1].jugadorAId, seq[i + 1].jugadorBId].filter(j => !jugando.has(j))
        : []

      const adyacentes = [...new Set([...delAnterior, ...delSiguiente])]

      let arbitro: string | null = null
      if (adyacentes.length > 0) {
        arbitro = menosArbitrado(adyacentes)
      } else {
        // Fallback: cualquier jugador de la división que no esté jugando,
        // priorizando a quienes aún tienen partidos pendientes (ya van a estar ahí).
        const disponibles = roster.filter(j => !jugando.has(j))
        const conPendientes = disponibles.filter(j => tienePartidoMasTarde(j, i - 1))
        const candidatos = conPendientes.length > 0 ? conPendientes : disponibles
        if (candidatos.length > 0) arbitro = menosArbitrado(candidatos)
      }

      if (arbitro) vecesArb.set(arbitro, (vecesArb.get(arbitro) ?? 0) + 1)
      resultado.push({ ...partido, arbitroId: arbitro })
    }
  }

  return resultado
}

// Simulación para verificar el algoritmo. Devuelve métricas por fecha.
// Uso: simularProgramacion(12) en la consola de Node o en un test.
export function simularProgramacion(numJugadores: number = 12): void {
  const jugadores = Array.from({ length: numJugadores }, (_, i) => `J${String(i).padStart(2, '0')}`)
  const fixtures = generarFixtureDivision(jugadores)
  const partidos: PartidoAProgramar[] = fixtures.map((f, i) => ({
    id: `p${i}`,
    divisionId: 'div1',
    jugadorAId: f.jugadorA,
    jugadorBId: f.jugadorB,
    ordenFixture: f.orden,
  }))
  const bloques = generarBloquesHorario()
  const { programados, sinAsignar } = programarDivision(partidos, jugadores, 5, bloques, 1)
  const jugPorDiv = new Map([['div1', jugadores]])
  const conArbs = asignarArbitrosEficiente(programados, jugPorDiv, bloques)

  const bIdx = new Map(bloques.map((b, i) => [b, i]))
  const porFecha = new Map<number, PartidoProgramado[]>()
  for (const p of conArbs) {
    if (!porFecha.has(p.fechaNumero)) porFecha.set(p.fechaNumero, [])
    porFecha.get(p.fechaNumero)!.push(p)
  }

  console.log(`\n=== Simulación ${numJugadores} jugadores · ${partidos.length} partidos ===\n`)

  let totalConflictos = 0
  for (const [f, ps] of [...porFecha.entries()].sort((a, b) => a[0] - b[0])) {
    const primera = new Map<string, number>()
    const ultima = new Map<string, number>()
    for (const p of ps) {
      const bi = bIdx.get(p.bloqueHorario) ?? 0
      for (const jid of [p.jugadorAId, p.jugadorBId]) {
        if (primera.get(jid) === undefined || bi < primera.get(jid)!) primera.set(jid, bi)
        if (ultima.get(jid) === undefined || bi > ultima.get(jid)!) ultima.set(jid, bi)
      }
    }
    const perms = [...primera.keys()].map(j => (ultima.get(j) ?? 0) - (primera.get(j) ?? 0))
    const avg = perms.length ? (perms.reduce((a, b) => a + b, 0) / perms.length).toFixed(1) : '—'
    const max = perms.length ? Math.max(...perms) : 0
    const conflictos = ps.filter(p => p.arbitroId && (p.arbitroId === p.jugadorAId || p.arbitroId === p.jugadorBId)).length
    const sinArb = ps.filter(p => !p.arbitroId).length
    totalConflictos += conflictos
    console.log(`  Fecha ${f}: ${ps.length} partidos | permanencia avg=${avg} max=${max} bloques | conflictos HC-04=${conflictos} | sin árbitro=${sinArb}`)
  }
  console.log(`\n  Sin programar: ${sinAsignar.length} | Conflictos totales: ${totalConflictos}`)
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

// ─── Validación de movimientos manuales / Drag & Drop ──────────────────────

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
