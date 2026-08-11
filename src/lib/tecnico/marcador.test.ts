import { describe, expect, it } from 'vitest'
import {
  aplicarPunto,
  calcularSaqueActual,
  ganoJuego,
  gamesParaGanar,
  quitarPunto,
  saqueInicialDelJuego,
} from './marcador'

const base = {
  puntos_a: 0,
  puntos_b: 0,
  games_a: 0,
  games_b: 0,
  juego_actual: 1,
  formato: 'bo5' as const,
  estado: 'en_curso' as const,
  ganador_lado: null,
  cambio_lado_deciding_hecho: false,
}

describe('marcador', () => {
  it('gamesParaGanar según formato', () => {
    expect(gamesParaGanar('bo3')).toBe(2)
    expect(gamesParaGanar('bo5')).toBe(3)
    expect(gamesParaGanar('bo7')).toBe(4)
  })

  it('ganoJuego exige 11 y diferencia de 2', () => {
    expect(ganoJuego(11, 9)).toBe(true)
    expect(ganoJuego(11, 10)).toBe(false)
    expect(ganoJuego(12, 10)).toBe(true)
    expect(ganoJuego(10, 8)).toBe(false)
  })

  it('aplicarPunto cierra juego a 11-9', () => {
    const r = aplicarPunto({ ...base, puntos_a: 10, puntos_b: 9 }, 'a')
    expect(r.finJuego).toBe(true)
    expect(r.games_a).toBe(1)
    expect(r.puntos_a).toBe(0)
    expect(r.puntos_b).toBe(0)
    expect(r.juego_actual).toBe(2)
  })

  it('aplicarPunto finaliza bo5 al tercer game', () => {
    const r = aplicarPunto({ ...base, puntos_a: 10, puntos_b: 5, games_a: 2, games_b: 1, juego_actual: 4 }, 'a')
    expect(r.finPartido).toBe(true)
    expect(r.ganador_lado).toBe('a')
    expect(r.estado).toBe('finalizado')
    expect(r.games_a).toBe(3)
  })

  it('quitarPunto no baja de cero ni toca finalizado', () => {
    expect(quitarPunto(base, 'a')).toBeNull()
    expect(quitarPunto({ ...base, puntos_a: 3 }, 'a')).toEqual(
      expect.objectContaining({ puntos_a: 2, puntos_b: 0 }),
    )
    expect(quitarPunto({ ...base, puntos_a: 5, estado: 'finalizado' }, 'a')).toBeNull()
  })

  it('alterna servicio cada dos puntos y cada uno desde 10-10', () => {
    expect(calcularSaqueActual(0, 0, 'a')).toBe('a')
    expect(calcularSaqueActual(1, 0, 'a')).toBe('a')
    expect(calcularSaqueActual(1, 1, 'a')).toBe('b')
    expect(calcularSaqueActual(10, 10, 'a')).toBe('a')
    expect(calcularSaqueActual(11, 10, 'a')).toBe('b')
  })

  it('alterna quién sirve primero entre sets', () => {
    expect(saqueInicialDelJuego('a', 1)).toBe('a')
    expect(saqueInicialDelJuego('a', 2)).toBe('b')
    expect(saqueInicialDelJuego('a', 3)).toBe('a')
  })
})
