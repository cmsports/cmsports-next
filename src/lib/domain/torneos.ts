import { CONFIG, FaseOrden } from '../config'

export interface JugadorTorneo {
  id: string
  nombre: string
  // Clave de club normalizada, solo para torneos externos. 'HOST' para
  // jugadores del club anfitrión, texto libre normalizado para externos,
  // null/undefined si no hay club informado (sin restricción para ese jugador).
  club?: string | null
}

export interface GrupoStats {
  jugadorId: string
  jugador: JugadorTorneo
  pts: number
  pg: number
  pp: number
  /** Sets ganados. Los partidos anteriores a la migración 216 no tienen
   *  marcador y suman 0: cuentan para `pg`/`pp` pero no para el ratio. */
  sf: number
  /** Sets perdidos. Ver nota de `sf`. */
  sc: number
  /** Puntos ganados (suma de los parciales). 0 sin parciales cargados. */
  pf: number
  /** Puntos cedidos. Ver nota de `pf`. */
  pc: number
}

/** Ratio de sets o de puntos sin dividir por cero: el que no cedió ninguno va
 *  primero, salvo que tampoco haya ganado (partido sin marcador cargado). */
export function ratioMerito(favor: number, contra: number): number {
  if (contra === 0) return favor > 0 ? Number.POSITIVE_INFINITY : 0
  return favor / contra
}

export interface PartidoGenerado {
  jugadorA: string
  jugadorB: string | null
  ganador?: string | null
  fase: string
  grupoId?: string
  orden: number
}

export interface SeedResult {
  grupoIndex: number
  jugadorId: string
}

export function derivarPodioFinal(final: {
  jugador_a: string | null
  jugador_b: string | null
  ganador: string | null
}): { campeonId: string; subcampeonId: string } | null {
  const { jugador_a: jugadorA, jugador_b: jugadorB, ganador } = final
  if (!jugadorA || !jugadorB || !ganador) return null
  if (ganador !== jugadorA && ganador !== jugadorB) return null
  return {
    campeonId: ganador,
    subcampeonId: ganador === jugadorA ? jugadorB : jugadorA,
  }
}

// ─── Grupos ────────────────────────────────────────────────────────────────

/**
 * Cuántos grupos hacer con `numJugadores`.
 *
 * Prioridad dura: grupos de 3. El sobrante nunca engorda un grupo a 4; forma
 * sus propios grupos de 2. `numGrupos = ceil(N / 3)` hace exactamente eso: al
 * repartir N jugadores parejo en `ceil(N/3)` grupos, el resto de la división
 * cae en grupos de 2, no de 4 (8 jugadores → 3 grupos de 3,3,2; 7 → 3,2,2;
 * 4 → 2,2). Groups de 4 solo reaparecen si `CONFIG.TORNEO_MAX_GRUPOS` obliga
 * a recortar el número de grupos (torneos de ~97+ jugadores).
 *
 * Antes se elegía el reparto que dejaba menos BYEs en el cuadro de playoffs,
 * aunque eso significara puros grupos de 4 en vez de 3 (ej. 32 jugadores
 * armaba 8 grupos de 4 con 0 BYEs, en vez de grupos de 3). Eso quedó
 * descartado: grupos de 3 es la prioridad, los BYEs del cuadro son un
 * problema aparte que resuelve la ronda de avance (`CONFIG.FASES_ORDEN` ya la
 * tiene reservada y nunca se generó) para que los sobrantes jueguen por
 * entrar en vez de recibir un BYE.
 */
export function calcularNumGrupos(
  numJugadores: number,
  jugadoresPorGrupo: number = CONFIG.TORNEO_JUGADORES_POR_GRUPO,
): number {
  const tamMin = Math.max(2, jugadoresPorGrupo)
  const grupos = Math.ceil(numJugadores / tamMin)
  return Math.max(2, Math.min(grupos, CONFIG.TORNEO_MAX_GRUPOS))
}

// Los tardíos forman grupos independientes de hasta cuatro jugadores.
// Tres tardíos deben quedar juntos, no divididos en grupos de 2 y 1.
export function calcularNumGruposTardios(total: number): number {
  if (total <= 0) return 0
  return Math.ceil(total / 4)
}

export function nombreGrupo(indice: number): string {
  let numero = indice + 1
  let nombre = ''
  while (numero > 0) {
    numero--
    nombre = String.fromCharCode(65 + (numero % 26)) + nombre
    numero = Math.floor(numero / 26)
  }
  return nombre
}

export function seedingSerpenteo(
  jugadores: JugadorTorneo[],
  numGrupos: number,
  cabezasDeSerie: readonly string[] | ReadonlySet<string> = [],
): SeedResult[] {
  // Una lista conserva el número/prioridad explícita de las cabezas. Se acepta
  // Set para mantener compatibilidad con llamadas antiguas.
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const idsCabeza = 'has' in cabezasDeSerie
    ? jugadores.filter(j => cabezasDeSerie.has(j.id)).map(j => j.id)
    : [...cabezasDeSerie]
  const idsUnicos = [...new Set(idsCabeza)]
  const cabezas = idsUnicos.map(id => porId.get(id)).filter((j): j is JugadorTorneo => !!j)
  const cabezasSet = new Set(cabezas.map(j => j.id))
  const resto = jugadores.filter(j => !cabezasSet.has(j.id))
  const ordenados = [...cabezas, ...resto]

  const asignaciones: SeedResult[] = []
  let dir = 1
  let gi = 0

  for (let i = 0; i < ordenados.length; i++) {
    asignaciones.push({ grupoIndex: gi, jugadorId: ordenados[i].id })
    if (i < ordenados.length - 1) {
      gi += dir
      if (gi >= numGrupos) { gi = numGrupos - 1; dir = -1 }
      else if (gi < 0) { gi = 0; dir = 1 }
    }
  }

  return asignaciones
}

// Variante de seedingSerpenteo para torneos externos: además de separar a
// las cabezas de serie (una por grupo, igual que la serpentina normal),
// evita que dos jugadores del mismo club real queden en el mismo grupo.
// Es una regla BLANDA: si un club trae más jugadores que grupos existen, el
// choque es matemáticamente inevitable y el algoritmo lo permite en vez de
// bloquear el armado — simplemente reparte por menor carga en ese caso.
export function seedingSerpenteoConClubes(
  jugadores: JugadorTorneo[],
  numGrupos: number,
  cabezasDeSerie: readonly string[] | ReadonlySet<string> = [],
): SeedResult[] {
  const porId = new Map(jugadores.map(j => [j.id, j]))
  const idsCabeza = 'has' in cabezasDeSerie
    ? jugadores.filter(j => cabezasDeSerie.has(j.id)).map(j => j.id)
    : [...cabezasDeSerie]
  const idsUnicos = [...new Set(idsCabeza)]
  const cabezas = idsUnicos.map(id => porId.get(id)).filter((j): j is JugadorTorneo => !!j)
  const cabezasSet = new Set(cabezas.map(j => j.id))
  const resto = jugadores.filter(j => !cabezasSet.has(j.id))

  const size = new Array(numGrupos).fill(0)
  const clubesPorGrupo: Array<Set<string>> = Array.from({ length: numGrupos }, () => new Set())
  const asignaciones: SeedResult[] = []

  // Cabezas: una por grupo en orden, igual que la serpentina normal (ya
  // validado en el caller que cabezas.length <= numGrupos).
  cabezas.forEach((j, i) => {
    asignaciones.push({ grupoIndex: i, jugadorId: j.id })
    size[i]++
    if (j.club) clubesPorGrupo[i].add(j.club)
  })

  const total = jugadores.length
  const base = Math.floor(total / numGrupos)
  const sobrantes = total % numGrupos
  const maxPorGrupo = new Array(numGrupos).fill(base)
  for (let i = 0; i < sobrantes; i++) maxPorGrupo[i]++

  for (const j of resto) {
    let candidatos = Array.from({ length: numGrupos }, (_, i) => i)
      .filter(gi => size[gi] < maxPorGrupo[gi])
    if (!candidatos.length) {
      candidatos = Array.from({ length: numGrupos }, (_, i) => i)
    }
    if (j.club) {
      const sinChoque = candidatos.filter(gi => !clubesPorGrupo[gi].has(j.club!))
      if (sinChoque.length) candidatos = sinChoque
    }
    candidatos.sort((a, b) => size[a] - size[b] || a - b)
    const gi = candidatos[0]
    asignaciones.push({ grupoIndex: gi, jugadorId: j.id })
    size[gi]++
    if (j.club) clubesPorGrupo[gi].add(j.club)
  }

  return asignaciones
}

export function generarRoundRobin(jugadorIds: string[]): Array<[string, string]> {
  const partidos: Array<[string, string]> = []
  for (let i = 0; i < jugadorIds.length; i++) {
    for (let j = i + 1; j < jugadorIds.length; j++) {
      partidos.push([jugadorIds[i], jugadorIds[j]])
    }
  }
  return partidos
}

// ─── Stats de grupo ────────────────────────────────────────────────────────

/**
 * ¿Se pueden volcar ya los dos cupos de este grupo a la llave?
 *
 * No basta con saber QUIÉNES clasifican: hay que saber también CUÁL es 1° y
 * cuál 2°, porque de eso depende contra quién le toca a cada uno.
 *
 * El sub19 de Buin (2026-08-16) salió con 1° contra 1° y 2° contra 2° en los
 * octavos justamente por esto: en el grupo B, tras dos partidos, Randy y
 * Vicente iban 2 pts cada uno y todavía no se habían enfrentado, mientras el
 * tercero ya estaba eliminado. Con solo la primera condición el grupo se daba
 * por cerrado, y como los dos punteros estaban empatados con su partido directo
 * sin jugar, `calcularStatsGrupo` los desempató por orden de siembra: Randy
 * quedó 1° y Vicente 2°. Esos cupos se escribieron en el cuadro, después
 * Vicente le ganó a Randy y el orden real se dio vuelta — pero la llave ya
 * estaba armada.
 *
 * Devolver `false` frena SOLO los dos cupos de este grupo: los grupos ya
 * cerrados siguen armando su rama y pueden jugarla mientras tanto.
 *
 * @param stats      Tabla del grupo ya ordenada (la que devuelve `calcularStatsGrupo`).
 * @param pendientes Partidos sin jugar que le quedan a cada jugador.
 * @param todosJugados Si el grupo ya jugó todos sus partidos (ahí siempre está decidido).
 */
export function grupoTieneSusDosCuposDecididos(
  stats: { jugadorId: string; pts: number }[],
  pendientes: Map<string, number>,
  todosJugados: boolean,
): boolean {
  if (stats.length < 2) return false
  if (todosJugados) return true

  const restantesDe = (id: string) => pendientes.get(id) ?? 0

  // 1) QUIÉNES pasan: nadie del 3° para abajo puede alcanzar al 2°.
  const pts2 = stats[1].pts
  const alguienPuedeLlegarA2 = stats.slice(2).some(s => s.pts + 2 * restantesDe(s.jugadorId) >= pts2)
  if (alguienPuedeLlegarA2) return false

  // 2) CUÁL es cuál: si a alguno de los dos primeros le quedan partidos y al 2°
  //    le alcanza para igualar o pasar al 1°, el orden todavía puede darse
  //    vuelta. (Empatar basta para dudar: con empate manda el partido directo,
  //    y si ese partido es justamente el que falta, no hay nada decidido.)
  const restantePrimero = restantesDe(stats[0].jugadorId)
  const restanteSegundo = restantesDe(stats[1].jugadorId)
  const puedenCambiarDeOrden = (restantePrimero > 0 || restanteSegundo > 0)
    && stats[1].pts + 2 * restanteSegundo >= stats[0].pts
  return !puedenCambiarDeOrden
}

type PartidoConMarcador = {
  jugadorA: string
  jugadorB: string
  ganador: string | null
  setsA?: number | null
  setsB?: number | null
  puntosA?: number | null
  puntosB?: number | null
}

/**
 * Desempate de tres o más igualados en puntos: se arma una tabla aparte con
 * SOLO los partidos entre ellos y se ordena por victorias → ratio de sets →
 * ratio de puntos. Es la regla del estándar y es la razón por la que hace falta
 * el marcador set a set: a tres con 1-1 cada uno, los sets suelen quedar
 * iguales también y los puntos son lo único que separa.
 *
 * Devuelve la clave comparable de cada uno para poder detectar después si dos
 * quedaron literalmente idénticos (ahí sí decide el juez a mano).
 */
function clavesDesempateSubgrupo(
  empatados: readonly GrupoStats[],
  partidos: readonly PartidoConMarcador[],
): Map<string, string> {
  const ids = new Set(empatados.map(e => e.jugadorId))
  const sub = new Map(empatados.map(e => [e.jugadorId, { pg: 0, sf: 0, sc: 0, pf: 0, pc: 0 }]))
  for (const p of partidos) {
    if (!p.ganador || !ids.has(p.jugadorA) || !ids.has(p.jugadorB)) continue
    sub.get(p.ganador)!.pg += 1
    if (p.setsA != null && p.setsB != null) {
      sub.get(p.jugadorA)!.sf += p.setsA; sub.get(p.jugadorA)!.sc += p.setsB
      sub.get(p.jugadorB)!.sf += p.setsB; sub.get(p.jugadorB)!.sc += p.setsA
    }
    if (p.puntosA != null && p.puntosB != null) {
      sub.get(p.jugadorA)!.pf += p.puntosA; sub.get(p.jugadorA)!.pc += p.puntosB
      sub.get(p.jugadorB)!.pf += p.puntosB; sub.get(p.jugadorB)!.pc += p.puntosA
    }
  }
  return new Map([...sub].map(([id, s]) => [
    id,
    `${s.pg}|${ratioMerito(s.sf, s.sc)}|${ratioMerito(s.pf, s.pc)}`,
  ]))
}

function compararClaves(a: string, b: string): number {
  const [pgA, setsA, ptsA] = a.split('|').map(Number)
  const [pgB, setsB, ptsB] = b.split('|').map(Number)
  if (pgB !== pgA) return pgB - pgA
  if (setsB !== setsA) return setsB - setsA
  return ptsB - ptsA
}

export function calcularStatsGrupo(
  jugadores: JugadorTorneo[],
  partidos: Array<PartidoConMarcador>,
): { stats: GrupoStats[]; hayTripleEmpate: boolean } {
  const statsMap: Record<string, GrupoStats> = {}
  for (const j of jugadores) {
    statsMap[j.id] = {
      jugadorId: j.id,
      jugador: j,
      pts: 0,
      pg: 0,
      pp: 0,
      sf: 0,
      sc: 0,
      pf: 0,
      pc: 0,
    }
  }

  for (const p of partidos) {
    if (!p.ganador) continue
    const perdedor = p.jugadorA === p.ganador ? p.jugadorB : p.jugadorA
    if (statsMap[p.ganador]) {
      statsMap[p.ganador].pts += 2
      statsMap[p.ganador].pg += 1
    }
    if (statsMap[perdedor]) {
      statsMap[perdedor].pp += 1
    }
    // Los sets son opcionales: un partido sin marcador (anterior a la
    // migración 216) suma 0 a ambos y no distorsiona el ratio de nadie.
    if (p.setsA != null && p.setsB != null) {
      if (statsMap[p.jugadorA]) {
        statsMap[p.jugadorA].sf += p.setsA
        statsMap[p.jugadorA].sc += p.setsB
      }
      if (statsMap[p.jugadorB]) {
        statsMap[p.jugadorB].sf += p.setsB
        statsMap[p.jugadorB].sc += p.setsA
      }
    }
    // Los puntos también: los partidos cargados con los botones 3-1 (antes de
    // los parciales set a set) tienen sets pero no puntos.
    if (p.puntosA != null && p.puntosB != null) {
      if (statsMap[p.jugadorA]) {
        statsMap[p.jugadorA].pf += p.puntosA
        statsMap[p.jugadorA].pc += p.puntosB
      }
      if (statsMap[p.jugadorB]) {
        statsMap[p.jugadorB].pf += p.puntosB
        statsMap[p.jugadorB].pc += p.puntosA
      }
    }
  }

  const ordenOriginal = new Map(jugadores.map((j, i) => [j.id, i]))
  const porPuntos = new Map<number, GrupoStats[]>()
  for (const stat of Object.values(statsMap)) {
    const grupo = porPuntos.get(stat.pts) ?? []
    grupo.push(stat)
    porPuntos.set(stat.pts, grupo)
  }

  const ordenados: GrupoStats[] = []
  // Clave de desempate de los que empataron de a tres o más; los demás no la
  // tienen porque su empate lo resuelve el partido directo.
  const claves = new Map<string, string>()
  for (const puntos of [...porPuntos.keys()].sort((a, b) => b - a)) {
    const empatados = porPuntos.get(puntos) ?? []
    if (empatados.length >= 3) {
      for (const [id, clave] of clavesDesempateSubgrupo(empatados, partidos)) claves.set(id, clave)
    }
    empatados.sort((a, b) => {
      if (empatados.length === 2) {
        const directo = partidos.find(p =>
          (p.jugadorA === a.jugadorId && p.jugadorB === b.jugadorId) ||
          (p.jugadorA === b.jugadorId && p.jugadorB === a.jugadorId),
        )
        if (directo?.ganador === a.jugadorId) return -1
        if (directo?.ganador === b.jugadorId) return 1
      }
      const claveA = claves.get(a.jugadorId)
      const claveB = claves.get(b.jugadorId)
      if (claveA && claveB && claveA !== claveB) return compararClaves(claveA, claveB)
      return (ordenOriginal.get(a.jugadorId) ?? 0) - (ordenOriginal.get(b.jugadorId) ?? 0)
    })
    ordenados.push(...empatados)
  }

  // El triple empate solo va al juez si el desempate por sets y puntos NO
  // separó a los que se disputan un cupo. Los que importan son quién es 1° y
  // quién 2°: si esos dos bordes quedaron decididos, el resto da lo mismo.
  const puntosCorte = ordenados[1]?.pts
  const empatadosEnCorte = puntosCorte == null ? [] : ordenados.filter(j => j.pts === puntosCorte)
  const bordeAmbiguo = (i: number) => {
    const a = ordenados[i], b = ordenados[i + 1]
    if (!a || !b || a.pts !== b.pts) return false
    const claveA = claves.get(a.jugadorId)
    return !!claveA && claveA === claves.get(b.jugadorId)
  }
  const hayTripleEmpate = empatadosEnCorte.length >= 3 && (bordeAmbiguo(0) || bordeAmbiguo(1))

  return { stats: ordenados, hayTripleEmpate }
}

// ─── Ranking global de clasificados ───────────────────────────────────────
// Con qué criterio se ordenan TODOS los que pasaron de fase, mezclando grupos
// distintos. Hasta ahora no existía: el reparto de BYE se decidía por el
// balance de mitades del cuadro, así que un 2° podía descansar mientras un 1°
// con mejor rendimiento jugaba la primera ronda.

export interface ClasificadoConStats {
  jugadorId: string
  /** Índice del grupo (0-based). Sirve para no cruzar 1° y 2° del mismo grupo. */
  grupoIdx: number
  posicion: 1 | 2
  /** Partidos ganados en el grupo (el `pg` de `calcularStatsGrupo`). */
  victorias: number
  setsFavor: number
  setsContra: number
  /** Puntos ganados en el grupo. 0 en partidos cargados sin parciales. */
  puntosFavor?: number
  /** Puntos cedidos en el grupo. Ver nota de `puntosFavor`. */
  puntosContra?: number
  /** Número de cabeza de serie manual, si tiene. Menor es mejor. */
  cabezaNumero: number | null
}

/**
 * Ordena a los clasificados de mejor a peor.
 *
 * Todos los 1° van antes que todos los 2°, incluso si un 2° rindió mejor: es
 * la regla del estándar y evita que ganar el grupo sea indistinto. Dentro de
 * cada nivel: más victorias → mejor ratio de sets → mejor ratio de puntos →
 * cabeza de serie más alta → id de jugador. El último criterio no es deportivo,
 * está para que el orden sea determinístico: mismos datos, mismo cuadro,
 * siempre.
 *
 * Ojo con una limitación conocida, la misma que acepta el estándar ITTF de
 * referencia: en grupos de distinto tamaño las victorias no son comparables
 * (ganar 2 de 2 en un grupo de 3 vale más que ganar 1 de 1 en uno de 2, y acá
 * el de 2 victorias queda por delante).
 */
export function rankearClasificados(
  clasificados: readonly ClasificadoConStats[],
): ClasificadoConStats[] {
  // Un jugador sin ningún set en contra no puede dividir por cero. Si además
  // no ganó ninguno (partidos viejos sin marcador), su ratio es 0 y queda al
  // fondo de su nivel, no arriba. Mismo criterio para los puntos.
  return [...clasificados].sort((a, b) => {
    if (a.posicion !== b.posicion) return a.posicion - b.posicion
    if (b.victorias !== a.victorias) return b.victorias - a.victorias
    const setsA = ratioMerito(a.setsFavor, a.setsContra)
    const setsB = ratioMerito(b.setsFavor, b.setsContra)
    if (setsB !== setsA) return setsB - setsA
    const puntosA = ratioMerito(a.puntosFavor ?? 0, a.puntosContra ?? 0)
    const puntosB = ratioMerito(b.puntosFavor ?? 0, b.puntosContra ?? 0)
    if (puntosB !== puntosA) return puntosB - puntosA
    const cabezaA = a.cabezaNumero ?? Number.MAX_SAFE_INTEGER
    const cabezaB = b.cabezaNumero ?? Number.MAX_SAFE_INTEGER
    if (cabezaA !== cabezaB) return cabezaA - cabezaB
    return a.jugadorId.localeCompare(b.jugadorId)
  })
}

// ─── Cuadro por ranking de mérito ─────────────────────────────────────────
// Reemplaza el reparto de BYE por balance de mitades: siembra a los
// clasificados según `rankearClasificados` (mejor = seed 1) y deja los BYE en
// los mejores seeds, que es donde el sembrado estándar los pone.

export interface RankeadoParaBracket {
  jugadorId: string
  nombre: string
  grupoIdx: number
  posicion: 1 | 2
  /** Número de cabeza de serie, si tiene. Una cabeza queda anclada en su
   *  esquina y no se mueve en la separación por mitades. */
  cabezaNumero?: number | null
}

/**
 * Arma la ronda inicial del cuadro a partir de los clasificados YA ordenados
 * por mérito (índice 0 = mejor). El BYE lo reciben los mejores seeds porque el
 * sembrado bit-reversal empareja sus posiciones con las que quedan vacías.
 *
 * Único ajuste sobre el sembrado puro: si un 1° y su propio 2° caen en la
 * misma llave inicial (R4), se corre al 2° a la posición ocupada más cercana
 * que no genere otro choque. Ese corrimiento nunca toca una posición con BYE,
 * así que no le quita el descanso a nadie que lo haya ganado.
 */
export function construirBracketPorRanking(
  rankeados: readonly RankeadoParaBracket[],
): PartidoGenerado[] {
  const n = rankeados.length
  if (n < 2) return []
  const tam = calcularTamanoBracket(n)
  const fase = determinarFaseInicial(tam)
  const seedPos = posicionesSembradas(tam) // seedPos[i] = posición del seed i+1

  const arr: Array<RankeadoParaBracket | null> = Array(tam).fill(null)
  rankeados.forEach((r, i) => { arr[seedPos[i]] = r })

  // Regla de Luis: el 2° de un grupo va a la mitad OPUESTA de su propio 1°.
  // Esto también evita que se crucen en la primera ronda.
  separarMitades(arr, tam)

  // Un ganador de grupo debe enfrentar a un 2°, no a otro ganador, mientras
  // aritméticamente se pueda.
  emparejarPrimeroContraSegundo(arr, tam)

  // Backstop: si la separación por mitades no pudo (sin swap válido), al menos
  // que dos del mismo grupo no queden en la misma llave inicial.
  for (let k = 0; k < tam / 2; k++) {
    const posA = 2 * k
    const posB = 2 * k + 1
    const a = arr[posA]
    const b = arr[posB]
    if (a && b && a.grupoIdx === b.grupoIdx) resolverChoqueDeGrupo(arr, posA, posB)
  }

  return construirBracketDesdePosiciones(
    arr.map(r => (r ? { id: r.jugadorId, nombre: r.nombre } : null)),
    fase,
  )
}

/**
 * Deshace las llaves de 1°vs1° cambiando uno de esos ganadores por un 2° que
 * esté en una llave de 2°vs2°. Las dos llaves quedan 1°vs2°, que es como debe
 * cruzar una primera ronda: el que ganó su grupo enfrenta a un segundo.
 *
 * Con G grupos, 2G clasificados y B byes, quedan (G−B) ganadores libres contra
 * G segundos: siempre sobran segundos, así que las llaves 2°vs2° existen y son
 * inevitables, pero las de 1°vs1° no. La siembra pura igual las produce porque
 * empareja seeds vecinos (en un cuadro de 16, el 8 con el 9) y los ganadores
 * sin cabeza caen justo ahí.
 *
 * Solo intercambia DENTRO de la misma mitad: así ningún jugador cambia de lado
 * y la separación de `separarMitades` queda intacta. Nunca mueve una cabeza de
 * su ancla ni toca una posición con BYE. Si no hay swap válido deja la llave
 * como está, igual criterio que el resto del armado.
 */
function emparejarPrimeroContraSegundo(arr: Array<RankeadoParaBracket | null>, tam: number): void {
  const mitad = tam / 2
  const lado = (p: number) => (p < mitad ? 0 : 1)
  // Posiciones de una llave completa cuyos dos ocupantes son del nivel `nivel`.
  const llavesDeNivel = (nivel: 1 | 2): number[][] => {
    const res: number[][] = []
    for (let k = 0; k < tam / 2; k++) {
      const a = arr[2 * k]
      const b = arr[2 * k + 1]
      if (a && b && a.posicion === nivel && b.posicion === nivel) res.push([2 * k, 2 * k + 1])
    }
    return res
  }

  for (const [pa, pb] of llavesDeNivel(1)) {
    // Candidatos a salir de esta llave: el que no sea cabeza de serie.
    const salidas = [pa, pb]
    let hecho = false
    for (const sale of salidas) {
      if (hecho) break
      const queda = arr[sale === pa ? pb : pa]!
      for (const [qa, qb] of llavesDeNivel(2)) {
        if (hecho) break
        if (lado(qa) !== lado(sale)) continue // solo misma mitad: no cambia de lado a nadie
        for (const entra of [qa, qb]) {
          const cand = arr[entra]!
          if (cand.grupoIdx === queda.grupoIdx) continue   // chocaría con el que se queda
          const otro2 = arr[entra === qa ? qb : qa]!
          if (otro2.grupoIdx === arr[sale]!.grupoIdx) continue // el 1° chocaría al llegar
          const tmp = arr[sale]; arr[sale] = arr[entra]; arr[entra] = tmp
          hecho = true
          break
        }
      }
    }
  }
}

/**
 * Separa a los dos del mismo grupo que cayeron en la llave `posA`/`posB`.
 * Mueve al 2° del grupo (nunca al 1°, para no alterar la orientación de seeds
 * altos) hacia la posición OCUPADA más cercana que no arme otro choque. Como
 * dos del mismo grupo solo pueden ser 1° y 2° (un grupo tiene un único 1°),
 * siempre hay exactamente un jugador de posición 2 en el par.
 *
 * Solo intercambia entre posiciones ocupadas: nunca mueve a nadie a una
 * posición con BYE ni saca a nadie de una, así el conjunto de BYE es idéntico
 * antes y después (preserva R1). Si no hay swap válido —caso extremo con pocos
 * grupos— deja el choque, igual que `seedingSerpenteoConClubes` cuando el
 * choque de club es inevitable.
 */
function resolverChoqueDeGrupo(
  arr: Array<RankeadoParaBracket | null>,
  posA: number,
  posB: number,
): void {
  const a = arr[posA]!
  // Mover al 2° del grupo: el 1° tiene mejor semilla y moverlo alteraría más
  // el orden. Como un grupo tiene un solo 1°, siempre hay exactamente un 2°.
  const moverPos = a.posicion === 2 ? posA : posB
  const quedaPos = moverPos === posA ? posB : posA
  const mover = arr[moverPos]!
  const seFija = arr[quedaPos]!

  let mejor: number | null = null
  let mejorDist = Infinity
  for (let p = 0; p < arr.length; p++) {
    if (p === posA || p === posB) continue
    const cand = arr[p]
    if (!cand) continue                          // posición con BYE: no se toca
    if (cand.posicion !== mover.posicion) continue // conservar el nivel (1°/2°)
    const par = p % 2 === 0 ? p + 1 : p - 1
    const vecino = arr[par]
    if (!vecino) continue                        // p da BYE: moverse ahí lo robaría
    if (cand.grupoIdx === seFija.grupoIdx) continue // cand chocaría al llegar a moverPos
    if (vecino.grupoIdx === mover.grupoIdx) continue // mover chocaría al llegar a p
    const dist = Math.abs(p - moverPos)
    if (dist < mejorDist) { mejorDist = dist; mejor = p }
  }

  if (mejor != null) {
    arr[moverPos] = arr[mejor]
    arr[mejor] = mover
  }
}

/**
 * Lleva a un grupo (1° y 2°) a mitades opuestas del cuadro. Nunca mueve una
 * cabeza de serie (está anclada en su esquina): mueve al otro miembro, o al 2°
 * si ninguno es cabeza. Busca un swap con alguien del MISMO nivel (1°/2°) en la
 * mitad de destino que no arme otro choque de grupo, ni de mitad ni de primera
 * ronda. Solo intercambia posiciones ocupadas, así el conjunto de BYE no cambia.
 *
 * Ceiling: es un pase greedy, un intento por grupo. Con muchos grupos y clubes
 * apretados puede quedar algún grupo sin separar del todo; en ese caso el
 * backstop de primera ronda evita al menos que se crucen de entrada. Si hiciera
 * falta separación garantizada, upgrade a un emparejamiento por mitades.
 */
function separarMitades(arr: Array<RankeadoParaBracket | null>, tam: number): void {
  const mitad = tam / 2
  const lado = (p: number) => (p < mitad ? 0 : 1)
  const grupos = [...new Set(arr.flatMap(r => (r ? [r.grupoIdx] : [])))]

  // Intenta llevar el grupo `g` a mitades opuestas con un swap. Devuelve si movió.
  // Se llama en un bucle hasta punto fijo porque separar un grupo puede liberar
  // el slot que otro necesitaba: una sola pasada deja casos resolubles sin tocar.
  const separarUno = (g: number): boolean => {
    const p1 = arr.findIndex(r => r?.grupoIdx === g && r.posicion === 1)
    const p2 = arr.findIndex(r => r?.grupoIdx === g && r.posicion === 2)
    if (p1 < 0 || p2 < 0) return false
    if (lado(p1) !== lado(p2)) return false // ya están en mitades opuestas

    // Nunca mover a quien ya tiene BYE: perdería el descanso que le tocó por
    // siembra y se lo llevaría alguien peor ubicado. Se prefiere mover al 2°.
    const tieneBye = (p: number) => arr[p % 2 === 0 ? p + 1 : p - 1] == null
    let moverPos: number
    if (!tieneBye(p2)) moverPos = p2
    else if (!tieneBye(p1)) moverPos = p1
    else return false // los dos descansan: separarlos costaría un BYE
    const mover = arr[moverPos]!
    const seFija = arr[moverPos === p1 ? p2 : p1]!
    const ladoDestino = 1 - lado(moverPos)

    let mejor: number | null = null
    let mejorDist = Infinity
    for (let p = 0; p < tam; p++) {
      if (lado(p) !== ladoDestino) continue
      const cand = arr[p]
      if (!cand) continue                            // BYE: no se toca
      if (cand.posicion !== mover.posicion) continue // conservar nivel
      if (cand.grupoIdx === mover.grupoIdx) continue // mismo grupo que mover
      if (cand.grupoIdx === seFija.grupoIdx) continue // cand chocaría en destino con el fijo
      const vecP = p % 2 === 0 ? p + 1 : p - 1
      const vP = arr[vecP]
      if (vP && vP.grupoIdx === mover.grupoIdx) continue // mover chocaría en 1ª ronda al llegar a p
      const vecM = moverPos % 2 === 0 ? moverPos + 1 : moverPos - 1
      const vM = arr[vecM]
      if (vM && vM.grupoIdx === cand.grupoIdx) continue // cand chocaría en 1ª ronda al llegar a moverPos
      const dist = Math.abs(p - moverPos)
      if (dist < mejorDist) { mejorDist = dist; mejor = p }
    }
    if (mejor == null) return false
    const tmp = arr[moverPos]; arr[moverPos] = arr[mejor]; arr[mejor] = tmp
    return true
  }

  // Punto fijo: repetir mientras alguna pasada logre separar un grupo. Cota dura
  // de vueltas (cada vuelta arregla ≥1 grupo o corta) para no colgarse nunca.
  for (let vuelta = 0; vuelta < grupos.length + 1; vuelta++) {
    let cambio = false
    for (const g of grupos) if (separarUno(g)) cambio = true
    if (!cambio) break
  }
}

/**
 * Siembra tradicional acordada con el club (2026-08-24):
 *
 * 1. Todos los ganadores de grupo van antes que todos los segundos.
 * 2. Entre los ganadores manda el ORDEN DEL GRUPO: el 1° del grupo A es la
 *    mejor semilla, el del B la segunda, y así. No es arbitrario — al repartir
 *    los grupos las cabezas se reparten en orden (CS1 al grupo A, CS2 al B,
 *    CS3 al C…), así que el orden de grupo ya lleva incorporado el número de
 *    cabeza. Ganar el grupo A vale más que ganar el G porque el A era el
 *    grupo de la cabeza #1.
 * 3. Entre los segundos manda el mérito (`rankearClasificados`): victorias →
 *    ratio de sets → ratio de puntos.
 *
 * El número de cabeza ya no ancla posiciones por sí solo: una cabeza que
 * pierde su grupo cae al pozo de segundos y se ordena por rendimiento, como
 * cualquiera. Es lo que pidió el club — "el mérito es para los segundos".
 */
function ordenarSiembraTradicional(
  clasificados: readonly ClasificadoConStats[],
): ClasificadoConStats[] {
  const primeros = clasificados
    .filter(c => c.posicion === 1)
    .sort((a, b) => (a.grupoIdx - b.grupoIdx) || a.jugadorId.localeCompare(b.jugadorId))
  const segundos = rankearClasificados(clasificados.filter(c => c.posicion === 2))
  return [...primeros, ...segundos]
}

/**
 * Adapta `construirBracketPorRanking` al formato `LlavesLayout` (slots por
 * grupo) que consume `sincronizarLlaves`. Toda la maquinaria de inserción,
 * slots y propagación de la capa de acciones se reutiliza sin cambios. Solo se
 * usa cuando cerraron todos los grupos: antes de eso no hay ranking comparable.
 */
export function construirLayoutPorRanking(
  clasificados: readonly ClasificadoConStats[],
): LlavesLayout {
  const slotDe = new Map(clasificados.map(c => [c.jugadorId, { grupoIdx: c.grupoIdx, pos: c.posicion }]))
  const ordenados = ordenarSiembraTradicional(clasificados)
  const bracket = construirBracketPorRanking(ordenados.map(c => ({
    jugadorId: c.jugadorId, nombre: '', grupoIdx: c.grupoIdx, posicion: c.posicion, cabezaNumero: c.cabezaNumero,
  })))
  return {
    faseInicial: determinarFaseInicial(calcularTamanoBracket(clasificados.length)),
    matches: bracket.map(p => ({
      orden: p.orden,
      a: p.jugadorA ? slotDe.get(p.jugadorA) ?? null : null,
      b: p.jugadorB ? slotDe.get(p.jugadorB) ?? null : null,
    })),
  }
}


// ─── Semillas principales (cabezas de serie 1° y 2°) ──────────────────────

// Orden de sembrado estándar (bit-reversal) para un cuadro de tamaño `tam`
// (potencia de 2). Devuelve, por cada slot, el número de sembrado (1..tam) que
// va ahí. Emparejando slots consecutivos (0-1, 2-3, …) el sembrado 1 y 2 caen
// en mitades opuestas: solo se cruzan en la final. Ej: tam=8 → [1,8,4,5,2,7,3,6].
function slotsSeed(tam: number): number[] {
  let rondas = [1]
  while (rondas.length < tam) {
    const m = rondas.length * 2
    const next: number[] = []
    for (const s of rondas) { next.push(s); next.push(m + 1 - s) }
    rondas = next
  }
  return rondas
}

// Arma los partidos desde posiciones sembradas y completa los BYEs.
function construirBracketDesdePosiciones(posiciones: Array<JugadorTorneo | null>, fase: string): PartidoGenerado[] {
  const partidos: PartidoGenerado[] = []
  for (let k = 0; k < posiciones.length / 2; k++) {
    const jugA = posiciones[2 * k] ?? null
    const jugB = posiciones[2 * k + 1] ?? null
    if (jugA && jugB) {
      partidos.push({ jugadorA: jugA.id, jugadorB: jugB.id, fase, orden: k })
    } else if (jugA) {
      partidos.push({ jugadorA: jugA.id, jugadorB: null, ganador: jugA.id, fase, orden: k })
    } else if (jugB) {
      partidos.push({ jugadorA: jugB.id, jugadorB: null, ganador: jugB.id, fase, orden: k })
    }
  }
  return partidos
}

function posicionesSembradas(tam: number): number[] {
  const slots = slotsSeed(tam)
  const posiciones = Array(tam + 1).fill(0)
  slots.forEach((seed, pos) => { posiciones[seed] = pos })
  return posiciones.slice(1)
}

function mitadDe(pos: number, tam: number): 0 | 1 {
  return pos < tam / 2 ? 0 : 1
}

function posicionarCuposEspejo(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): Array<JugadorTorneo | null> {
  const total = primeros.length + segundos.length
  const tam = calcularTamanoBracket(total)
  const posiciones: Array<JugadorTorneo | null> = Array(tam).fill(null)
  const seedPositions = posicionesSembradas(tam)
  const groupCount = Math.max(primeros.length, segundos.length)
  const posPrimeros = new Map<number, number>()

  const grupoDeSemilla = (id?: string | null): number | null => {
    if (!id) return null
    const idx = primeros.findIndex(j => j.id === id)
    if (idx >= 0) return idx
    return null
  }

  const ordenGrupos = Array.from({ length: groupCount }, (_, i) => i)
  const c1 = grupoDeSemilla(semilla1Id)
  const c2Raw = grupoDeSemilla(semilla2Id)
  const c2 = c2Raw !== c1 ? c2Raw : null
  const gruposPriorizados = [c1, c2, ...ordenGrupos]
    .filter((g): g is number => g != null)
    .filter((g, i, arr) => arr.indexOf(g) === i)

  const ocupar = (jugador: JugadorTorneo | undefined, preferencias: number[]): number | null => {
    if (!jugador) return null
    const pos = preferencias.find(p => p >= 0 && p < tam && posiciones[p] === null)
    if (pos == null) return null
    posiciones[pos] = jugador
    return pos
  }

  gruposPriorizados.forEach((g, idx) => {
    const jugador = primeros[g]
    if (!jugador) return
    const preferencias = idx === 0
      ? [seedPositions[0], ...seedPositions]
      : idx === 1
        ? [seedPositions[1], ...seedPositions]
        : seedPositions
    const pos = ocupar(jugador, preferencias)
    if (pos != null) posPrimeros.set(g, pos)
  })

  gruposPriorizados.forEach(g => {
    const jugador = segundos[g]
    if (!jugador) return
    const posPrimero = posPrimeros.get(g)
    const mitadObjetivo = posPrimero == null ? null : (mitadDe(posPrimero, tam) === 0 ? 1 : 0)
    const espejo = posPrimero == null ? -1 : (posPrimero + tam / 2) % tam
    const preferencias = [
      espejo,
      ...seedPositions.filter(p => mitadObjetivo == null || mitadDe(p, tam) === mitadObjetivo),
      ...seedPositions,
    ]
    ocupar(jugador, preferencias)
  })

  return posiciones
}

interface CupoBracket {
  jugador: JugadorTorneo
  grupoIdx: number
  pos: 1 | 2
}

interface UnidadBracket {
  a: CupoBracket
  b: CupoBracket | null
}

interface SemillaNumeradaJugador {
  jugadorId: string
  numero: number
}

export interface CabezaSerieNumerada {
  numero: number
  grupoIdx: number
  pos: 1 | 2
}

function claveCupo(cupo: CupoBracket | null | undefined): string {
  return cupo ? `${cupo.grupoIdx}:${cupo.pos}` : ''
}

// Construye el cuadro por mitades. El 1° y 2° de cada grupo quedan en mitades
// opuestas; por eso cualquier partido real de la ronda inicial siempre cruza
// un 1° con un 2° de otro grupo. Los BYE se reparten de forma compatible entre
// ambas posiciones y priorizan los cabezas de serie cuando existe cupo.
function construirBracketPorGrupos(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
  gruposListos: Set<number> = new Set(),
): PartidoGenerado[] {
  const numGrupos = primeros.length
  if (numGrupos < 2 || segundos.length !== numGrupos) return []

  const total = numGrupos * 2
  const tam = calcularTamanoBracket(total)
  const totalPartidos = tam / 2
  const partidosPorMitad = totalPartidos / 2
  const fase = determinarFaseInicial(tam)

  const cupos: CupoBracket[] = []
  for (let grupoIdx = 0; grupoIdx < numGrupos; grupoIdx++) {
    cupos.push({ jugador: primeros[grupoIdx], grupoIdx, pos: 1 })
    cupos.push({ jugador: segundos[grupoIdx], grupoIdx, pos: 2 })
  }
  const porJugador = new Map(cupos.map(c => [c.jugador.id, c]))
  const cabeza1 = semilla1Id ? porJugador.get(semilla1Id) ?? null : null
  const cabeza2 = semilla2Id ? porJugador.get(semilla2Id) ?? null : null

  // Cantidad de primeros que deben quedar en la mitad superior. Con impares,
  // la mitad superior recibe uno más; esto determina el reparto válido de BYE.
  const construirMitades = (primerosMitad0: number, protegerAmbas: boolean): Set<number> | null => {
    const forzados0 = new Set<number>()
    const forzados1 = new Set<number>()
    const fijar = (cabeza: CupoBracket | null, mitadCabeza: 0 | 1) => {
      if (!cabeza) return
      const mitadPrimero = cabeza.pos === 1 ? mitadCabeza : (1 - mitadCabeza) as 0 | 1
      if (mitadPrimero === 0) forzados0.add(cabeza.grupoIdx)
      else forzados1.add(cabeza.grupoIdx)
    }
    fijar(cabeza1, 0)
    if (protegerAmbas) fijar(cabeza2, 1)
    if ([...forzados0].some(g => forzados1.has(g))) return null
    if (forzados0.size > primerosMitad0 || forzados1.size > numGrupos - primerosMitad0) return null

    const resultado = new Set(forzados0)
    const objetivoListos = Math.min(primerosMitad0, Math.ceil(gruposListos.size / 2))
    for (const g of [...gruposListos].sort((a, b) => a - b)) {
      if (resultado.size >= primerosMitad0) break
      const listosActuales = [...resultado].filter(x => gruposListos.has(x)).length
      if (!forzados1.has(g) && listosActuales < objetivoListos) resultado.add(g)
    }
    for (let g = 0; g < numGrupos && resultado.size < primerosMitad0; g++) {
      if (!forzados1.has(g) && !gruposListos.has(g)) resultado.add(g)
    }
    for (let g = 0; g < numGrupos && resultado.size < primerosMitad0; g++) {
      if (!forzados1.has(g)) resultado.add(g)
    }
    return resultado.size === primerosMitad0 ? resultado : null
  }
  // Se intenta separar ambos cabezas. Si la regla 1° vs 2° lo hace imposible
  // (por ejemplo, dos grupos y cabezas 1A/2B), prevalece el cruce deportivo.
  const tamanosMitad0 = [...new Set([Math.ceil(numGrupos / 2), Math.floor(numGrupos / 2)])]
  const grupoEnMitad0 = tamanosMitad0.map(n => construirMitades(n, true)).find(Boolean)
    ?? tamanosMitad0.map(n => construirMitades(n, false)).find(Boolean)
    ?? new Set(Array.from({ length: Math.ceil(numGrupos / 2) }, (_, i) => i))

  const esCabeza = (c: CupoBracket) => c.jugador.id === semilla1Id || c.jugador.id === semilla2Id
  const ordenarPrioridad = (lista: CupoBracket[]) => [...lista].sort((a, b) => {
    const pa = a.jugador.id === semilla1Id ? 0 : a.jugador.id === semilla2Id ? 1 : 2
    const pb = b.jugador.id === semilla1Id ? 0 : b.jugador.id === semilla2Id ? 1 : 2
    const la = gruposListos.has(a.grupoIdx) ? 0 : 1
    const lb = gruposListos.has(b.grupoIdx) ? 0 : 1
    return pa - pb || la - lb || a.grupoIdx - b.grupoIdx || a.pos - b.pos
  })

  const unidadesPorMitad: UnidadBracket[][] = [[], []]
  for (const mitad of [0, 1] as const) {
    const primerosMitad = cupos.filter(c => c.pos === 1 && (grupoEnMitad0.has(c.grupoIdx) ? 0 : 1) === mitad)
    const segundosMitad = cupos.filter(c => c.pos === 2 && (grupoEnMitad0.has(c.grupoIdx) ? 1 : 0) === mitad)
    const vaciosMitad = totalPartidos - numGrupos
    const byePrimeros = (vaciosMitad + primerosMitad.length - segundosMitad.length) / 2
    const byeSegundos = vaciosMitad - byePrimeros

    if (!Number.isInteger(byePrimeros) || byePrimeros < 0 || byeSegundos < 0) return []

    const primerosOrdenados = ordenarPrioridad(primerosMitad)
    const segundosOrdenados = ordenarPrioridad(segundosMitad)
    const primerosBye = primerosOrdenados.slice(0, byePrimeros)
    const segundosBye = segundosOrdenados.slice(0, byeSegundos)
    const primerosJuegan = primerosOrdenados.slice(byePrimeros)
    const segundosJuegan = segundosOrdenados.slice(byeSegundos)
    if (primerosJuegan.length !== segundosJuegan.length) return []

    const unidades: UnidadBracket[] = [
      ...primerosBye.map(a => ({ a, b: null })),
      ...segundosBye.map(a => ({ a, b: null })),
      ...primerosJuegan.map((a, i) => ({ a, b: segundosJuegan[i] })),
    ]
    if (unidades.length !== partidosPorMitad) return []

    unidades.sort((x, y) => {
      const px = x.a.jugador.id === semilla1Id || x.b?.jugador.id === semilla1Id
        ? 0
        : x.a.jugador.id === semilla2Id || x.b?.jugador.id === semilla2Id ? 1 : 2
      const py = y.a.jugador.id === semilla1Id || y.b?.jugador.id === semilla1Id
        ? 0
        : y.a.jugador.id === semilla2Id || y.b?.jugador.id === semilla2Id ? 1 : 2
      return px - py || Number(!esCabeza(x.a)) - Number(!esCabeza(y.a)) || claveCupo(x.a).localeCompare(claveCupo(y.a))
    })
    unidadesPorMitad[mitad] = unidades
  }

  return [...unidadesPorMitad[0], ...unidadesPorMitad[1]].map((u, orden) => ({
    jugadorA: u.a.jugador.id,
    jugadorB: u.b?.jugador.id ?? null,
    ganador: u.b ? null : u.a.jugador.id,
    fase,
    orden,
  }))
}

// ─── Playoffs ──────────────────────────────────────────────────────────────

function construirBracketPorGruposNumerado(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semillasEntrada: readonly SemillaNumeradaJugador[] = [],
  gruposListos: Set<number> = new Set(),
): PartidoGenerado[] {
  const numGrupos = primeros.length
  if (numGrupos < 2 || segundos.length !== numGrupos) return []
  const total = numGrupos * 2
  const tam = calcularTamanoBracket(total)
  const totalPartidos = tam / 2
  const partidosPorMitad = totalPartidos / 2
  const fase = determinarFaseInicial(tam)
  const cupos: CupoBracket[] = []
  for (let grupoIdx = 0; grupoIdx < numGrupos; grupoIdx++) {
    cupos.push({ jugador: primeros[grupoIdx], grupoIdx, pos: 1 })
    cupos.push({ jugador: segundos[grupoIdx], grupoIdx, pos: 2 })
  }

  const idsValidos = new Set(cupos.map(c => c.jugador.id))
  const semillas = semillasEntrada
    .filter(s => Number.isInteger(s.numero) && s.numero > 0 && idsValidos.has(s.jugadorId))
    .sort((a, b) => a.numero - b.numero || a.jugadorId.localeCompare(b.jugadorId))
    .filter((s, i, arr) => arr.findIndex(x => x.numero === s.numero || x.jugadorId === s.jugadorId) === i)
  const numeroPorJugador = new Map(semillas.map(s => [s.jugadorId, s.numero]))
  const semillaDe = (c: CupoBracket | null | undefined) => c ? numeroPorJugador.get(c.jugador.id) ?? null : null
  const posicionCanonica = (numero: number) => posicionesSembradas(tam)[numero - 1]

  // Orientación lexicográfica por número: se protege #1 antes que #2, etc.
  const pesos = new Map(semillas.map((s, i) => [s.jugadorId, 2 ** (semillas.length - i)]))
  const evaluarOrientacion = (cantidadArriba: number) => {
    const opciones = Array.from({ length: numGrupos }, (_, grupoIdx) => {
      let arriba = 0
      let abajo = 0
      for (const cupo of cupos.filter(c => c.grupoIdx === grupoIdx)) {
        const numero = semillaDe(cupo)
        if (!numero || numero > tam) continue
        const mitadDeseada = posicionCanonica(numero) < tam / 2 ? 0 : 1
        const peso = pesos.get(cupo.jugador.id) ?? 0
        const mitadConPrimeroArriba = cupo.pos === 1 ? 0 : 1
        if (mitadConPrimeroArriba === mitadDeseada) arriba += peso
        else abajo += peso
      }
      return { grupoIdx, arriba, abajo, delta: arriba - abajo }
    })
    opciones.sort((a, b) => {
      if (a.delta !== b.delta) return a.delta > b.delta ? -1 : 1
      const ready = Number(gruposListos.has(b.grupoIdx)) - Number(gruposListos.has(a.grupoIdx))
      return ready || a.grupoIdx - b.grupoIdx
    })
    const elegidos = new Set(opciones.slice(0, cantidadArriba).map(o => o.grupoIdx))
    const objetivoListos = Math.min(cantidadArriba, Math.ceil(gruposListos.size / 2))
    let listosArriba = [...elegidos].filter(g => gruposListos.has(g)).length
    // Con igual costo de semillas, repartir grupos cerrados entre ambas mitades
    // deja al menos una rama completa lista para jugar.
    while (listosArriba > objetivoListos) {
      const sale = opciones.find(o => elegidos.has(o.grupoIdx) && gruposListos.has(o.grupoIdx))
      const entra = opciones.find(o => !elegidos.has(o.grupoIdx) && !gruposListos.has(o.grupoIdx) && o.delta === sale?.delta)
      if (!sale || !entra) break
      elegidos.delete(sale.grupoIdx)
      elegidos.add(entra.grupoIdx)
      listosArriba--
    }
    while (listosArriba < objetivoListos) {
      const sale = opciones.find(o => elegidos.has(o.grupoIdx) && !gruposListos.has(o.grupoIdx))
      const entra = opciones.find(o => !elegidos.has(o.grupoIdx) && gruposListos.has(o.grupoIdx) && o.delta === sale?.delta)
      if (!sale || !entra) break
      elegidos.delete(sale.grupoIdx)
      elegidos.add(entra.grupoIdx)
      listosArriba++
    }
    const calidad = (orientacion: Set<number>) => {
      const byes = new Set<string>()
      const vaciosMitad = totalPartidos - numGrupos
      for (const mitad of [0, 1] as const) {
        const primerosMitad = cupos.filter(c => c.pos === 1 && (orientacion.has(c.grupoIdx) ? 0 : 1) === mitad)
        const segundosMitad = cupos.filter(c => c.pos === 2 && (orientacion.has(c.grupoIdx) ? 1 : 0) === mitad)
        // BYE repartido para que primeros y segundos jueguen la misma cantidad
        // de partidos (nunca 2° vs 2°): ver detalle en el bloque de abajo.
        const partidosMitad = partidosPorMitad - vaciosMitad
        const byePrimeros = Math.max(0, primerosMitad.length - partidosMitad)
        const byeSegundos = Math.max(0, segundosMitad.length - partidosMitad)
        const prioridad = (a: CupoBracket, b: CupoBracket) => {
          const sa = semillaDe(a) ?? Number.MAX_SAFE_INTEGER
          const sb = semillaDe(b) ?? Number.MAX_SAFE_INTEGER
          return sa - sb || Number(!gruposListos.has(a.grupoIdx)) - Number(!gruposListos.has(b.grupoIdx))
            || a.grupoIdx - b.grupoIdx
        }
        primerosMitad.slice().sort(prioridad).slice(0, byePrimeros).forEach(c => byes.add(claveCupo(c)))
        segundosMitad.slice().sort(prioridad).slice(0, byeSegundos).forEach(c => byes.add(claveCupo(c)))
      }
      const mirror = semillas.map(s => {
        const cupo = cupos.find(c => c.jugador.id === s.jugadorId)!
        const mitadReal = cupo.pos === 1
          ? (orientacion.has(cupo.grupoIdx) ? 0 : 1)
          : (orientacion.has(cupo.grupoIdx) ? 1 : 0)
        return mitadReal === (posicionCanonica(s.numero) < tam / 2 ? 0 : 1)
      })
      const bye = semillas.map(s => byes.has(claveCupo(cupos.find(c => c.jugador.id === s.jugadorId)!)))
      // #1/#2 separados es lo primero; luego BYE por número; después el espejo
      // completo de las semillas restantes.
      return [mirror[0] ?? true, mirror[1] ?? true, ...bye, ...mirror.slice(2)]
    }
    const compararCalidad = (a: boolean[], b: boolean[]) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if ((a[i] ?? false) !== (b[i] ?? false)) return a[i] ? 1 : -1
      }
      return 0
    }
    let calidadActual = calidad(elegidos)
    let mejoro = true
    while (mejoro) {
      mejoro = false
      let mejorSet = elegidos
      let mejorCalidad = calidadActual
      const dentro = [...elegidos].sort((a, b) => a - b)
      const fuera = Array.from({ length: numGrupos }, (_, i) => i).filter(g => !elegidos.has(g))
      for (const sale of dentro) {
        for (const entra of fuera) {
          const candidato = new Set(elegidos)
          candidato.delete(sale)
          candidato.add(entra)
          const calidadCandidata = calidad(candidato)
          if (compararCalidad(calidadCandidata, mejorCalidad) > 0) {
            mejorSet = candidato
            mejorCalidad = calidadCandidata
          }
        }
      }
      if (mejorSet !== elegidos) {
        elegidos.clear()
        mejorSet.forEach(g => elegidos.add(g))
        calidadActual = mejorCalidad
        mejoro = true
      }
    }
    listosArriba = [...elegidos].filter(g => gruposListos.has(g)).length
    return { elegidos, calidad: calidadActual, desbalanceListos: Math.abs(listosArriba - objetivoListos) }
  }
  const orientaciones = [...new Set([Math.ceil(numGrupos / 2), Math.floor(numGrupos / 2)])]
    .map(evaluarOrientacion)
    .sort((a, b) => {
      for (let i = 0; i < Math.max(a.calidad.length, b.calidad.length); i++) {
        if ((a.calidad[i] ?? false) !== (b.calidad[i] ?? false)) return a.calidad[i] ? -1 : 1
      }
      if (a.desbalanceListos !== b.desbalanceListos) return a.desbalanceListos - b.desbalanceListos
      return 0
    })
  const grupoEnMitad0 = orientaciones[0]?.elegidos ?? new Set<number>()
  const ordenarPrioridad = (lista: CupoBracket[]) => [...lista].sort((a, b) => {
    const pa = semillaDe(a) ?? Number.MAX_SAFE_INTEGER
    const pb = semillaDe(b) ?? Number.MAX_SAFE_INTEGER
    const la = gruposListos.has(a.grupoIdx) ? 0 : 1
    const lb = gruposListos.has(b.grupoIdx) ? 0 : 1
    return pa - pb || la - lb || a.grupoIdx - b.grupoIdx || a.pos - b.pos
  })

  const unidadesPorMitad: UnidadBracket[][] = [[], []]
  for (const mitad of [0, 1] as const) {
    const primerosMitad = cupos.filter(c => c.pos === 1 && (grupoEnMitad0.has(c.grupoIdx) ? 0 : 1) === mitad)
    const segundosMitad = cupos.filter(c => c.pos === 2 && (grupoEnMitad0.has(c.grupoIdx) ? 1 : 0) === mitad)
    const vaciosMitad = totalPartidos - numGrupos
    // El BYE se reparte para que la cantidad de primeros y de segundos que
    // juegan quede igual: así todo partido real es 1° vs 2°, nunca 2° vs 2°.
    // (Antes se le daba BYE a los primeros sin tope, y el sobrante de
    // segundos que quedaba fuera de cupo terminaba enfrentándose entre sí.)
    const partidosMitad = partidosPorMitad - vaciosMitad
    const byePrimeros = primerosMitad.length - partidosMitad
    const byeSegundos = segundosMitad.length - partidosMitad
    if (byePrimeros < 0 || byeSegundos < 0) return []

    const primerosOrdenados = ordenarPrioridad(primerosMitad)
    const segundosOrdenados = ordenarPrioridad(segundosMitad)
    const primerosBye = primerosOrdenados.slice(0, byePrimeros)
    const segundosBye = segundosOrdenados.slice(0, byeSegundos)
    const primerosJuegan = primerosOrdenados.slice(byePrimeros)
    const segundosPool = [...segundosOrdenados.slice(byeSegundos)]

    const parejas: { a: CupoBracket; b: CupoBracket }[] = []
    for (const p of primerosJuegan) {
      const seedA = semillaDe(p)
      segundosPool.sort((x, y) => {
        const seedX = semillaDe(x)
        const seedY = semillaDe(y)
        const preferX = seedA ? Number(seedX != null) : Number(seedX == null)
        const preferY = seedA ? Number(seedY != null) : Number(seedY == null)
        return preferX - preferY
          || (seedX ?? Number.MAX_SAFE_INTEGER) - (seedY ?? Number.MAX_SAFE_INTEGER)
          || x.grupoIdx - y.grupoIdx
      })
      parejas.push({ a: p, b: segundosPool.shift()! })
    }
    const unidades: UnidadBracket[] = [
      ...primerosBye.map(a => ({ a, b: null })),
      ...segundosBye.map(a => ({ a, b: null })),
      ...parejas,
    ]
    if (unidades.length !== partidosPorMitad) return []
    unidadesPorMitad[mitad] = unidades
  }

  const asignadas = new Map<number, UnidadBracket>()
  const semillaPrincipal = (u: UnidadBracket) => {
    const ns = [semillaDe(u.a), semillaDe(u.b)].filter((n): n is number => n != null)
    return ns.length ? Math.min(...ns) : null
  }
  for (const mitad of [0, 1] as const) {
    const inicio = mitad * partidosPorMitad
    const libres = Array.from({ length: partidosPorMitad }, (_, i) => inicio + i)
    const unidades = unidadesPorMitad[mitad]
    const sembradas = unidades.filter(u => semillaPrincipal(u) != null)
      .sort((a, b) => semillaPrincipal(a)! - semillaPrincipal(b)! || claveCupo(a.a).localeCompare(claveCupo(b.a)))
    for (const unidad of sembradas) {
      const numero = semillaPrincipal(unidad)!
      const objetivo = numero <= tam ? Math.floor(posicionCanonica(numero) / 2) : inicio
      libres.sort((a, b) => {
        const distancia = (orden: number) => {
          let x = orden
          let y = objetivo
          let pasos = 0
          while (x !== y && pasos < 16) {
            x = Math.floor(x / 2)
            y = Math.floor(y / 2)
            pasos++
          }
          return pasos
        }
        return distancia(a) - distancia(b) || Math.abs(a - objetivo) - Math.abs(b - objetivo) || a - b
      })
      const orden = libres.shift()
      if (orden != null) asignadas.set(orden, unidad)
    }
    const restantes = unidades.filter(u => !sembradas.includes(u))
      .sort((a, b) => claveCupo(a.a).localeCompare(claveCupo(b.a)))
    libres.sort((a, b) => a - b)
    restantes.forEach((u, i) => asignadas.set(libres[i], u))
  }

  return [...asignadas.entries()].sort(([a], [b]) => a - b).map(([orden, u]) => ({
    jugadorA: u.a.jugador.id,
    jugadorB: u.b?.jugador.id ?? null,
    ganador: u.b ? null : u.a.jugador.id,
    fase,
    orden,
  }))
}

export function calcularTamanoBracket(numClasificados: number): number {
  let tam = 2
  while (tam < numClasificados) tam *= 2
  return tam
}

export function determinarFaseInicial(tamanoBracket: number): FaseOrden {
  if (tamanoBracket <= 2) return 'final'
  if (tamanoBracket <= 4) return 'semis'
  if (tamanoBracket <= 8) return 'cuartos'
  if (tamanoBracket <= 16) return '8vos'
  if (tamanoBracket <= 32) return '16vos'
  return '32vos'
}

export function siguienteFase(faseActual: FaseOrden): FaseOrden | null {
  const idx = CONFIG.FASES_ORDEN.indexOf(faseActual)
  if (idx < 0 || idx >= CONFIG.FASES_ORDEN.length - 1) return null
  return CONFIG.FASES_ORDEN[idx + 1]
}

export function generarBracketEspejo(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): PartidoGenerado[] {
  const total = primeros.length + segundos.length
  if (total < 2) return []
  const tam = calcularTamanoBracket(total)
  const faseInicialNueva = determinarFaseInicial(tam)
  if (primeros.length === segundos.length && primeros.length >= 2) {
    return construirBracketPorGrupos(primeros, segundos, semilla1Id, semilla2Id)
  }
  return construirBracketDesdePosiciones(
    posicionarCuposEspejo(primeros, segundos, semilla1Id, semilla2Id),
    faseInicialNueva,
  )
}

// Un solo motor de armado para cualquier cantidad de clasificados. Los BYEs los
// coloca el sembrado estándar en los sembrados más débiles.
export function generarBracketConAvance(
  primeros: JugadorTorneo[],
  segundos: JugadorTorneo[],
  semilla1Id?: string | null,
  semilla2Id?: string | null,
): PartidoGenerado[] {
  return generarBracketEspejo(primeros, segundos, semilla1Id, semilla2Id)
}

// ─── Llaves incrementales ────────────────────────────────────────────────────
// El cuadro tiene tamaño fijo desde que se conocen los grupos (2 clasificados por
// grupo), así que su forma y la posición de cada cupo se pueden calcular antes de
// que terminen los grupos. Cada cupo se identifica por (grupoIdx, pos) y se va
// rellenando con el jugador real apenas ese grupo termina. Reutiliza el mismo
// sembrado que `generarBracketConAvance` (cabezas de serie en mitades opuestas).

export interface LlaveSlot { grupoIdx: number; pos: 1 | 2 }
export interface LlaveMatch { orden: number; a: LlaveSlot | null; b: LlaveSlot | null }
export interface LlavesLayout { faseInicial: FaseOrden; matches: LlaveMatch[] }

export function construirLlavesLayoutNumerado(
  numGrupos: number,
  cabezas: readonly CabezaSerieNumerada[] = [],
  gruposListos: number[] = [],
): LlavesLayout {
  const primeros = Array.from({ length: numGrupos }, (_, i) => ({ id: `${i}:1`, nombre: '' }))
  const segundos = Array.from({ length: numGrupos }, (_, i) => ({ id: `${i}:2`, nombre: '' }))
  const cabezasValidas = cabezas
    .filter(c => Number.isInteger(c.numero) && c.numero > 0 && c.grupoIdx >= 0 && c.grupoIdx < numGrupos && (c.pos === 1 || c.pos === 2))
    .sort((a, b) => a.numero - b.numero || a.grupoIdx - b.grupoIdx || a.pos - b.pos)
    .filter((c, i, arr) => arr.findIndex(x => x.numero === c.numero || (x.grupoIdx === c.grupoIdx && x.pos === c.pos)) === i)
  const semillas = cabezasValidas.map(c => ({ jugadorId: `${c.grupoIdx}:${c.pos}`, numero: c.numero }))
  const bracket = construirBracketPorGruposNumerado(primeros, segundos, semillas, new Set(gruposListos))
  const parse = (id: string | null | undefined): LlaveSlot | null => {
    if (!id) return null
    const [g, p] = id.split(':')
    return { grupoIdx: Number(g), pos: Number(p) as 1 | 2 }
  }
  return {
    faseInicial: (bracket[0]?.fase as FaseOrden) ?? 'final',
    matches: bracket.map(p => ({ orden: p.orden, a: parse(p.jugadorA), b: parse(p.jugadorB) })),
  }
}

export function construirLlavesLayout(
  numGrupos: number,
  cabeza1?: number | LlaveSlot | null,
  cabeza2?: number | LlaveSlot | null,
  gruposListos: number[] = [],
): LlavesLayout {
  const normalizar = (cabeza?: number | LlaveSlot | null): LlaveSlot | null => {
    if (cabeza == null) return null
    return typeof cabeza === 'number' ? { grupoIdx: cabeza, pos: 1 } : cabeza
  }
  const slot1 = normalizar(cabeza1)
  const slot2 = normalizar(cabeza2)
  const cabezas: CabezaSerieNumerada[] = []
  if (slot1) cabezas.push({ numero: 1, ...slot1 })
  if (slot2 && (!slot1 || slot2.grupoIdx !== slot1.grupoIdx || slot2.pos !== slot1.pos)) {
    cabezas.push({ numero: 2, ...slot2 })
  }
  return construirLlavesLayoutNumerado(numGrupos, cabezas, gruposListos)
}

export function generarSiguienteFase(
  ganadores: JugadorTorneo[],
  faseActual: FaseOrden,
  _semilla1Id?: string | null,
  _semilla2Id?: string | null,
): PartidoGenerado[] {
  const fase = siguienteFase(faseActual)
  if (!fase) return []
  // El cuadro ya iniciado conserva su camino: ganador llave 1 vs ganador llave 2,
  // ganador llave 3 vs ganador llave 4, etc.
  const partidos: PartidoGenerado[] = []
  for (let i = 0; i < ganadores.length; i += 2) {
    const a = ganadores[i]
    const b = ganadores[i + 1]
    if (!a) continue
    partidos.push({
      jugadorA: a.id,
      jugadorB: b?.id ?? null,
      ganador: b ? null : a.id,
      fase,
      orden: partidos.length,
    })
  }
  return partidos
}
