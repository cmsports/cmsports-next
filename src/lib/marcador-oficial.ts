/** Marcador punto a punto para torneo oficial (sin depender del módulo técnico). */

export type Lado = 'a' | 'b'
export type FormatoPartido = 'bo3' | 'bo5' | 'bo7'

export type EstadoMarcador = {
  puntos_a: number
  puntos_b: number
  games_a: number
  games_b: number
  juego_actual: number
  historial_sets: Array<[number, number]>
  ganador_lado: Lado | null
  finalizado: boolean
}

export function gamesParaGanar(formato: FormatoPartido): number {
  if (formato === 'bo3') return 2
  if (formato === 'bo7') return 4
  return 3
}

export function ganoJuego(puntosGanador: number, puntosPerdedor: number): boolean {
  if (puntosGanador < 11) return false
  return puntosGanador - puntosPerdedor >= 2
}

export function estadoInicial(): EstadoMarcador {
  return {
    puntos_a: 0,
    puntos_b: 0,
    games_a: 0,
    games_b: 0,
    juego_actual: 1,
    historial_sets: [],
    ganador_lado: null,
    finalizado: false,
  }
}

export function aplicarPunto(
  estado: EstadoMarcador,
  lado: Lado,
  formato: FormatoPartido,
): EstadoMarcador {
  if (estado.finalizado) return estado

  let puntos_a = estado.puntos_a + (lado === 'a' ? 1 : 0)
  let puntos_b = estado.puntos_b + (lado === 'b' ? 1 : 0)
  let games_a = estado.games_a
  let games_b = estado.games_b
  let juego_actual = estado.juego_actual
  const historial = [...estado.historial_sets]
  let ganador_lado: Lado | null = null
  let finalizado = false

  const meta = gamesParaGanar(formato)

  if (ganoJuego(puntos_a, puntos_b)) {
    historial.push([puntos_a, puntos_b])
    games_a++
    puntos_a = 0
    puntos_b = 0
    juego_actual++
  } else if (ganoJuego(puntos_b, puntos_a)) {
    historial.push([puntos_a, puntos_b])
    games_b++
    puntos_a = 0
    puntos_b = 0
    juego_actual++
  }

  if (games_a >= meta) {
    ganador_lado = 'a'
    finalizado = true
  } else if (games_b >= meta) {
    ganador_lado = 'b'
    finalizado = true
  }

  return {
    puntos_a,
    puntos_b,
    games_a,
    games_b,
    juego_actual: finalizado ? Math.max(1, juego_actual - 1) : juego_actual,
    historial_sets: historial,
    ganador_lado,
    finalizado,
  }
}

export function deshacerPunto(estado: EstadoMarcador, lado: Lado): EstadoMarcador | null {
  if (estado.finalizado) return null
  if (lado === 'a' && estado.puntos_a <= 0) return null
  if (lado === 'b' && estado.puntos_b <= 0) return null
  return {
    ...estado,
    puntos_a: lado === 'a' ? estado.puntos_a - 1 : estado.puntos_a,
    puntos_b: lado === 'b' ? estado.puntos_b - 1 : estado.puntos_b,
  }
}
