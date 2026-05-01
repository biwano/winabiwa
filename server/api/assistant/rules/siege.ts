import { hasAbsoluteDropInWindow } from './shared.js'
import type { MatchRow } from './types.js'

const SIEGE_TARGET_SCORE = '0:0'
const SIEGE_MIN_DROP = 0.1
const SIEGE_WINDOW_MS = 5 * 60 * 1000

export function analyzeSiege(match: MatchRow): boolean {
  if (match.score !== SIEGE_TARGET_SCORE || match.favorite.odds.length === 0) {
    return false
  }

  return hasAbsoluteDropInWindow(match.favorite.odds, SIEGE_MIN_DROP, SIEGE_WINDOW_MS)
}
