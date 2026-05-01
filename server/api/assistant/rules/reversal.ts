import type { MatchRow } from './types.js'
import { pickLatestOdd, pickOddClosestToReference } from './shared.js'

const REVERSAL_MAX_FAVORITE_ODD = 2.5
const REVERSAL_VARIATION_WINDOW_MS = 5 * 60 * 1000
const REVERSAL_MIN_GAP_VARIATION_RATIO = 0.15

interface ParsedScore {
  home: number
  away: number
}

function parseScoreSegment(segment: string): ParsedScore | null {
  const scoreMatch = segment.trim().match(/^(\d+)\s*[:-]\s*(\d+)$/)
  if (!scoreMatch) {
    return null
  }

  const home = Number(scoreMatch[1])
  const away = Number(scoreMatch[2])
  if (Number.isNaN(home) || Number.isNaN(away)) {
    return null
  }

  return { home, away }
}

function parseScore(score: string | null): ParsedScore | null {
  if (!score) {
    return null
  }

  const normalizedScore = score.trim()

  const setSegments = normalizedScore
    .split(/\s*-\s*/)
    .map(segment => segment.trim())
    .filter(segment => segment.length > 0)

  let homeSetWins = 0
  let awaySetWins = 0
  for (const setSegment of setSegments) {
    const parsedSet = parseScoreSegment(setSegment)
    if (!parsedSet) {
      return null
    }

    if (parsedSet.home > parsedSet.away) {
      homeSetWins += 1
    } else if (parsedSet.away > parsedSet.home) {
      awaySetWins += 1
    }
  }

  return {
    home: homeSetWins,
    away: awaySetWins
  }
}

export function analyzeReversal(match: MatchRow): boolean {
  const parsedScore = parseScore(match.score)
  if (!parsedScore || parsedScore.home === parsedScore.away) {
    return false
  }

  const favoriteLatest = match.favorite.odds[match.favorite.odds.length - 1]
  if (!favoriteLatest || favoriteLatest.value >= REVERSAL_MAX_FAVORITE_ODD) {
    return false
  }

  const outsiderLatest = pickLatestOdd(match.outsider.odds)
  if (!outsiderLatest) {
    return false
  }
  if (favoriteLatest.value <= outsiderLatest.value) {
    return false
  }

  const latestTimestampMs = new Date(favoriteLatest.timestamp).getTime()
  if (Number.isNaN(latestTimestampMs)) {
    return false
  }
  const referenceTimestampMs = latestTimestampMs - REVERSAL_VARIATION_WINDOW_MS
  const favoriteReference = pickOddClosestToReference(match.favorite.odds, referenceTimestampMs)
  const outsiderReference = pickOddClosestToReference(match.outsider.odds, referenceTimestampMs)
  if (!favoriteReference || !outsiderReference) {
    return false
  }
  const favoriteReferenceTimestampMs = new Date(favoriteReference.timestamp).getTime()
  const outsiderReferenceTimestampMs = new Date(outsiderReference.timestamp).getTime()
  if (Number.isNaN(favoriteReferenceTimestampMs) || Number.isNaN(outsiderReferenceTimestampMs)) {
    return false
  }
  const favoriteWindowDeltaMs = latestTimestampMs - favoriteReferenceTimestampMs
  const outsiderWindowDeltaMs = latestTimestampMs - outsiderReferenceTimestampMs
  if (favoriteWindowDeltaMs <= 0 || outsiderWindowDeltaMs <= 0) {
    return false
  }
  if (favoriteWindowDeltaMs >= REVERSAL_VARIATION_WINDOW_MS || outsiderWindowDeltaMs >= REVERSAL_VARIATION_WINDOW_MS) {
    return false
  }

  const currentGap = favoriteLatest.value - outsiderLatest.value
  const referenceGap = favoriteReference.value - outsiderReference.value
  if (referenceGap <= 0) {
    return false
  }
  const gapVariationRatio = (currentGap - referenceGap) / referenceGap
  if (gapVariationRatio <= REVERSAL_MIN_GAP_VARIATION_RATIO) {
    return false
  }

  const favoriteSide = match.favorite.side
  if (favoriteSide === 'home' && parsedScore.home < parsedScore.away) {
    return true
  }
  if (favoriteSide === 'away' && parsedScore.away < parsedScore.home) {
    return true
  }

  return false
}
