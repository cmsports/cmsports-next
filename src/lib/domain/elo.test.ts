import { describe, it, expect } from 'vitest'
import { calculateExpectedScore, calculateEloChange } from './elo'

describe('calculateExpectedScore', () => {
  it('con ELO igual la expectativa es 0.5', () => {
    expect(calculateExpectedScore(1200, 1200)).toBe(0.5)
  })

  it('el favorito tiene expectativa > 0.5', () => {
    expect(calculateExpectedScore(1400, 1200)).toBeGreaterThan(0.5)
  })

  it('las expectativas de ambos suman 1', () => {
    const a = calculateExpectedScore(1400, 1200)
    const b = calculateExpectedScore(1200, 1400)
    expect(a + b).toBeCloseTo(1, 10)
  })
})

describe('calculateEloChange', () => {
  it('con ELO igual, el ganador sube +16 y el perdedor baja -16 (K=32)', () => {
    const r = calculateEloChange(1200, 1200)
    expect(r.winnerDelta).toBe(16)
    expect(r.loserDelta).toBe(-16)
    expect(r.newWinnerElo).toBe(1216)
    expect(r.newLoserElo).toBe(1184)
  })

  it('el ELO total se conserva (suma cero de deltas) con ELO igual', () => {
    const r = calculateEloChange(1500, 1500)
    expect(r.winnerDelta + r.loserDelta).toBe(0)
  })

  it('un underdog que gana suma más que un favorito que gana', () => {
    const underdog = calculateEloChange(1100, 1500) // gana el de menor ELO
    const favorito = calculateEloChange(1500, 1100) // gana el de mayor ELO
    expect(underdog.winnerDelta).toBeGreaterThan(favorito.winnerDelta)
  })

  it('respeta un K-factor personalizado', () => {
    const r = calculateEloChange(1200, 1200, 16)
    expect(r.winnerDelta).toBe(8)
    expect(r.loserDelta).toBe(-8)
  })
})
