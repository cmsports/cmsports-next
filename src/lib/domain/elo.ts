import { CONFIG } from '../config'

export interface EloResult {
  newWinnerElo: number
  newLoserElo: number
  winnerDelta: number
  loserDelta: number
}

export function calculateExpectedScore(playerElo: number, opponentElo: number): number {
  return 1 / (1 + Math.pow(10, (opponentElo - playerElo) / CONFIG.ELO_DIVISOR))
}

export function calculateEloChange(
  winnerElo: number,
  loserElo: number,
  kFactor: number = CONFIG.ELO_K_FACTOR,
): EloResult {
  const expectedWinner = calculateExpectedScore(winnerElo, loserElo)
  const expectedLoser = 1 - expectedWinner

  const winnerDelta = Math.round(kFactor * (1 - expectedWinner))
  const loserDelta = Math.round(kFactor * (0 - expectedLoser))

  return {
    newWinnerElo: winnerElo + winnerDelta,
    newLoserElo: loserElo + loserDelta,
    winnerDelta,
    loserDelta,
  }
}

export function sortByEloDescending<T extends { elo?: number | null }>(players: T[]): T[] {
  return [...players].sort((a, b) => (b.elo ?? CONFIG.ELO_INICIAL) - (a.elo ?? CONFIG.ELO_INICIAL))
}
