import type { OddRow } from './types.js'

export function pickLatestOdd(history: OddRow[]): OddRow | null {
  return history[history.length - 1] || null
}

function hasPointMatchInWindow(
  history: OddRow[],
  windowMs: number,
  shouldSkipPoint: (point: OddRow, latest: OddRow) => boolean,
  isMatch: (point: OddRow, latest: OddRow) => boolean
): boolean {
  if (history.length < 2) {
    return false
  }

  const latest = pickLatestOdd(history)
  if (!latest) {
    return false
  }

  const latestTimestampMs = new Date(latest.timestamp).getTime()
  if (Number.isNaN(latestTimestampMs)) {
    return false
  }

  const referenceTimestampMs = latestTimestampMs - windowMs
  const point = pickOddClosestToReference(history, referenceTimestampMs)
  if (!point) {
    return false
  }

  if (point.timestamp === latest.timestamp || shouldSkipPoint(point, latest)) {
    return false
  }

  return isMatch(point, latest)
}

export function hasAbsoluteDropInWindow(history: OddRow[], minDrop: number, windowMs: number): boolean {
  return hasPointMatchInWindow(
    history,
    windowMs,
    () => false,
    (point, latest) => point.value - latest.value >= minDrop
  )
}

export function hasRatioDropInWindow(history: OddRow[], minDropRatio: number, windowMs: number): boolean {
  return hasPointMatchInWindow(
    history,
    windowMs,
    point => point.value <= 0,
    (point, latest) => (point.value - latest.value) / point.value >= minDropRatio
  )
}

export function hasRatioRaiseInWindow(history: OddRow[], minRaiseRatio: number, windowMs: number): boolean {
  return hasPointMatchInWindow(
    history,
    windowMs,
    point => point.value <= 0,
    (point, latest) => (latest.value - point.value) / point.value > minRaiseRatio
  )
}

export function pickFavoriteAndOutsiderOutcomeIds(
  outcomeIds: number[],
  oddsByOutcome: Record<number, OddRow[]>,
  referenceTimestamp: string | null
): { favoriteOutcomeId: number | null, outsiderOutcomeId: number | null } {
  let favoriteOutcomeId: number | null = null
  let outsiderOutcomeId: number | null = null
  let favoriteReferenceOdd: number | null = null
  let outsiderReferenceOdd: number | null = null
  const referenceTimestampMs = referenceTimestamp ? new Date(referenceTimestamp).getTime() : Number.NaN

  for (const outcomeId of outcomeIds) {
    const history = oddsByOutcome[outcomeId]
    const referenceOdd = pickOddClosestToReference(history || [], referenceTimestampMs)
    if (!referenceOdd) {
      continue
    }

    if (favoriteReferenceOdd === null || referenceOdd.value < favoriteReferenceOdd) {
      favoriteReferenceOdd = referenceOdd.value
      favoriteOutcomeId = outcomeId
    }

    if (outsiderReferenceOdd === null || referenceOdd.value > outsiderReferenceOdd) {
      outsiderReferenceOdd = referenceOdd.value
      outsiderOutcomeId = outcomeId
    }
  }

  return { favoriteOutcomeId, outsiderOutcomeId }
}

export function pickOddClosestToReference(history: OddRow[], referenceTimestampMs: number): OddRow | null {
  const latest = pickLatestOdd(history)

  if (!latest) {
    return null
  }

  if (Number.isNaN(referenceTimestampMs)) {
    return latest
  }

  let closestOdd: OddRow | null = null
  let closestDistanceMs = Number.POSITIVE_INFINITY
  for (const odd of history) {
    const oddTimestampMs = new Date(odd.timestamp).getTime()
    if (Number.isNaN(oddTimestampMs)) {
      continue
    }

    const distanceMs = Math.abs(referenceTimestampMs - oddTimestampMs)
    if (distanceMs < closestDistanceMs) {
      closestDistanceMs = distanceMs
      closestOdd = odd
    }
  }

  return closestOdd
}
