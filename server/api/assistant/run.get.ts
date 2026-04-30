import { serverSupabaseServiceRole } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../../../app/types/database.types.js'

const SIEGE_TAG_CODE = 'SIEGE'
const TIRED_TAG_CODE = 'TIRED'
type RuleCode = typeof SIEGE_TAG_CODE | typeof TIRED_TAG_CODE
const SIEGE_TARGET_SCORE = '0:0'
const SIEGE_MIN_DROP = 0.1
const SIEGE_WINDOW_MS = 5 * 60 * 1000
const TIRED_MIN_DROP_RATIO = 0.08
const TIRED_WINDOW_MS = 10 * 60 * 1000
const MAX_RULE_WINDOW_MS = Math.max(SIEGE_WINDOW_MS, TIRED_WINDOW_MS)

interface RuleTag {
  code: RuleCode
}

const RULE_TAGS: RuleTag[] = [
  { code: SIEGE_TAG_CODE },
  { code: TIRED_TAG_CODE }
]

function isRuleCode(value: string): value is RuleCode {
  return value === SIEGE_TAG_CODE || value === TIRED_TAG_CODE
}

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

interface LiveDataContext {
  liveMatches: MatchRow[]
  outcomesByBet: Map<number, number[]>
  oddsByOutcome: Map<number, OddRow[]>
}

interface RuleAnalyzerResult {
  ruleCode: RuleCode
  matchIds: Set<number>
}

function hasAbsoluteDropInWindow(history: OddRow[], minDrop: number, windowMs: number): boolean {
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

function hasRatioDropInWindow(history: OddRow[], minDropRatio: number, windowMs: number): boolean {
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

function pickFavoriteAndOutsiderOutcomeIds(
  outcomeIds: number[],
  oddsByOutcome: Map<number, OddRow[]>
): { favoriteOutcomeId: number | null, outsiderOutcomeId: number | null } {
  let favoriteOutcomeId: number | null = null
  let outsiderOutcomeId: number | null = null
  let favoriteLatestOdd: number | null = null
  let outsiderLatestOdd: number | null = null

  for (const outcomeId of outcomeIds) {
    const history = oddsByOutcome.get(outcomeId)
    const latest = history?.[history.length - 1]
    if (!latest) {
      continue
    }

    if (favoriteLatestOdd === null || latest.value < favoriteLatestOdd) {
      favoriteLatestOdd = latest.value
      favoriteOutcomeId = outcomeId
    }

    if (outsiderLatestOdd === null || latest.value > outsiderLatestOdd) {
      outsiderLatestOdd = latest.value
      outsiderOutcomeId = outcomeId
    }
  }

  return { favoriteOutcomeId, outsiderOutcomeId }
}

async function fetchLiveDataContext(
  client: SupabaseClient<Database>,
  now: Date
): Promise<LiveDataContext> {
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

  const mainBetIds = Array.from(new Set(
    liveMatchesRows
      .map(match => match.main_bet_id)
      .filter((mainBetId): mainBetId is number => mainBetId !== null)
  ))

  if (mainBetIds.length === 0) {
    return {
      liveMatches: liveMatchesRows,
      outcomesByBet: new Map<number, number[]>(),
      oddsByOutcome: new Map<number, OddRow[]>()
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
      liveMatches: liveMatchesRows,
      outcomesByBet: new Map<number, number[]>(),
      oddsByOutcome: new Map<number, OddRow[]>()
    }
  }

  const windowStart = new Date(now.getTime() - MAX_RULE_WINDOW_MS).toISOString()
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

  return {
    liveMatches: liveMatchesRows,
    outcomesByBet,
    oddsByOutcome
  }
}

function analyzeSiege(context: LiveDataContext): RuleAnalyzerResult {
  const matchIds = new Set<number>()
  const zeroZeroMatches = context.liveMatches.filter(match => match.score === SIEGE_TARGET_SCORE)

  for (const match of zeroZeroMatches) {
    if (match.main_bet_id === null) {
      continue
    }

    const outcomeIds = context.outcomesByBet.get(match.main_bet_id) || []
    const { favoriteOutcomeId } = pickFavoriteAndOutsiderOutcomeIds(outcomeIds, context.oddsByOutcome)
    if (favoriteOutcomeId === null) {
      continue
    }

    const favoriteHistory = context.oddsByOutcome.get(favoriteOutcomeId) || []
    if (hasAbsoluteDropInWindow(favoriteHistory, SIEGE_MIN_DROP, SIEGE_WINDOW_MS)) {
      matchIds.add(match.id)
    }
  }

  return {
    ruleCode: SIEGE_TAG_CODE,
    matchIds
  }
}

function analyzeTired(context: LiveDataContext): RuleAnalyzerResult {
  const matchIds = new Set<number>()

  for (const match of context.liveMatches) {
    if (match.main_bet_id === null) {
      continue
    }

    const outcomeIds = context.outcomesByBet.get(match.main_bet_id) || []
    const { outsiderOutcomeId } = pickFavoriteAndOutsiderOutcomeIds(outcomeIds, context.oddsByOutcome)
    if (outsiderOutcomeId === null) {
      continue
    }

    const outsiderHistory = context.oddsByOutcome.get(outsiderOutcomeId) || []
    if (hasRatioDropInWindow(outsiderHistory, TIRED_MIN_DROP_RATIO, TIRED_WINDOW_MS)) {
      matchIds.add(match.id)
    }
  }

  return {
    ruleCode: TIRED_TAG_CODE,
    matchIds
  }
}

export default defineEventHandler(async (event) => {
  try {
    const client = serverSupabaseServiceRole(event)
    const now = new Date()

    const { data: tags, error: tagsError } = await client
      .from('match_tags')
      .select('id, code')
      .in('code', RULE_TAGS.map(rule => rule.code))

    if (tagsError) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error while reading tags: ${tagsError.message} (${tagsError.code})`
      })
    }

    const tagIdByCode = new Map<RuleCode, number>()
    for (const tag of tags || []) {
      if (isRuleCode(tag.code)) {
        tagIdByCode.set(tag.code, tag.id)
      }
    }

    for (const rule of RULE_TAGS) {
      if (!tagIdByCode.has(rule.code)) {
        throw createError({
          statusCode: 500,
          statusMessage: `Missing pre-seeded tag: ${rule.code}`
        })
      }
    }

    const context = await fetchLiveDataContext(client, now)
    const analyzerResults: RuleAnalyzerResult[] = [
      analyzeSiege(context),
      analyzeTired(context)
    ]

    const taggedByRule: Record<RuleCode, number> = {
      [SIEGE_TAG_CODE]: 0,
      [TIRED_TAG_CODE]: 0
    }
    const allTaggedMatchIds = new Set<number>()
    const linksToUpsert: Array<{ match_id: number, tag_id: number }> = []

    for (const result of analyzerResults) {
      taggedByRule[result.ruleCode] = result.matchIds.size
      const tagId = tagIdByCode.get(result.ruleCode)
      if (!tagId) {
        continue
      }

      for (const matchId of result.matchIds) {
        allTaggedMatchIds.add(matchId)
        linksToUpsert.push({
          match_id: matchId,
          tag_id: tagId
        })
      }
    }

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
        live_matches_analyzed: context.liveMatches.length,
        tagged_matches_total: allTaggedMatchIds.size,
        tagged_matches_by_rule: taggedByRule,
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
