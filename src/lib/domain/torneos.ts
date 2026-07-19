import { CONFIG, FaseOrden } from '../config'

export interface JugadorTorneo {
  id: string
  nombre: string
}

export interface GrupoStats {
  jugadorId: string
  jugador: JugadorTorneo
  pts: number
  pg: number
  pp: number
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

export function calcularNumGrupos(
  numJugadores: number,
  jugadoresPorGrupo: number = CONFIG.TORNEO_JUGADORES_POR_GRUPO,
): number {
  return Math.max(2, Math.ceil(numJugadores / jugadoresPorGrupo))
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

export function calcularStatsGrupo(
  jugadores: JugadorTorneo[],
  partidos: Array<{
    jugadorA: string
    jugadorB: string
    ganador: string | null
  }>,
): { stats: GrupoStats[]; hayTripleEmpate: boolean } {
  const statsMap: Record<string, GrupoStats> = {}
  for (const j of jugadores) {
    statsMap[j.id] = {
      jugadorId: j.id,
      jugador: j,
      pts: 0,
      pg: 0,
      pp: 0,
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
  }

  const ordenOriginal = new Map(jugadores.map((j, i) => [j.id, i]))
  const porPuntos = new Map<number, GrupoStats[]>()
  for (const stat of Object.values(statsMap)) {
    const grupo = porPuntos.get(stat.pts) ?? []
    grupo.push(stat)
    porPuntos.set(stat.pts, grupo)
  }

  const ordenados: GrupoStats[] = []
  for (const puntos of [...porPuntos.keys()].sort((a, b) => b - a)) {
    const empatados = porPuntos.get(puntos) ?? []
    empatados.sort((a, b) => {
      if (empatados.length === 2) {
        const directo = partidos.find(p =>
          (p.jugadorA === a.jugadorId && p.jugadorB === b.jugadorId) ||
          (p.jugadorA === b.jugadorId && p.jugadorB === a.jugadorId),
        )
        if (directo?.ganador === a.jugadorId) return -1
        if (directo?.ganador === b.jugadorId) return 1
      }
      return (ordenOriginal.get(a.jugadorId) ?? 0) - (ordenOriginal.get(b.jugadorId) ?? 0)
    })
    ordenados.push(...empatados)
  }

  const puntosCorte = ordenados[1]?.pts
  const empatadosEnCorte = puntosCorte == null ? [] : ordenados.filter(j => j.pts === puntosCorte)
  const hayTripleEmpate = empatadosEnCorte.length >= 3

  return { stats: ordenados, hayTripleEmpate }
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
        // ponytail: 1ros tienen prioridad de BYE sobre 2dos
        const byePrimeros = Math.min(vaciosMitad, primerosMitad.length)
        const byeSegundos = vaciosMitad - byePrimeros
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
    // ponytail: 1ros tienen prioridad de BYE; 2dos solo si sobran
    const byePrimeros = Math.min(vaciosMitad, primerosMitad.length)
    const byeSegundos = vaciosMitad - byePrimeros
    if (byePrimeros < 0 || byeSegundos < 0) return []

    const primerosOrdenados = ordenarPrioridad(primerosMitad)
    const segundosOrdenados = ordenarPrioridad(segundosMitad)
    const primerosBye = primerosOrdenados.slice(0, byePrimeros)
    const segundosBye = segundosOrdenados.slice(0, byeSegundos)
    const primerosJuegan = primerosOrdenados.slice(byePrimeros)
    const segundosPool = [...segundosOrdenados.slice(byeSegundos)]
    if ((primerosJuegan.length + segundosPool.length) % 2 !== 0) return []

    // 1ros vs 2dos primero, luego 2dos vs 2dos con los restantes
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
    while (segundosPool.length >= 2) {
      parejas.push({ a: segundosPool.shift()!, b: segundosPool.shift()! })
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
