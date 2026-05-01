import type { OddRow } from './types.js'

export function hasAbsoluteDropInWindow(history: OddRow[], minDrop: number, windowMs: number): boolean {
  if (history.length < 2) {
    return false
  }

  const latest = history[history.length - 1]
  if (!latest) {
    return false
  }

  const latestTimestampMs = new Date(latest.timestamp).getTime()
  if (Number.isNaN(latestTimestampMs)) {
    return false
  }

  for (const point of history) {
    if (point.timestamp === latest.timestamp) {
      continue
    }

    const pointTimestampMs = new Date(point.timestamp).getTime()
    if (Number.isNaN(pointTimestampMs)) {
      continue
    }

    const ageMs = latestTimestampMs - pointTimestampMs
    if (ageMs <= 0 || ageMs >= windowMs) {
      continue
    }

    if (point.value - latest.value >= minDrop) {
      return true
    }
  }

  return false
}

export function hasRatioDropInWindow(history: OddRow[], minDropRatio: number, windowMs: number): boolean {
  if (history.length < 2) {
    return false
  }

  const latest = history[history.length - 1]
  if (!latest) {
    return false
  }

  const latestTimestampMs = new Date(latest.timestamp).getTime()
  if (Number.isNaN(latestTimestampMs)) {
    return false
  }

  for (const point of history) {
    if (point.timestamp === latest.timestamp || point.value <= 0) {
      continue
    }

    const pointTimestampMs = new Date(point.timestamp).getTime()
    if (Number.isNaN(pointTimestampMs)) {
      continue
    }

    const ageMs = latestTimestampMs - pointTimestampMs
    if (ageMs <= 0 || ageMs >= windowMs) {
      continue
    }

    const dropRatio = (point.value - latest.value) / point.value
    if (dropRatio > minDropRatio) {
      return true
    }
  }

  return false
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

function pickOddClosestToReference(history: OddRow[], referenceTimestampMs: number): OddRow | null {
  if (history.length === 0) {
    return null
  }

  if (Number.isNaN(referenceTimestampMs)) {
    return history[history.length - 1] || null
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
