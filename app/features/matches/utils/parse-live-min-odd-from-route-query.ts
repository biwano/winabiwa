/**
 * Reads `live_only` and optional `min_odd` from route query (URL sync).
 * `min_odd` is only set when `live_only` is true and the param is a positive finite number.
 */
export function parseLiveOnlyAndMinOddFromRouteQuery(query: {
  live_only?: unknown
  min_odd?: unknown
}): { live_only: boolean, min_odd: number | null } {
  const live_only = query.live_only === 'true'
  let min_odd: number | null = null
  if (live_only && typeof query.min_odd === 'string') {
    const n = parseFloat(query.min_odd)
    if (Number.isFinite(n) && n > 0) min_odd = n
  }
  return { live_only, min_odd }
}
