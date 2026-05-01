import { hasRatioDropInWindow } from './shared.js'
import type { MatchRow } from './types.js'

const TIRED_MIN_DROP_RATIO = 0.08
const TIRED_WINDOW_MS = 10 * 60 * 1000

export function analyzeTired(match: MatchRow): boolean {
  if (match.outsider.odds.length === 0) {
    return false
  }

  return hasRatioDropInWindow(match.outsider.odds, TIRED_MIN_DROP_RATIO, TIRED_WINDOW_MS)
}
