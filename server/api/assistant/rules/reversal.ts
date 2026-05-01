import type { MatchRow } from './types.js'

const REVERSAL_MAX_FAVORITE_ODD = 2.5

interface ParsedScore {
  home: number
  away: number
}

function parseScore(score: string | null): ParsedScore | null {
  if (!score) {
    return null
  }

  const normalizedScore = score.trim()
  const scoreMatch = normalizedScore.match(/^(\d+)\s*[:-]\s*(\d+)$/)
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

export function analyzeReversal(match: MatchRow): boolean {
  const parsedScore = parseScore(match.score)
  if (!parsedScore || parsedScore.home === parsedScore.away) {
    return false
  }

  const favoriteLatest = match.favorite.odds[match.favorite.odds.length - 1]
  if (!favoriteLatest || favoriteLatest.value >= REVERSAL_MAX_FAVORITE_ODD) {
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
