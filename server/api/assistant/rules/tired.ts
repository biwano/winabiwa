import { hasRatioDropInWindow } from './shared.js'
import type { MatchRow } from './types.js'

const TIRED_MIN_DROP_RATIO = 0.08
const TIRED_WINDOW_MS = 10 * 60 * 1000
const TIRED_MIN_ELAPSED_RATIO = 0.7

const SPORT_MODELED_DURATION_MS_BY_NAME: Record<string, number> = {
  // 90 regular + 15 break + 5 stoppage buffer
  'Football': (90 + 15 + 5) * 60 * 1000,
  // 4x12 regular + 15 halftime + short break buffers
  'Basketball': (48 + 15 + 5) * 60 * 1000,
  // 3x20 regular + 2x15 intermissions + 5 stoppage buffer
  'Hockey sur glace': (60 + 30 + 5) * 60 * 1000,
  // 2x30 regular + 15 halftime + 5 stoppage buffer
  'Handball': (60 + 15 + 5) * 60 * 1000,
  // 2x40 regular + 15 halftime + 10 stoppage buffer
  'Rugby à XV': (80 + 15 + 10) * 60 * 1000,
  // 2x40 regular + 10 halftime + 10 stoppage buffer
  'Rugby à XIII': (80 + 10 + 10) * 60 * 1000,
  // 4x15 regular + 20 halftime + short break buffers
  'Football américain': (60 + 20 + 10) * 60 * 1000,
  // 2x20 regular + 15 halftime + 5 stoppage buffer
  'Futsal': (40 + 15 + 5) * 60 * 1000
}

function getModeledDurationMsForSport(match: MatchRow): number | null {
  if (!match.sport_name) {
    return null
  }

  return SPORT_MODELED_DURATION_MS_BY_NAME[match.sport_name] ?? null
}

function hasReachedTiredWindow(match: MatchRow, now: Date): boolean {
  const modeledDurationMs = getModeledDurationMsForSport(match)
  if (modeledDurationMs === null) {
    return false
  }

  if (!match.match_start) {
    return false
  }

  const matchStartMs = new Date(match.match_start).getTime()
  if (Number.isNaN(matchStartMs)) {
    return false
  }

  const elapsedMs = now.getTime() - matchStartMs
  if (elapsedMs <= 0) {
    return false
  }

  const elapsedRatio = elapsedMs / modeledDurationMs
  return elapsedRatio >= TIRED_MIN_ELAPSED_RATIO
}

export function analyzeTired(match: MatchRow, now: Date): boolean {
  if (match.outsider.odds.length === 0) {
    return false
  }

  if (!hasReachedTiredWindow(match, now)) {
    return false
  }

  return hasRatioDropInWindow(match.outsider.odds, TIRED_MIN_DROP_RATIO, TIRED_WINDOW_MS)
}
