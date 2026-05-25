import {
  getElapsedMs,
  getMatchStartMs,
  pickLatestOdd,
  pickOddClosestToReference
} from './shared.js'
import type { MatchRow, OddRow } from './types.js'

const FOOTBALL_SPORT_NAME = 'Football'
const MNAMT_TARGET_SCORE = '0:0'
const MNAMT_SCAN_MIN_MINUTE = 15
const MNAMT_SCAN_MAX_MINUTE = 25
const MNAMT_ANTI_FREEZE_START_MINUTE = 10
const MNAMT_ANTI_FREEZE_END_MINUTE = 25
const MNAMT_MIRROR_CHECK_MINUTE = 20
const MNAMT_ANALYSIS_END_MINUTE = 25
const MNAMT_MAX_STAGNATION_MS = 3 * 60 * 1000
const MNAMT_ODD_UNCHANGED_EPSILON = 0.001
const MNAMT_MIN_DRAW_DROP_RATIO = 0.05
const MNAMT_MAX_RELATIVE_SLOPE_VARIANCE = 0.35
const MS_PER_MINUTE = 60 * 1000

function filterHistoryByElapsedMinutes(
  history: OddRow[],
  matchStartMs: number,
  minMinute: number,
  maxMinute: number
): OddRow[] {
  const minElapsedMs = minMinute * MS_PER_MINUTE
  const maxElapsedMs = maxMinute * MS_PER_MINUTE

  return history.filter((odd) => {
    const elapsedMs = getElapsedMs(odd.timestamp, matchStartMs)
    if (elapsedMs === null) {
      return false
    }

    return elapsedMs >= minElapsedMs && elapsedMs <= maxElapsedMs
  })
}

function hasLongPlateau(
  history: OddRow[],
  matchStartMs: number,
  minMinute: number,
  maxMinute: number,
  maxPlateauDurationMs: number
): boolean {
  const windowHistory = filterHistoryByElapsedMinutes(history, matchStartMs, minMinute, maxMinute)
  if (windowHistory.length < 2) {
    return false
  }

  let plateauStartMs: number | null = null
  let plateauValue: number | null = null

  for (const odd of windowHistory) {
    const elapsedMs = getElapsedMs(odd.timestamp, matchStartMs)
    if (elapsedMs === null) {
      continue
    }

    if (plateauValue === null || Math.abs(odd.value - plateauValue) > MNAMT_ODD_UNCHANGED_EPSILON) {
      plateauValue = odd.value
      plateauStartMs = elapsedMs
      continue
    }

    if (plateauStartMs === null) {
      continue
    }

    const plateauDurationMs = elapsedMs - plateauStartMs
    if (plateauDurationMs > maxPlateauDurationMs) {
      return true
    }
  }

  return false
}

function countUpwardRebounds(history: OddRow[], matchStartMs: number, maxMinute: number): number {
  const windowHistory = filterHistoryByElapsedMinutes(history, matchStartMs, 0, maxMinute)
  let rebounds = 0

  for (let index = 1; index < windowHistory.length; index += 1) {
    const previous = windowHistory[index - 1]
    const current = windowHistory[index]
    if (!previous || !current) {
      continue
    }

    if (current.value > previous.value + MNAMT_ODD_UNCHANGED_EPSILON) {
      rebounds += 1
    }
  }

  return rebounds
}

function hasSmoothNegativeDrawSlope(history: OddRow[], matchStartMs: number, maxMinute: number): boolean {
  const windowHistory = filterHistoryByElapsedMinutes(history, matchStartMs, 0, maxMinute)
  if (windowHistory.length < 3) {
    return false
  }

  const slopes: number[] = []

  for (let index = 1; index < windowHistory.length; index += 1) {
    const previous = windowHistory[index - 1]
    const current = windowHistory[index]
    if (!previous || !current) {
      continue
    }

    const previousElapsedMs = getElapsedMs(previous.timestamp, matchStartMs)
    const currentElapsedMs = getElapsedMs(current.timestamp, matchStartMs)
    if (previousElapsedMs === null || currentElapsedMs === null) {
      continue
    }

    const deltaTimeMs = currentElapsedMs - previousElapsedMs
    if (deltaTimeMs <= 0) {
      continue
    }

    const slope = (current.value - previous.value) / deltaTimeMs
    if (slope >= 0) {
      return false
    }

    slopes.push(slope)
  }

  if (slopes.length < 2) {
    return false
  }

  const meanAbsSlope = slopes.reduce((sum, slope) => sum + Math.abs(slope), 0) / slopes.length
  if (meanAbsSlope <= 0) {
    return false
  }

  const meanSlope = slopes.reduce((sum, slope) => sum + slope, 0) / slopes.length
  const variance = slopes.reduce((sum, slope) => sum + (slope - meanSlope) ** 2, 0) / slopes.length
  const stdDev = Math.sqrt(variance)

  return stdDev / meanAbsSlope <= MNAMT_MAX_RELATIVE_SLOPE_VARIANCE
}

function hasMinimumDrawDropFromKickoff(
  drawHistory: OddRow[],
  matchStartMs: number,
  maxMinute: number
): boolean {
  const kickoffOdd = pickOddClosestToReference(drawHistory, matchStartMs)
  const latestInWindow = filterHistoryByElapsedMinutes(drawHistory, matchStartMs, 0, maxMinute).at(-1)
    ?? pickLatestOdd(drawHistory)

  if (!kickoffOdd || !latestInWindow || kickoffOdd.value <= 0) {
    return false
  }

  const dropRatio = (kickoffOdd.value - latestInWindow.value) / kickoffOdd.value
  return dropRatio >= MNAMT_MIN_DRAW_DROP_RATIO
}

function hasMirrorTeamRiseAtMinute(
  teamHistory: OddRow[],
  matchStartMs: number,
  minute: number
): boolean {
  const kickoffOdd = pickOddClosestToReference(teamHistory, matchStartMs)
  const minuteTargetMs = matchStartMs + minute * MS_PER_MINUTE
  const minuteOdd = pickOddClosestToReference(teamHistory, minuteTargetMs)

  if (!kickoffOdd || !minuteOdd) {
    return false
  }

  return minuteOdd.value > kickoffOdd.value + MNAMT_ODD_UNCHANGED_EPSILON
}

function hasTeamsRiseWhileDrawFalls(
  drawHistory: OddRow[],
  homeHistory: OddRow[],
  awayHistory: OddRow[],
  matchStartMs: number,
  minMinute: number,
  maxMinute: number
): boolean {
  const drawWindow = filterHistoryByElapsedMinutes(drawHistory, matchStartMs, minMinute, maxMinute)
  if (drawWindow.length < 2) {
    return false
  }

  for (let index = 1; index < drawWindow.length; index += 1) {
    const previousDraw = drawWindow[index - 1]
    const currentDraw = drawWindow[index]
    if (!previousDraw || !currentDraw) {
      continue
    }

    if (currentDraw.value >= previousDraw.value - MNAMT_ODD_UNCHANGED_EPSILON) {
      continue
    }

    const previousDrawMs = getElapsedMs(previousDraw.timestamp, matchStartMs)
    const currentDrawMs = getElapsedMs(currentDraw.timestamp, matchStartMs)
    if (previousDrawMs === null || currentDrawMs === null) {
      return false
    }

    const previousHome = pickOddClosestToReference(homeHistory, matchStartMs + previousDrawMs)
    const currentHome = pickOddClosestToReference(homeHistory, matchStartMs + currentDrawMs)
    const previousAway = pickOddClosestToReference(awayHistory, matchStartMs + previousDrawMs)
    const currentAway = pickOddClosestToReference(awayHistory, matchStartMs + currentDrawMs)

    if (!previousHome || !currentHome || !previousAway || !currentAway) {
      return false
    }

    if (
      currentHome.value < previousHome.value - MNAMT_ODD_UNCHANGED_EPSILON
      || currentAway.value < previousAway.value - MNAMT_ODD_UNCHANGED_EPSILON
    ) {
      return false
    }
  }

  return true
}

function isWithinScanWindow(match: MatchRow, now: Date, matchStartMs: number): boolean {
  const elapsedMs = now.getTime() - matchStartMs
  const minElapsedMs = MNAMT_SCAN_MIN_MINUTE * MS_PER_MINUTE
  const maxElapsedMs = MNAMT_SCAN_MAX_MINUTE * MS_PER_MINUTE
  return elapsedMs >= minElapsedMs && elapsedMs <= maxElapsedMs
}

export function analyzeMnamt(match: MatchRow, now: Date): boolean {
  if (match.sport_name !== FOOTBALL_SPORT_NAME) {
    return false
  }

  if (match.score !== MNAMT_TARGET_SCORE) {
    return false
  }

  const matchStartMs = getMatchStartMs(match)
  if (matchStartMs === null) {
    return false
  }

  if (!isWithinScanWindow(match, now, matchStartMs)) {
    return false
  }

  if (match.draw.odds.length === 0 || match.home.odds.length === 0 || match.away.odds.length === 0) {
    return false
  }

  if (
    hasLongPlateau(
      match.draw.odds,
      matchStartMs,
      MNAMT_ANTI_FREEZE_START_MINUTE,
      MNAMT_ANTI_FREEZE_END_MINUTE,
      MNAMT_MAX_STAGNATION_MS
    )
  ) {
    return false
  }

  if (countUpwardRebounds(match.draw.odds, matchStartMs, MNAMT_ANALYSIS_END_MINUTE) > 0) {
    return false
  }

  if (!hasSmoothNegativeDrawSlope(match.draw.odds, matchStartMs, MNAMT_ANALYSIS_END_MINUTE)) {
    return false
  }

  if (!hasMinimumDrawDropFromKickoff(match.draw.odds, matchStartMs, MNAMT_ANALYSIS_END_MINUTE)) {
    return false
  }

  if (
    !hasMirrorTeamRiseAtMinute(match.home.odds, matchStartMs, MNAMT_MIRROR_CHECK_MINUTE)
    || !hasMirrorTeamRiseAtMinute(match.away.odds, matchStartMs, MNAMT_MIRROR_CHECK_MINUTE)
  ) {
    return false
  }

  if (
    !hasTeamsRiseWhileDrawFalls(
      match.draw.odds,
      match.home.odds,
      match.away.odds,
      matchStartMs,
      MNAMT_SCAN_MIN_MINUTE,
      MNAMT_SCAN_MAX_MINUTE
    )
  ) {
    return false
  }

  return true
}
