/** Lógica de marcador tenis de mesa (perfil técnico). */

export type Lado = 'a' | 'b'
export type FormatoPartido = 'bo3' | 'bo5' | 'bo7'
export type EstadoPartido = 'preparacion' | 'en_curso' | 'pausado' | 'finalizado'
export type PosicionMesa = 'izquierda' | 'derecha'
export type SorteoEleccion = 'servicio' | 'lado'
export type TimerModo = 'cronometro' | 'cuenta_atras'

export type TarjetasLado = {
  blanca: boolean
  amarilla: number
  roja: number
}

export type SorteoPartido = {
  ganador: Lado
  ganador_elige: SorteoEleccion
  /** Si el ganador eligió lado: izquierda | derecha donde empieza el ganador. */
  lado_ganador?: PosicionMesa
  /** Si el ganador eligió servicio: lado físico del perdedor. */
  lado_perdedor?: PosicionMesa
  /** Si el ganador eligió lado: saque | recepcion del perdedor. */
  perdedor_saque?: 'saque' | 'recepcion'
  saque_inicial: Lado
}

export type PartidoTecnico = {
  id: string
  club_id: string
  titulo: string
  ronda: string | null
  jugador_a_id: string | null
  jugador_b_id: string | null
  nombre_a: string
  nombre_b: string
  formato: FormatoPartido
  estado: EstadoPartido
  puntos_a: number
  puntos_b: number
  games_a: number
  games_b: number
  juego_actual: number
  timer_segundos: number
  timer_corriendo: boolean
  timer_inicio: string | null
  timer_modo: TimerModo
  timer_limite_segundos: number | null
  tarjetas_a: TarjetasLado
  tarjetas_b: TarjetasLado
  challenge_a: number
  challenge_b: number
  challenge_max: number
  ganador_lado: Lado | null
  notas: string | null
  historial_sets?: Array<[number, number]>
  sorteo: SorteoPartido | Record<string, never>
  sorteo_completo: boolean
  lado_mesa_a: PosicionMesa
  lado_mesa_b: PosicionMesa
  saque_inicial_lado: Lado | null
  cambio_lado_deciding_hecho: boolean
}

export type PartidoEvento = {
  id: string
  tipo: string
  lado: Lado | null
  detalle: Record<string, unknown>
  creado_en: string
}

export const FORMATO_LABEL: Record<FormatoPartido, string> = {
  bo3: 'Al mejor de 3',
  bo5: 'Al mejor de 5',
  bo7: 'Al mejor de 7',
}

export function gamesParaGanar(formato: FormatoPartido): number {
  if (formato === 'bo3') return 2
  if (formato === 'bo7') return 4
  return 3
}

export function tarjetasDefault(): TarjetasLado {
  return { blanca: false, amarilla: 0, roja: 0 }
}

export function parseTarjetas(raw: unknown): TarjetasLado {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Partial<TarjetasLado>
  return {
    blanca: Boolean(t.blanca),
    amarilla: Math.max(0, Number(t.amarilla) || 0),
    roja: Math.max(0, Number(t.roja) || 0),
  }
}

export function parseSorteo(raw: unknown): SorteoPartido | Record<string, never> {
  if (!raw || typeof raw !== 'object') return {}
  const s = raw as Partial<SorteoPartido>
  if (s.ganador !== 'a' && s.ganador !== 'b') return {}
  if (s.ganador_elige !== 'servicio' && s.ganador_elige !== 'lado') return {}
  if (s.saque_inicial !== 'a' && s.saque_inicial !== 'b') return {}
  return s as SorteoPartido
}

export function parsePosicionMesa(raw: unknown, fallback: PosicionMesa): PosicionMesa {
  return raw === 'derecha' ? 'derecha' : raw === 'izquierda' ? 'izquierda' : fallback
}

/** Regla ITTF simplificada: 11 puntos, diferencia de 2. */
export function ganoJuego(puntosGanador: number, puntosPerdedor: number): boolean {
  if (puntosGanador < 11) return false
  return puntosGanador - puntosPerdedor >= 2
}

export function formatearTimer(segundos: number): string {
  const s = Math.max(0, Math.floor(segundos))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export function segundosTranscurridos(
  p: Pick<PartidoTecnico, 'timer_segundos' | 'timer_corriendo' | 'timer_inicio'>,
): number {
  if (!p.timer_corriendo || !p.timer_inicio) return p.timer_segundos
  const extra = Math.floor((Date.now() - new Date(p.timer_inicio).getTime()) / 1000)
  return p.timer_segundos + Math.max(0, extra)
}

export function segundosVisibles(
  p: Pick<PartidoTecnico, 'timer_segundos' | 'timer_corriendo' | 'timer_inicio' | 'timer_modo' | 'timer_limite_segundos'>,
): number {
  const transcurrido = segundosTranscurridos(p)
  if (p.timer_modo === 'cuenta_atras' && p.timer_limite_segundos != null) {
    return Math.max(0, p.timer_limite_segundos - transcurrido)
  }
  return transcurrido
}

export function timerAgotado(
  p: Pick<PartidoTecnico, 'timer_segundos' | 'timer_corriendo' | 'timer_inicio' | 'timer_modo' | 'timer_limite_segundos'>,
): boolean {
  return p.timer_modo === 'cuenta_atras'
    && p.timer_limite_segundos != null
    && p.timer_corriendo
    && segundosVisibles(p) <= 0
}

export function esSetDecisivo(
  p: Pick<PartidoTecnico, 'games_a' | 'games_b' | 'formato'>,
): boolean {
  const meta = gamesParaGanar(p.formato)
  return p.games_a === meta - 1 && p.games_b === meta - 1
}

export function debeCambiarLadoDeciding(
  p: Pick<PartidoTecnico, 'games_a' | 'games_b' | 'formato' | 'cambio_lado_deciding_hecho' | 'puntos_a' | 'puntos_b'>,
): boolean {
  if (!esSetDecisivo(p)) return false
  if (p.cambio_lado_deciding_hecho) return false
  return p.puntos_a >= 5 || p.puntos_b >= 5
}

export function intercambiarLadosMesa(
  p: Pick<PartidoTecnico, 'lado_mesa_a' | 'lado_mesa_b'>,
): Pick<PartidoTecnico, 'lado_mesa_a' | 'lado_mesa_b'> {
  return {
    lado_mesa_a: p.lado_mesa_a === 'izquierda' ? 'derecha' : 'izquierda',
    lado_mesa_b: p.lado_mesa_b === 'izquierda' ? 'derecha' : 'izquierda',
  }
}

export function opuestoPosicion(pos: PosicionMesa): PosicionMesa {
  return pos === 'izquierda' ? 'derecha' : 'izquierda'
}

export function construirSorteo(params: {
  ganador: Lado
  ganador_elige: SorteoEleccion
  lado_ganador?: PosicionMesa
  lado_perdedor?: PosicionMesa
  perdedor_saque?: 'saque' | 'recepcion'
}): {
  sorteo: SorteoPartido
  lado_mesa_a: PosicionMesa
  lado_mesa_b: PosicionMesa
  saque_inicial_lado: Lado
} {
  const perdedor: Lado = params.ganador === 'a' ? 'b' : 'a'
  let ladoA: PosicionMesa = 'izquierda'
  let ladoB: PosicionMesa = 'derecha'
  let saqueInicial: Lado

  if (params.ganador_elige === 'servicio') {
    saqueInicial = params.ganador
    const ladoPerdedor = params.lado_perdedor ?? 'derecha'
    if (params.ganador === 'a') {
      ladoB = ladoPerdedor
      ladoA = opuestoPosicion(ladoPerdedor)
    } else {
      ladoA = ladoPerdedor
      ladoB = opuestoPosicion(ladoPerdedor)
    }
  } else {
    const ladoG = params.lado_ganador ?? 'izquierda'
    if (params.ganador === 'a') {
      ladoA = ladoG
      ladoB = opuestoPosicion(ladoG)
    } else {
      ladoB = ladoG
      ladoA = opuestoPosicion(ladoG)
    }
    const perdedorSaque = params.perdedor_saque ?? 'saque'
    saqueInicial = perdedorSaque === 'saque' ? perdedor : params.ganador
  }

  const sorteo: SorteoPartido = {
    ganador: params.ganador,
    ganador_elige: params.ganador_elige,
    saque_inicial: saqueInicial,
    ...(params.ganador_elige === 'lado'
      ? { lado_ganador: params.lado_ganador ?? 'izquierda', perdedor_saque: params.perdedor_saque ?? 'saque' }
      : { lado_perdedor: params.lado_perdedor ?? 'derecha' }),
  }

  return { sorteo, lado_mesa_a: ladoA, lado_mesa_b: ladoB, saque_inicial_lado: saqueInicial }
}

export function resumenSorteo(
  p: Pick<PartidoTecnico, 'sorteo' | 'nombre_a' | 'nombre_b' | 'lado_mesa_a' | 'lado_mesa_b'>,
): { a: string; b: string } | null {
  const s = p.sorteo as SorteoPartido
  if (!s.ganador || !s.ganador_elige || !s.saque_inicial) return null
  const perdedor: Lado = s.ganador === 'a' ? 'b' : 'a'

  const ladoTxt = (l: Lado) => (l === 'a' ? p.lado_mesa_a : p.lado_mesa_b)
  const saqueTxt = (l: Lado) => (l === s.saque_inicial ? 'Saque inicial' : 'Recepción inicial')

  if (s.ganador_elige === 'servicio') {
    return {
      a: `A: ${s.ganador === 'a' ? 'Eligió servicio · ' : ''}${saqueTxt('a')} · Lado ${ladoTxt('a')}`,
      b: `B: ${s.ganador === 'b' ? 'Eligió servicio · ' : ''}${saqueTxt('b')} · Lado ${ladoTxt('b')}`,
    }
  }

  return {
    a: `A: ${s.ganador === 'a' ? 'Eligió lado · ' : ''}${saqueTxt('a')} · Lado ${ladoTxt('a')}`,
    b: `B: ${s.ganador === 'b' ? 'Eligió lado · ' : ''}${saqueTxt('b')} · Lado ${ladoTxt('b')}`,
  }
}

export function calcularSaqueActual(
  puntos_a: number,
  puntos_b: number,
  saque_inicial_lado: Lado | null,
): Lado | null {
  if (!saque_inicial_lado) return null
  const total = puntos_a + puntos_b
  if (puntos_a >= 10 && puntos_b >= 10) {
    return total % 2 === 0 ? saque_inicial_lado : (saque_inicial_lado === 'a' ? 'b' : 'a')
  }
  const bloques = Math.floor(total / 2)
  return bloques % 2 === 0 ? saque_inicial_lado : (saque_inicial_lado === 'a' ? 'b' : 'a')
}

/** En individuales, quien recibió primero en el set anterior sirve primero en el siguiente. */
export function saqueInicialDelJuego(
  saqueInicialPartido: Lado | null,
  juegoActual: number,
): Lado | null {
  if (!saqueInicialPartido) return null
  if (juegoActual % 2 === 1) return saqueInicialPartido
  return saqueInicialPartido === 'a' ? 'b' : 'a'
}

export function jugadorEnPosicion(
  p: Pick<PartidoTecnico, 'lado_mesa_a' | 'lado_mesa_b' | 'nombre_a' | 'nombre_b' | 'puntos_a' | 'puntos_b' | 'tarjetas_a' | 'tarjetas_b'>,
  pos: PosicionMesa,
): { lado: Lado; nombre: string; puntos: number; tarjetas: TarjetasLado } {
  if (p.lado_mesa_a === pos) {
    return { lado: 'a', nombre: p.nombre_a, puntos: p.puntos_a, tarjetas: p.tarjetas_a }
  }
  return { lado: 'b', nombre: p.nombre_b, puntos: p.puntos_b, tarjetas: p.tarjetas_b }
}

export function textoAvisoCambioLado(motivo: 'fin_set' | 'punto_5_set_decisivo'): string {
  if (motivo === 'fin_set') {
    return '¡Cambio de lado! Terminó el set — los jugadores se intercambian de extremo.'
  }
  return '¡Cambio de lado! Set decisivo: algún jugador llegó a 5 puntos (regla ITTF).'
}

const EVENTO_LABEL: Record<string, string> = {
  punto: 'Punto',
  deshacer_punto: 'Punto deshecho',
  fin_juego: 'Fin de juego',
  fin_partido: 'Fin de partido',
  tarjeta: 'Tarjeta',
  challenge: 'Challenge',
  pause: 'Pausa',
  resume: 'Reanudación',
  inicio: 'Inicio del partido',
  ajuste: 'Ajuste',
  cambio_lado: 'Cambio de lado',
  sorteo: 'Sorteo',
}

export function labelEvento(
  ev: Pick<PartidoEvento, 'tipo' | 'lado' | 'detalle'>,
  partido: Pick<PartidoTecnico, 'nombre_a' | 'nombre_b'>,
): string {
  const base = EVENTO_LABEL[ev.tipo] ?? ev.tipo
  const jugador = ev.lado === 'a' ? partido.nombre_a : ev.lado === 'b' ? partido.nombre_b : null
  const d = ev.detalle ?? {}

  if (ev.tipo === 'cambio_lado') {
    const motivo = String(d.motivo ?? '')
    if (motivo === 'punto_5_set_decisivo') return `${base} · set decisivo (5 pts)`
    if (motivo === 'fin_set') return `${base} · fin de set`
    return base
  }
  if (ev.tipo === 'sorteo') return `${base} registrado`
  if (ev.tipo === 'tarjeta') {
    const campo = String(d.campo ?? '')
    const map: Record<string, string> = { blanca: 'blanca', amarilla: 'amarilla', roja: 'roja' }
    return `${base} ${map[campo] ?? campo}${jugador ? ` · ${jugador}` : ''}`
  }
  if (ev.tipo === 'punto' || ev.tipo === 'deshacer_punto' || ev.tipo === 'challenge') {
    return jugador ? `${base} · ${jugador}` : base
  }
  if (ev.tipo === 'fin_juego' && Array.isArray(d.setCompletado)) {
    const [pa, pb] = d.setCompletado as [number, number]
    return `${base} ${pa}-${pb}${jugador ? ` · ${jugador}` : ''}`
  }
  if (ev.tipo === 'fin_partido' && ev.lado) {
    return `${base} · gana ${jugador ?? ev.lado}`
  }
  return jugador ? `${base} · ${jugador}` : base
}

export type ResultadoPunto = {
  puntos_a: number
  puntos_b: number
  games_a: number
  games_b: number
  juego_actual: number
  estado: EstadoPartido
  ganador_lado: Lado | null
  finJuego: boolean
  finPartido: boolean
  ladoJuego?: Lado
  setCompletado?: [number, number]
  cambioLado?: { motivo: 'fin_set' | 'punto_5_set_decisivo' }
}

export function aplicarPunto(
  p: Pick<PartidoTecnico, 'puntos_a' | 'puntos_b' | 'games_a' | 'games_b' | 'juego_actual' | 'formato' | 'estado' | 'ganador_lado' | 'cambio_lado_deciding_hecho'>,
  lado: Lado,
): ResultadoPunto {
  if (p.estado === 'finalizado') {
    return {
      puntos_a: p.puntos_a,
      puntos_b: p.puntos_b,
      games_a: p.games_a,
      games_b: p.games_b,
      juego_actual: p.juego_actual,
      estado: p.estado,
      ganador_lado: p.ganador_lado,
      finJuego: false,
      finPartido: false,
    }
  }

  let puntos_a = p.puntos_a + (lado === 'a' ? 1 : 0)
  let puntos_b = p.puntos_b + (lado === 'b' ? 1 : 0)
  let games_a = p.games_a
  let games_b = p.games_b
  let juego_actual = p.juego_actual
  let estado: EstadoPartido = p.estado === 'preparacion' ? 'en_curso' : p.estado
  let ganador_lado: Lado | null = null
  let finJuego = false
  let finPartido = false
  let ladoJuego: Lado | undefined
  let setCompletado: [number, number] | undefined
  let cambioLado: ResultadoPunto['cambioLado']

  const meta = gamesParaGanar(p.formato)

  if (ganoJuego(puntos_a, puntos_b)) {
    finJuego = true
    ladoJuego = 'a'
    setCompletado = [puntos_a, puntos_b]
    games_a++
    puntos_a = 0
    puntos_b = 0
    juego_actual++
  } else if (ganoJuego(puntos_b, puntos_a)) {
    finJuego = true
    ladoJuego = 'b'
    setCompletado = [puntos_a, puntos_b]
    games_b++
    puntos_a = 0
    puntos_b = 0
    juego_actual++
  }

  if (games_a >= meta) {
    finPartido = true
    ganador_lado = 'a'
    estado = 'finalizado'
  } else if (games_b >= meta) {
    finPartido = true
    ganador_lado = 'b'
    estado = 'finalizado'
  }

  if (finJuego && !finPartido) {
    cambioLado = { motivo: 'fin_set' }
  } else if (!finJuego && debeCambiarLadoDeciding({
    games_a,
    games_b,
    formato: p.formato,
    cambio_lado_deciding_hecho: p.cambio_lado_deciding_hecho,
    puntos_a,
    puntos_b,
  })) {
    cambioLado = { motivo: 'punto_5_set_decisivo' }
  }

  return {
    puntos_a,
    puntos_b,
    games_a,
    games_b,
    juego_actual: finPartido ? Math.max(1, juego_actual - 1) : juego_actual,
    estado,
    ganador_lado,
    finJuego,
    finPartido,
    ladoJuego,
    setCompletado,
    cambioLado,
  }
}

export function quitarPunto(
  p: Pick<PartidoTecnico, 'puntos_a' | 'puntos_b' | 'estado' | 'ganador_lado'>,
  lado: Lado,
): Partial<PartidoTecnico> | null {
  if (p.estado === 'finalizado') return null
  if (lado === 'a' && p.puntos_a <= 0) return null
  if (lado === 'b' && p.puntos_b <= 0) return null
  return {
    puntos_a: lado === 'a' ? p.puntos_a - 1 : p.puntos_a,
    puntos_b: lado === 'b' ? p.puntos_b - 1 : p.puntos_b,
    estado: p.estado === 'preparacion' ? 'en_curso' : p.estado,
  }
}

export function marcadorResumen(partido: Pick<PartidoTecnico, 'games_a' | 'games_b' | 'historial_sets' | 'estado' | 'ganador_lado' | 'nombre_a' | 'nombre_b'>): string {
  const sets = partido.historial_sets ?? []
  const txt = `${partido.games_a}-${partido.games_b}`
  if (partido.estado === 'finalizado' && partido.ganador_lado) {
    const g = partido.ganador_lado === 'a' ? partido.nombre_a : partido.nombre_b
    return `${txt} · gana ${g.split(' ')[0]}`
  }
  if (sets.length) {
    return `${txt} (${sets.map(([a, b]) => `${a}-${b}`).join(', ')})`
  }
  return txt
}
