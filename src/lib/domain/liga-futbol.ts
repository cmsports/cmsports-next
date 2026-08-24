// Fixture de ligas de fútbol: round-robin por rondas (método del círculo).
//
// A diferencia de la Liga TDM (jugadores contra mesas/horarios con un solver
// de restricciones), acá cada "ronda" del round-robin YA ES una fecha válida:
// por construcción ningún equipo repite dentro de la misma ronda. No hace
// falta un solver — solo repartir los partidos de cada ronda en los horarios
// disponibles.

export interface PartidoFixture {
  equipoLocalId: string
  equipoVisitaId: string
  ronda: number // 1-indexed
  grupoId?: string
}

const BYE = '__bye__'

/**
 * Round-robin de una rueda (método del círculo): fija el primer equipo y
 * rota el resto. Con n impar se agrega un "bye" (descansa un equipo por ronda).
 */
function circleMethod(equipoIds: string[]): string[][] {
  const ids = [...equipoIds]
  if (ids.length % 2 !== 0) ids.push(BYE)
  const n = ids.length
  const rondas: string[][] = []

  const fijo = ids[0]
  let resto = ids.slice(1)

  for (let r = 0; r < n - 1; r++) {
    const ronda = [fijo, ...resto]
    rondas.push(ronda)
    resto = [resto[resto.length - 1], ...resto.slice(0, -1)]
  }

  return rondas
}

/**
 * Genera el fixture completo de un grupo de equipos (o de toda la liga si
 * no hay grupos). Alterna local/visita entre rondas para equilibrar.
 * Con ruedas=2 repite el round-robin invirtiendo local/visita (ida/vuelta).
 */
export function generarFixtureEquipos(equipoIds: string[], ruedas: number, grupoId?: string): PartidoFixture[] {
  if (equipoIds.length < 2) return []

  const rondasIda = circleMethod(equipoIds)
  const partidos: PartidoFixture[] = []
  const numRondas = rondasIda.length

  for (let r = 0; r < numRondas; r++) {
    const ronda = rondasIda[r]
    const mitad = ronda.length / 2
    for (let i = 0; i < mitad; i++) {
      const a = ronda[i]
      const b = ronda[ronda.length - 1 - i]
      if (a === BYE || b === BYE) continue
      // Alterna quién es local según la ronda para no repetir siempre el mismo patrón
      const [local, visita] = r % 2 === 0 ? [a, b] : [b, a]
      partidos.push({ equipoLocalId: local, equipoVisitaId: visita, ronda: r + 1, grupoId })
    }
  }

  if (ruedas >= 2) {
    for (let r = 0; r < numRondas; r++) {
      const ronda = rondasIda[r]
      const mitad = ronda.length / 2
      for (let i = 0; i < mitad; i++) {
        const a = ronda[i]
        const b = ronda[ronda.length - 1 - i]
        if (a === BYE || b === BYE) continue
        // Vuelta: se invierte el local/visita de la ida
        const [local, visita] = r % 2 === 0 ? [b, a] : [a, b]
        partidos.push({ equipoLocalId: local, equipoVisitaId: visita, ronda: numRondas + r + 1, grupoId })
      }
    }
  }

  return partidos
}

/** Combina el fixture de varios grupos alineando sus rondas (ronda 1 de todos los grupos cae en la misma fecha). */
export function generarFixtureGrupos(grupos: { id: string; equipoIds: string[] }[], ruedas: number): PartidoFixture[] {
  return grupos.flatMap(g => generarFixtureEquipos(g.equipoIds, ruedas, g.id))
}

/** Cuántas fechas (rondas) necesita un fixture, considerando el grupo con más rondas. */
export function totalFechas(partidos: PartidoFixture[]): number {
  return partidos.reduce((max, p) => Math.max(max, p.ronda), 0)
}

/** Reparte los horarios disponibles de forma cíclica entre los partidos de una misma fecha. */
export function asignarHorarios<T>(partidosDeFecha: T[], horarios: string[]): (T & { hora: string | null })[] {
  if (horarios.length === 0) return partidosDeFecha.map(p => ({ ...p, hora: null }))
  return partidosDeFecha.map((p, i) => ({ ...p, hora: horarios[i % horarios.length] }))
}

/** Suma días a una fecha ISO (YYYY-MM-DD) sin líos de timezone. */
export function sumarDias(fechaISO: string, dias: number): string {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + dias)
  return dt.toISOString().slice(0, 10)
}

/**
 * Recalcula el marcador de un partido a partir de los goles cargados.
 * Un autogol lo hace un jugador de un equipo pero el gol cuenta para el rival.
 */
export function calcularMarcador(
  goles: { equipo_id: string; tipo: string }[],
  equipoLocalId: string,
  equipoVisitaId: string,
): { golesLocal: number; golesVisita: number } {
  let golesLocal = 0
  let golesVisita = 0
  for (const g of goles) {
    const paraLocal = g.tipo === 'autogol' ? g.equipo_id === equipoVisitaId : g.equipo_id === equipoLocalId
    const paraVisita = g.tipo === 'autogol' ? g.equipo_id === equipoLocalId : g.equipo_id === equipoVisitaId
    if (paraLocal) golesLocal++
    else if (paraVisita) golesVisita++
  }
  return { golesLocal, golesVisita }
}

// ─── Tabla de posiciones, goleadores y tarjetas ─────────────────────────
// Todo cálculo puro a partir de partidos/goles/tarjetas ya cargados — no se
// persiste nada, se recalcula cada vez que se muestra.

export interface PartidoResultado {
  equipoLocalId: string
  equipoVisitaId: string
  golesLocal: number
  golesVisita: number
  estado: string // solo 'finalizado' y 'wo' cuentan para la tabla
  equipoWoId?: string | null
}

export interface ReglasPuntaje {
  puntosVictoria: number
  puntosEmpate: number
  puntosDerrota: number
  puntosWoPerdedor: number
}

export interface EquipoStats {
  equipoId: string
  pj: number; pg: number; pe: number; pp: number
  gf: number; gc: number; dg: number; pts: number
  ultimos5: ('V' | 'E' | 'D')[]
}

/**
 * Tabla de posiciones. Desempate: puntos → diferencia de gol → goles a favor.
 *
 * ponytail: no implementa enfrentamiento directo ni fairplay como criterios
 * de desempate adicionales (el plan los lista en 4° y 5°/6° lugar) — con
 * pts/dg/gf ya resuelve el caso normal, y esos dos casos borde son raros en
 * una liga amateur de pocos equipos. Si aparece un empate real en producción,
 * agregar acá antes de resolverlo a mano.
 */
export function calcularTablaPosiciones(
  equipoIds: string[],
  partidos: PartidoResultado[],
  reglas: ReglasPuntaje,
): EquipoStats[] {
  const stats = new Map<string, EquipoStats>(
    equipoIds.map(id => [id, { equipoId: id, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, pts: 0, ultimos5: [] }]),
  )

  function sumar(equipoId: string, resultado: 'V' | 'E' | 'D', gf: number, gc: number, pts: number) {
    const s = stats.get(equipoId)
    if (!s) return
    s.pj++
    if (resultado === 'V') s.pg++
    else if (resultado === 'E') s.pe++
    else s.pp++
    s.gf += gf
    s.gc += gc
    s.dg = s.gf - s.gc
    s.pts += pts
    s.ultimos5 = [...s.ultimos5, resultado].slice(-5)
  }

  for (const p of partidos) {
    if (p.estado !== 'finalizado' && p.estado !== 'wo') continue

    if (p.estado === 'wo' && p.equipoWoId) {
      const ganadorEsLocal = p.equipoWoId !== p.equipoLocalId
      const ganadorId = ganadorEsLocal ? p.equipoLocalId : p.equipoVisitaId
      const perdedorId = p.equipoWoId
      const golesGanador = ganadorEsLocal ? p.golesLocal : p.golesVisita
      const golesPerdedor = ganadorEsLocal ? p.golesVisita : p.golesLocal
      sumar(ganadorId, 'V', golesGanador, golesPerdedor, reglas.puntosVictoria)
      sumar(perdedorId, 'D', golesPerdedor, golesGanador, reglas.puntosWoPerdedor)
      continue
    }

    if (p.golesLocal > p.golesVisita) {
      sumar(p.equipoLocalId, 'V', p.golesLocal, p.golesVisita, reglas.puntosVictoria)
      sumar(p.equipoVisitaId, 'D', p.golesVisita, p.golesLocal, reglas.puntosDerrota)
    } else if (p.golesLocal < p.golesVisita) {
      sumar(p.equipoVisitaId, 'V', p.golesVisita, p.golesLocal, reglas.puntosVictoria)
      sumar(p.equipoLocalId, 'D', p.golesLocal, p.golesVisita, reglas.puntosDerrota)
    } else {
      sumar(p.equipoLocalId, 'E', p.golesLocal, p.golesVisita, reglas.puntosEmpate)
      sumar(p.equipoVisitaId, 'E', p.golesVisita, p.golesLocal, reglas.puntosEmpate)
    }
  }

  return [...stats.values()].sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
}

export interface GoleadorStats { jugadorId: string; equipoId: string; goles: number; penales: number }

/** Ranking de goleadores. Un autogol no suma para quien lo hizo. */
export function calcularGoleadores(goles: { jugador_id: string; equipo_id: string; tipo: string }[]): GoleadorStats[] {
  const stats = new Map<string, GoleadorStats>()
  for (const g of goles) {
    if (g.tipo === 'autogol') continue
    const s = stats.get(g.jugador_id) ?? { jugadorId: g.jugador_id, equipoId: g.equipo_id, goles: 0, penales: 0 }
    s.goles++
    if (g.tipo === 'penal') s.penales++
    stats.set(g.jugador_id, s)
  }
  return [...stats.values()].sort((a, b) => b.goles - a.goles)
}

export interface TarjetasJugador { jugadorId: string; equipoId: string; amarillas: number; rojas: number; dobleAmarilla: number }

/** Tarjetas acumuladas por jugador (roja directa y doble amarilla se cuentan aparte). */
export function calcularTarjetas(tarjetas: { jugador_id: string; equipo_id: string; tipo: string }[]): TarjetasJugador[] {
  const stats = new Map<string, TarjetasJugador>()
  for (const t of tarjetas) {
    const s = stats.get(t.jugador_id) ?? { jugadorId: t.jugador_id, equipoId: t.equipo_id, amarillas: 0, rojas: 0, dobleAmarilla: 0 }
    if (t.tipo === 'amarilla') s.amarillas++
    else if (t.tipo === 'roja') s.rojas++
    else if (t.tipo === 'doble_amarilla') s.dobleAmarilla++
    stats.set(t.jugador_id, s)
  }
  return [...stats.values()].sort((a, b) => (b.rojas + b.dobleAmarilla) - (a.rojas + a.dobleAmarilla) || b.amarillas - a.amarillas)
}

export interface FairPlayEquipo { equipoId: string; amarillas: number; rojas: number; puntos: number }

/** Tabla de fairplay por equipo: amarilla=1pt, roja/doble amarilla=3pt. Menos puntos es mejor conducta. */
export function calcularFairPlay(tarjetas: { equipo_id: string; tipo: string }[], equipoIds: string[]): FairPlayEquipo[] {
  const stats = new Map<string, FairPlayEquipo>(equipoIds.map(id => [id, { equipoId: id, amarillas: 0, rojas: 0, puntos: 0 }]))
  for (const t of tarjetas) {
    const s = stats.get(t.equipo_id)
    if (!s) continue
    if (t.tipo === 'amarilla') { s.amarillas++; s.puntos += 1 }
    else { s.rojas++; s.puntos += 3 }
  }
  return [...stats.values()].sort((a, b) => a.puntos - b.puntos)
}

// ─── Playoffs ────────────────────────────────────────────────────────────
// Soporta 2, 4 u 8 clasificados (cuartos/semifinal/final) — coincide con el
// CHECK de fase_playoff en la base. Las rondas siguientes no se pre-generan:
// se crean recién cuando se conocen los dos equipos que la juegan (ver
// avanzarGanadorPlayoff más abajo), así nunca hace falta un partido con un
// cupo "por definir".

export type FasePlayoff = 'cuartos' | 'semifinal' | 'tercer_lugar' | 'final'

/** Toma los primeros N de una tabla ya ordenada. */
export function clasificarPorTabla(tabla: EquipoStats[], n: number): string[] {
  return tabla.slice(0, n).map(t => t.equipoId)
}

/**
 * Combina los clasificados de varios grupos: todos los 1eros primero (en el
 * orden de grupos dado), luego todos los 2dos, etc. Con esto el bracket
 * siembra a los punteros de grupo separados entre sí en la primera ronda.
 */
export function clasificarPorGrupos(gruposConTabla: { tabla: EquipoStats[]; clasifican: number }[]): string[] {
  const maxClasifican = Math.max(0, ...gruposConTabla.map(g => g.clasifican))
  const resultado: string[] = []
  for (let pos = 0; pos < maxClasifican; pos++) {
    for (const g of gruposConTabla) {
      if (pos < g.clasifican && g.tabla[pos]) resultado.push(g.tabla[pos].equipoId)
    }
  }
  return resultado
}

/** Orden de siembra de bracket (1 vs 8, 4 vs 5, ... ) para que los mejores punteros no se crucen antes de la final. */
function ordenSiembra(n: number): number[] {
  let orden = [1]
  while (orden.length < n) {
    const total = orden.length * 2
    orden = orden.flatMap(x => [x, total + 1 - x])
  }
  return orden
}

export interface PartidoPlayoff {
  fase: FasePlayoff
  posicion: number // posición dentro de la fase, 0-indexed
  equipoLocalId: string
  equipoVisitaId: string
}

/** Arma la primera ronda de playoffs a partir de los clasificados (2, 4 u 8). */
export function generarBracketPlayoffs(clasificados: string[]): PartidoPlayoff[] {
  const n = clasificados.length
  const fase: FasePlayoff | null = n === 2 ? 'final' : n === 4 ? 'semifinal' : n === 8 ? 'cuartos' : null
  if (!fase) return []

  const sembrados = ordenSiembra(n).map(seed => clasificados[seed - 1])
  const partidos: PartidoPlayoff[] = []
  for (let i = 0; i < n; i += 2) {
    partidos.push({ fase, posicion: i / 2, equipoLocalId: sembrados[i], equipoVisitaId: sembrados[i + 1] })
  }
  return partidos
}

/** Empareja una lista de equipos (ganadores o perdedores, en orden de posición) para la siguiente ronda. */
export function armarSiguienteRonda(fase: FasePlayoff, equiposOrdenados: string[]): PartidoPlayoff[] {
  const partidos: PartidoPlayoff[] = []
  for (let i = 0; i < equiposOrdenados.length; i += 2) {
    if (!equiposOrdenados[i + 1]) continue
    partidos.push({ fase, posicion: i / 2, equipoLocalId: equiposOrdenados[i], equipoVisitaId: equiposOrdenados[i + 1] })
  }
  return partidos
}

export function siguienteFasePlayoff(fase: FasePlayoff): FasePlayoff | null {
  if (fase === 'cuartos') return 'semifinal'
  if (fase === 'semifinal') return 'final'
  return null
}

/**
 * Ganador de un partido ya cerrado. Si terminó empatado (estado 'finalizado'
 * con el mismo marcador) no hay forma de saber quién avanza — en fútbol eso
 * se resuelve con penales, que esta versión no registra. Devuelve null y el
 * bracket queda esperando a que el admin corrija el resultado a uno decisivo.
 */
export function ganadorPartido(p: {
  equipoLocalId: string; equipoVisitaId: string
  golesLocal: number; golesVisita: number; estado: string; equipoWoId?: string | null
}): string | null {
  if (p.estado === 'wo' && p.equipoWoId) {
    return p.equipoWoId === p.equipoLocalId ? p.equipoVisitaId : p.equipoLocalId
  }
  if (p.estado !== 'finalizado') return null
  if (p.golesLocal > p.golesVisita) return p.equipoLocalId
  if (p.golesVisita > p.golesLocal) return p.equipoVisitaId
  return null
}

export function perdedorPartido(p: Parameters<typeof ganadorPartido>[0]): string | null {
  const ganador = ganadorPartido(p)
  if (!ganador) return null
  return ganador === p.equipoLocalId ? p.equipoVisitaId : p.equipoLocalId
}
