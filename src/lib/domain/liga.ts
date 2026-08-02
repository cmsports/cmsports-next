import { generarRoundRobin } from './torneos'

export interface PartidoFixtureLiga {
  jugadorA: string
  jugadorB: string
  orden: number
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

// Normaliza un string de bloque horario al formato HH:MM, independiente de si
// viene de la BD ("09:00:00") o del scheduler ("09:00").
export function normalizarBloque(s: string | null | undefined): string | null {
  if (!s) return null
  return s.length >= 5 ? s.substring(0, 5) : s
}

// ─── Motor de eficiencia operacional (single-mesa por división) ───────────────
//
// Principio rector: eficiencia > equilibrio. Minimizar la permanencia total
// de cada jugador en el recinto (= último bloque activo − primer bloque activo).
//
// REGLA DURA GARANTIZADA: ningún jugador espera más de HUECO_MAX partidos
// entre dos apariciones suyas dentro de la misma fecha. No es una preferencia
// ni el resultado de una heurística — es una restricción verificada.
//
// Cómo se garantiza: el reparto de partidos por fecha no es solo un greedy
// balanceado; cada partido entra a una fecha únicamente si el conjunto
// resultante SIGUE teniendo un orden válido, comprobado con un solver exacto
// (resolverOrdenFecha). Si ninguna fecha lo admite, el partido queda sin
// asignar y cae en el reajuste manual — que es exactamente para lo que existe
// la fecha de ajuste.
//
// Por qué hizo falta: el enfoque anterior repartía por fecha con un greedy
// ciego y después intentaba ordenar con búsqueda local. Pero el greedy podía
// armar conjuntos para los que NO EXISTE ningún orden válido (verificado con
// datos reales: un conjunto de 15 partidos donde el solver exacto demuestra
// en 420 nodos que no hay solución). Ninguna cantidad de búsqueda arregla un
// conjunto imposible — hay que evitar formarlo.
//
// Árbitros (fase aparte, asignarArbitrosEficiente): por ventana de actividad —
// para el partido del bloque t se elige el candidato cuya ventana
// [primera_actividad, última_actividad] ya contenga t (delta permanencia = 0),
// o el que menos la extienda.

// Máximo de partidos que un jugador puede esperar entre dos apariciones suyas
// dentro de una misma fecha. 1 = a lo más se pierde un partido de por medio
// (30 min con bloques de media hora).
const HUECO_MAX = 1

/**
 * Solver exacto del orden de UNA fecha. Devuelve una secuencia donde ningún
 * jugador espera más de `huecoMax` partidos entre dos apariciones suyas, o
 * `null` si tal secuencia no existe para ese conjunto de partidos.
 *
 * Es una búsqueda en profundidad con una poda muy fuerte: si un jugador jugó
 * en la posición L y le quedan partidos, su próxima aparición tiene que caer
 * en L+1 … L+huecoMax+1. Entonces al elegir el partido de la posición t, todo
 * jugador cuya última aparición fue exactamente t−(huecoMax+1) está OBLIGADO
 * a jugar ahora. Si hay más de dos obligados, o si los dos obligados no tienen
 * un partido pendiente entre ellos, la rama es imposible y se corta de una.
 *
 * Esa poda deja el árbol de búsqueda diminuto: en los tamaños reales (hasta
 * ~16 partidos por fecha, que es la capacidad de una mesa en un día) responde
 * en milisegundos, incluso para demostrar que NO hay solución.
 *
 * `presupuestoNodos` es un cinturón de seguridad para configuraciones
 * patológicas (bloques muy cortos → fechas enormes): si se agota, devuelve
 * null. Un null siempre se interpreta como "esta fecha no admite el partido",
 * nunca como "programalo igual" — así el horario emitido jamás viola la regla.
 */
function resolverOrdenFecha(
  partidos: PartidoAProgramar[],
  huecoMax = HUECO_MAX,
  presupuestoNodos = 300_000,
): PartidoAProgramar[] | null {
  const n = partidos.length
  if (n <= 1) return [...partidos]

  const usado = new Array<boolean>(n).fill(false)
  const ultimaAparicion = new Map<string, number>()
  const pendientes = new Map<string, number>()
  for (const p of partidos) {
    pendientes.set(p.jugadorAId, (pendientes.get(p.jugadorAId) ?? 0) + 1)
    pendientes.set(p.jugadorBId, (pendientes.get(p.jugadorBId) ?? 0) + 1)
  }

  const secuencia: number[] = []
  let nodos = 0

  const comparte = (x: PartidoAProgramar, y: PartidoAProgramar) =>
    x.jugadorAId === y.jugadorAId || x.jugadorAId === y.jugadorBId ||
    x.jugadorBId === y.jugadorAId || x.jugadorBId === y.jugadorBId

  function dfs(t: number): boolean {
    if (t === n) return true
    if (++nodos > presupuestoNodos) return false

    const obligados: string[] = []
    for (const [j, ultima] of ultimaAparicion) {
      if ((pendientes.get(j) ?? 0) > 0 && ultima === t - (huecoMax + 1)) obligados.push(j)
    }
    if (obligados.length > 2) return false

    const candidatos: number[] = []
    for (let i = 0; i < n; i++) {
      if (usado[i]) continue
      const p = partidos[i]
      if (obligados.length === 2) {
        const cubre =
          (p.jugadorAId === obligados[0] && p.jugadorBId === obligados[1]) ||
          (p.jugadorAId === obligados[1] && p.jugadorBId === obligados[0])
        if (!cubre) continue
      } else if (obligados.length === 1) {
        if (p.jugadorAId !== obligados[0] && p.jugadorBId !== obligados[0]) continue
      }
      candidatos.push(i)
    }
    if (candidatos.length === 0) return false

    // Orden de exploración: primero los que encadenan con el partido anterior
    // (el jugador sigue en la mesa, hueco 0), después los de jugadores con más
    // partidos pendientes (los más difíciles de acomodar más tarde).
    const anterior = t > 0 ? partidos[secuencia[t - 1]] : null
    const pendientesDe = (i: number) =>
      (pendientes.get(partidos[i].jugadorAId) ?? 0) + (pendientes.get(partidos[i].jugadorBId) ?? 0)
    candidatos.sort((x, y) => {
      if (anterior) {
        const dif = (comparte(partidos[y], anterior) ? 1 : 0) - (comparte(partidos[x], anterior) ? 1 : 0)
        if (dif !== 0) return dif
      }
      return pendientesDe(y) - pendientesDe(x)
    })

    for (const i of candidatos) {
      const p = partidos[i]
      const previaA = ultimaAparicion.get(p.jugadorAId)
      const previaB = ultimaAparicion.get(p.jugadorBId)

      usado[i] = true
      secuencia.push(i)
      ultimaAparicion.set(p.jugadorAId, t)
      ultimaAparicion.set(p.jugadorBId, t)
      pendientes.set(p.jugadorAId, pendientes.get(p.jugadorAId)! - 1)
      pendientes.set(p.jugadorBId, pendientes.get(p.jugadorBId)! - 1)

      if (dfs(t + 1)) return true

      usado[i] = false
      secuencia.pop()
      if (previaA === undefined) ultimaAparicion.delete(p.jugadorAId)
      else ultimaAparicion.set(p.jugadorAId, previaA)
      if (previaB === undefined) ultimaAparicion.delete(p.jugadorBId)
      else ultimaAparicion.set(p.jugadorBId, previaB)
      pendientes.set(p.jugadorAId, pendientes.get(p.jugadorAId)! + 1)
      pendientes.set(p.jugadorBId, pendientes.get(p.jugadorBId)! + 1)
    }
    return false
  }

  return dfs(0) ? secuencia.map(i => partidos[i]) : null
}

// Tope de partidos que un jugador juega en una misma fecha. Más que esto
// alarga su permanencia aunque el hueco entre partidos siga siendo chico.
const MAX_PARTIDOS_POR_JUGADOR_POR_FECHA = 3

function partidosDeJugadorEnFecha(fecha: PartidoAProgramar[], jugadorId: string): number {
  let n = 0
  for (const p of fecha) if (p.jugadorAId === jugadorId || p.jugadorBId === jugadorId) n++
  return n
}

/**
 * ¿Puede esta fecha recibir el partido? Devuelve el orden completo ya
 * verificado si sí, o null si no (por cupo de mesa, por tope del jugador, o
 * porque el conjunto resultante no admitiría ningún orden válido).
 */
function admiteEnFecha(
  fecha: PartidoAProgramar[],
  p: PartidoAProgramar,
  capacidad: number,
): PartidoAProgramar[] | null {
  if (fecha.length >= capacidad) return null
  if (partidosDeJugadorEnFecha(fecha, p.jugadorAId) >= MAX_PARTIDOS_POR_JUGADOR_POR_FECHA) return null
  if (partidosDeJugadorEnFecha(fecha, p.jugadorBId) >= MAX_PARTIDOS_POR_JUGADOR_POR_FECHA) return null
  return resolverOrdenFecha([...fecha, p])
}

/**
 * Programa una división completa en su mesa asignada.
 *
 * Objetivo: programar TODOS los partidos. La fecha de ajuste existe para que
 * el admin patee partidos a mano cuando pasa algo, no para que el algoritmo
 * deje afuera lo que no supo acomodar. `sinAsignar` sólo debería salir con
 * algo cuando no alcanzan físicamente los bloques (fechas × bloques por
 * fecha < partidos), y eso es un problema de configuración que hay que
 * avisarle al admin.
 *
 * Dos fases:
 *   1. Colocación: cada partido va a la primera fecha (ordenadas por menos
 *      carga de ambos jugadores, y a igualdad la menos llena) que lo admita
 *      manteniendo un orden válido.
 *   2. Reparación por desalojo: para lo que quedó afuera, se busca una fecha
 *      f y un partido q suyo tal que f admita el nuevo sin q, y q encuentre
 *      lugar en otra fecha g. Rescata los casos que la fase 1, que nunca
 *      deshace lo ya decidido, no puede resolver sola.
 *
 * Todo partido en `programados` cumple la regla de hueco máximo: no se emite
 * un horario que la viole.
 */
export function programarDivision(
  partidos: PartidoAProgramar[],
  jugadorIds: string[],
  numFechas: number,
  bloques: string[],
  mesaNumero: number,
): { programados: PartidoProgramado[]; sinAsignar: PartidoAProgramar[] } {
  if (partidos.length === 0) return { programados: [], sinAsignar: [] }

  const capacidad = bloques.length
  const porFecha: PartidoAProgramar[][] = Array.from({ length: numFechas }, () => [])
  // Orden ya verificado de cada fecha — se reusa tal cual al emitir, para que
  // el horario final sea exactamente el que el solver validó.
  const ordenDeFecha: PartidoAProgramar[][] = Array.from({ length: numFechas }, () => [])
  const pendientes: PartidoAProgramar[] = []

  // ── Fase 1: colocación ──────────────────────────────────────────────────
  for (const p of partidos) {
    const candidatas: Array<{ fecha: number; carga: number; ocupacion: number }> = []
    for (let f = 0; f < numFechas; f++) {
      candidatas.push({
        fecha: f,
        carga: partidosDeJugadorEnFecha(porFecha[f], p.jugadorAId) + partidosDeJugadorEnFecha(porFecha[f], p.jugadorBId),
        ocupacion: porFecha[f].length,
      })
    }
    // Primero donde ambos jugadores estén menos cargados; a igual carga, la
    // fecha menos llena — repartir parejo deja más margen para los últimos
    // partidos, que son los difíciles de acomodar.
    candidatas.sort((x, y) => x.carga - y.carga || x.ocupacion - y.ocupacion)

    let colocado = false
    for (const { fecha } of candidatas) {
      const orden = admiteEnFecha(porFecha[fecha], p, capacidad)
      if (!orden) continue
      porFecha[fecha] = [...porFecha[fecha], p]
      ordenDeFecha[fecha] = orden
      colocado = true
      break
    }
    if (!colocado) pendientes.push(p)
  }

  // ── Fase 2: reparación por desalojo ─────────────────────────────────────
  // Un desalojo mueve q de f a g, así que necesita al menos una fecha con
  // hueco libre. Si no queda ninguna, el problema es de capacidad (no entran
  // los partidos en los bloques disponibles) y ninguna reordenación lo
  // arregla — no vale la pena ni intentarlo.
  const hayEspacioLibre = () => porFecha.some(f => f.length < capacidad)

  const sinAsignar: PartidoAProgramar[] = []
  for (const p of pendientes) {
    let resuelto = false
    if (hayEspacioLibre()) {
      for (let f = 0; f < numFechas && !resuelto; f++) {
        for (const q of porFecha[f]) {
          const fechaSinQ = porFecha[f].filter(x => x.id !== q.id)
          const ordenF = admiteEnFecha(fechaSinQ, p, capacidad)
          if (!ordenF) continue
          // p entra en f si sacamos q; ahora hay que reubicar q en otra fecha.
          for (let g = 0; g < numFechas; g++) {
            if (g === f || porFecha[g].length >= capacidad) continue
            const ordenG = admiteEnFecha(porFecha[g], q, capacidad)
            if (!ordenG) continue
            porFecha[f] = [...fechaSinQ, p]
            ordenDeFecha[f] = ordenF
            porFecha[g] = [...porFecha[g], q]
            ordenDeFecha[g] = ordenG
            resuelto = true
            break
          }
          if (resuelto) break
        }
      }
    }
    if (!resuelto) sinAsignar.push(p)
  }

  const programados: PartidoProgramado[] = []
  ordenDeFecha.forEach((ordenados, i) => {
    for (let b = 0; b < ordenados.length; b++) {
      programados.push({
        ...ordenados[b],
        fechaNumero: i + 1,
        mesaNumero,
        bloqueHorario: bloques[b],
        arbitroId: null,
      })
    }
  })

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

    // Último bloque en que jugó (antes de hastaIdx), o -1 si no jugó todavía.
    // Sirve para el fallback: entre quienes ya no tienen más partidos, hay que
    // preferir a quien jugó hace menos rato, no a cualquiera al azar — a quien
    // ya se fue hace horas no se lo hace volver solo porque nunca arbitró.
    const ultimoBloqueJugado = (j: string, hastaIdx: number) => {
      const anteriores = (bloquesJugador.get(j) ?? []).filter(bi => bi < hastaIdx)
      return anteriores.length > 0 ? Math.max(...anteriores) : -1
    }

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
        if (conPendientes.length > 0) {
          arbitro = menosArbitrado(conPendientes)
        } else if (disponibles.length > 0) {
          // Nadie tiene partidos pendientes: preferir a quien jugó hace menos
          // rato, no a cualquiera. Sin esto alguien que ya terminó y se iba a
          // ir hace horas queda arbitrando el último partido del día.
          const ultimoJugado = new Map(disponibles.map(j => [j, ultimoBloqueJugado(j, i)]))
          const maxUltimo = Math.max(...ultimoJugado.values())
          const masRecientes = disponibles.filter(j => ultimoJugado.get(j) === maxUltimo)
          arbitro = menosArbitrado(masRecientes)
        }
      }

      if (arbitro) vecesArb.set(arbitro, (vecesArb.get(arbitro) ?? 0) + 1)
      resultado.push({ ...partido, arbitroId: arbitro })
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
