import { serverSupabaseServiceRole } from '#supabase/server'

const SIEGE_TAG_CODE = 'SIEGE'
const SIEGE_TARGET_SCORE = '0:0'
const SIEGE_MIN_DROP = 0.1
const SIEGE_WINDOW_MS = 5 * 60 * 1000

interface MatchRow {
  id: number
  main_bet_id: number | null
  score: string | null
}

interface OutcomeRow {
  id: number
  bet_id: number
}

interface OddRow {
  outcome_id: number
  timestamp: string
  value: number
}

function hasSiegeDrop(history: OddRow[]): boolean {
  // Need at least two points to observe a drop over time.
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
    if (ageMs <= 0 || ageMs >= SIEGE_WINDOW_MS) {
      continue
    }

    if (point.value - latest.value >= SIEGE_MIN_DROP) {
      return true
    }
  }

  return false
}

export default defineEventHandler(async (event) => {
  try {
    const client = serverSupabaseServiceRole(event)
    const now = new Date()

    // Read the pre-seeded tag once; endpoint assumes migration already created it.
    const { data: existingTag, error: existingTagError } = await client
      .from('match_tags')
      .select('id')
      .eq('code', SIEGE_TAG_CODE)
      .maybeSingle()

    if (!existingTag) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error while reading tag: ${existingTagError?.message} (${existingTagError?.code})`
      })
    }

    const tagId = existingTag.id

    // Focus only on live matches that can be linked to a main betting market.
    const { data: liveMatches, error: liveMatchesError } = await client
      .from('winamax_matches')
      .select('id, main_bet_id, score')
      .eq('status', 'LIVE')
      .not('main_bet_id', 'is', null)

    if (liveMatchesError) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error while fetching live matches: ${liveMatchesError.message} (${liveMatchesError.code})`
      })
    }

    const liveMatchesRows: MatchRow[] = (liveMatches || []).map(match => ({
      id: match.id,
      main_bet_id: match.main_bet_id,
      score: match.score
    }))

    // First sieve: only matches currently at 0:0.
    const zeroZeroMatches = liveMatchesRows.filter(match => match.score === SIEGE_TARGET_SCORE)
    const mainBetIds = Array.from(new Set(
      zeroZeroMatches
        .map(match => match.main_bet_id)
        .filter((mainBetId): mainBetId is number => mainBetId !== null)
    ))

    if (mainBetIds.length === 0) {
      return {
        success: true,
        timestamp: now.toISOString(),
        summary: {
          live_matches_analyzed: liveMatchesRows.length,
          zero_zero_matches_analyzed: zeroZeroMatches.length,
          tagged_matches: 0,
          tag_links_upserted: 0
        }
      }
    }

    const { data: outcomes, error: outcomesError } = await client
      .from('winamax_outcomes')
      .select('id, bet_id')
      .in('bet_id', mainBetIds)

    if (outcomesError) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error while fetching outcomes: ${outcomesError.message} (${outcomesError.code})`
      })
    }

    const outcomeRows: OutcomeRow[] = (outcomes || [])
      .filter((outcome): outcome is { id: number, bet_id: number } => outcome.bet_id !== null)
      .map(outcome => ({
        id: outcome.id,
        bet_id: outcome.bet_id
      }))

    const outcomeIds = outcomeRows.map(outcome => outcome.id)
    if (outcomeIds.length === 0) {
      return {
        success: true,
        timestamp: now.toISOString(),
        summary: {
          live_matches_analyzed: liveMatchesRows.length,
          zero_zero_matches_analyzed: zeroZeroMatches.length,
          tagged_matches: 0,
          tag_links_upserted: 0
        }
      }
    }

    const windowStart = new Date(now.getTime() - SIEGE_WINDOW_MS).toISOString()
    const { data: oddsHistory, error: oddsHistoryError } = await client
      .from('winamax_odds_history')
      .select('outcome_id, timestamp, value')
      .in('outcome_id', outcomeIds)
      .gte('timestamp', windowStart)
      .order('timestamp', { ascending: true })

    if (oddsHistoryError) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error while fetching odds history: ${oddsHistoryError.message} (${oddsHistoryError.code})`
      })
    }

    const oddsByOutcome = new Map<number, OddRow[]>()
    for (const odd of oddsHistory || []) {
      const rows = oddsByOutcome.get(odd.outcome_id) || []
      rows.push({
        outcome_id: odd.outcome_id,
        timestamp: odd.timestamp,
        value: odd.value
      })
      oddsByOutcome.set(odd.outcome_id, rows)
    }

    const outcomesByBet = new Map<number, number[]>()
    for (const outcome of outcomeRows) {
      const rows = outcomesByBet.get(outcome.bet_id) || []
      rows.push(outcome.id)
      outcomesByBet.set(outcome.bet_id, rows)
    }

    // For each candidate match, pick favorite (lowest latest odd) then check required drop.
    const siegeMatchIds = new Set<number>()
    for (const match of zeroZeroMatches) {
      const mainBetId = match.main_bet_id
      if (!mainBetId) {
        continue
      }

      const betOutcomeIds = outcomesByBet.get(mainBetId) || []
      let favoriteOutcomeId: number | null = null
      let favoriteLatestOdd: number | null = null

      for (const outcomeId of betOutcomeIds) {
        const history = oddsByOutcome.get(outcomeId)
        const latest = history?.[history.length - 1]
        if (!latest) {
          continue
        }

        if (favoriteLatestOdd === null || latest.value < favoriteLatestOdd) {
          favoriteLatestOdd = latest.value
          favoriteOutcomeId = outcomeId
        }
      }

      if (!favoriteOutcomeId) {
        continue
      }

      const favoriteHistory = oddsByOutcome.get(favoriteOutcomeId) || []
      if (hasSiegeDrop(favoriteHistory)) {
        siegeMatchIds.add(match.id)
      }
    }

    const linksToUpsert = Array.from(siegeMatchIds).map(matchId => ({
      match_id: matchId,
      tag_id: tagId
    }))

    // Idempotent write: duplicate links are ignored by conflict target.
    if (linksToUpsert.length > 0) {
      const { error: upsertError } = await client
        .from('winamax_match_tags')
        .upsert(linksToUpsert, { onConflict: 'match_id,tag_id', ignoreDuplicates: true })

      if (upsertError) {
        throw createError({
          statusCode: 500,
          statusMessage: `Supabase error while tagging matches: ${upsertError.message} (${upsertError.code})`
        })
      }
    }

    return {
      success: true,
      timestamp: now.toISOString(),
      summary: {
        live_matches_analyzed: liveMatchesRows.length,
        zero_zero_matches_analyzed: zeroZeroMatches.length,
        tagged_matches: linksToUpsert.length,
        tag_links_upserted: linksToUpsert.length
      }
    }
  } catch (error) {
    console.error('Assistant tagging run failed:', error)
    return {
      success: false,
      message: 'Failed to run assistant.',
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
