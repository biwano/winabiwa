import { serverSupabaseServiceRole } from '#supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import * as R from 'remeda'
import type { Database } from '../../../app/types/database.types.js'
import { analyzeReversal } from './rules/reversal.js'
import { analyzeSiege } from './rules/siege.js'
import { analyzeTired } from './rules/tired.js'
import { pickFavoriteAndOutsiderOutcomeIds } from './rules/shared.js'
import {
  RULE_TAGS,
  SIEGE_TAG_CODE,
  TIRED_TAG_CODE,
  REVERSAL_TAG_CODE,
  isRuleCode,
  type RuleCode,
  type LiveDataContext,
  type MatchRow
} from './rules/types.js'

interface AssistantScope {
  mode: 'global' | 'match'
  matchId: number | null
}

type MatchSide = 'home' | 'away' | 'draw'

function normalizeValue(value: string | null): string {
  return (value || '').trim().toLowerCase()
}

function inferSideFromOutcome(
  label: string | null,
  code: string | null,
  match: MatchRow
): MatchSide | null {
  const normalizedCode = normalizeValue(code)
  if (normalizedCode === '1' || normalizedCode === 'home' || normalizedCode === 'h') {
    return 'home'
  }
  if (normalizedCode === '2' || normalizedCode === 'away' || normalizedCode === 'a') {
    return 'away'
  }
  if (normalizedCode === 'x' || normalizedCode === 'n' || normalizedCode === 'draw') {
    return 'draw'
  }

  const normalizedLabel = normalizeValue(label)
  if (
    normalizedLabel === '1'
    || normalizedLabel === 'team 1'
    || normalizedLabel === 'home'
    || normalizedLabel === 'domicile'
    || normalizedLabel === 'equipe 1'
  ) {
    return 'home'
  }
  if (
    normalizedLabel === '2'
    || normalizedLabel === 'team 2'
    || normalizedLabel === 'away'
    || normalizedLabel === 'exterieur'
    || normalizedLabel === 'extérieur'
    || normalizedLabel === 'equipe 2'
  ) {
    return 'away'
  }
  if (
    normalizedLabel === 'x'
    || normalizedLabel === 'n'
    || normalizedLabel === 'draw'
    || normalizedLabel === 'nul'
  ) {
    return 'draw'
  }

  const homeName = normalizeValue(match.competitor1_name)
  const awayName = normalizeValue(match.competitor2_name)
  if (homeName && normalizedLabel.includes(homeName) && (!awayName || !normalizedLabel.includes(awayName))) {
    return 'home'
  }
  if (awayName && normalizedLabel.includes(awayName) && (!homeName || !normalizedLabel.includes(homeName))) {
    return 'away'
  }

  return null
}

async function fetchLiveDataContext(
  client: SupabaseClient<Database>,
  targetMatchId: number | null
): Promise<LiveDataContext> {
  // Fetch matches
  let liveMatchesQuery = client
    .from('winamax_matches')
    .select(`
      id,
      match_start,
      main_bet_id,
      score,
      competitor1_name,
      competitor2_name,
      winamax_bets!winamax_matches_main_bet_id_fkey (
        id,
        winamax_outcomes (
          id,
          bet_id,
          label,
          code,
          winamax_odds_history (
            outcome_id,
            timestamp,
            value
          )
        )
      )
    `)
    .eq('status', 'LIVE')
    .not('main_bet_id', 'is', null)

  if (targetMatchId !== null) {
    liveMatchesQuery = liveMatchesQuery.eq('id', targetMatchId)
  }

  const { data: liveMatches, error: liveMatchesError } = await liveMatchesQuery

  if (liveMatchesError) {
    throw createError({
      statusCode: 500,
      statusMessage: `Supabase error while fetching live matches: ${liveMatchesError.message} (${liveMatchesError.code})`
    })
  }

  // Shared structure for all matches.
  const liveMatchesRows: MatchRow[] = (liveMatches || []).map(match => ({
    id: match.id,
    main_bet_id: match.main_bet_id,
    score: match.score,
    competitor1_name: match.competitor1_name,
    competitor2_name: match.competitor2_name,
    favorite: {
      odds: [],
      label: '',
      side: null
    },
    outsider: {
      odds: [],
      label: ''
    }
  }))
  const liveMatchStartById = R.mapToObj(
    liveMatches || [],
    match => [match.id, match.match_start]
  )

  const allOutcomes = R.flatMap(
    liveMatches || [],
    match => match.winamax_bets?.winamax_outcomes || []
  )
  type NestedOutcome = (typeof allOutcomes)[number]
  const outcomeRows = R.filter(
    allOutcomes,
    (outcome): outcome is NestedOutcome & { bet_id: number } => outcome.bet_id !== null
  )
  const oddsByOutcome = R.mapToObj(
    allOutcomes,
    outcome => [
      outcome.id,
      R.pipe(
        outcome.winamax_odds_history || [],
        R.map(odd => ({
          outcome_id: odd.outcome_id,
          timestamp: odd.timestamp,
          value: odd.value
        })),
        R.sortBy(odd => new Date(odd.timestamp).getTime())
      )
    ]
  )

  if (outcomeRows.length === 0) {
    return {
      liveMatches: liveMatchesRows,
      outcomesById: {},
      outcomesByBet: {},
      oddsByOutcome: {}
    }
  }

  const outcomeIds = outcomeRows.map(outcome => outcome.id)
  if (outcomeIds.length === 0) {
    return {
      liveMatches: liveMatchesRows,
      outcomesById: {},
      outcomesByBet: {},
      oddsByOutcome: {}
    }
  }

  const outcomesByBet = R.pipe(
    outcomeRows,
    R.groupBy(outcome => outcome.bet_id),
    R.mapValues(outcomes => R.map(outcomes, outcome => outcome.id))
  )
  const outcomesById = R.mapToObj(
    outcomeRows,
    outcome => [outcome.id, outcome]
  )

  const enrichedLiveMatchesRows: MatchRow[] = liveMatchesRows.map((match) => {
    if (match.main_bet_id === null) {
      return match
    }

    const outcomeIds = outcomesByBet[match.main_bet_id] || []
    const { favoriteOutcomeId, outsiderOutcomeId } = pickFavoriteAndOutsiderOutcomeIds(
      outcomeIds,
      oddsByOutcome,
      liveMatchStartById[match.id] || null
    )
    const favoriteOutcome = favoriteOutcomeId === null ? null : (outcomesById[favoriteOutcomeId] || null)
    const outsiderOutcome = outsiderOutcomeId === null ? null : (outcomesById[outsiderOutcomeId] || null)

    return {
      ...match,
      favorite: {
        odds: favoriteOutcomeId === null ? [] : (oddsByOutcome[favoriteOutcomeId] || []),
        label: favoriteOutcome?.label || '',
        side: inferSideFromOutcome(favoriteOutcome?.label || null, favoriteOutcome?.code || null, match)
      },
      outsider: {
        odds: outsiderOutcomeId === null ? [] : (oddsByOutcome[outsiderOutcomeId] || []),
        label: outsiderOutcome?.label || ''
      }
    }
  })

  return {
    liveMatches: enrichedLiveMatchesRows,
    outcomesById,
    outcomesByBet,
    oddsByOutcome
  }
}

export default defineEventHandler(async (event) => {
  try {
    const client = serverSupabaseServiceRole(event)
    const now = new Date()
    const query = getQuery(event)
    const rawMatchId = query.matchId

    let targetMatchId: number | null = null
    if (typeof rawMatchId === 'string' && rawMatchId.length > 0) {
      const parsedMatchId = Number(rawMatchId)
      if (!Number.isInteger(parsedMatchId) || parsedMatchId <= 0) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid matchId query parameter. Expected a positive integer.'
        })
      }
      targetMatchId = parsedMatchId
    } else if (Array.isArray(rawMatchId)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid matchId query parameter. Expected a single value.'
      })
    }

    const scope: AssistantScope = {
      mode: targetMatchId === null ? 'global' : 'match',
      matchId: targetMatchId
    }

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

    const tagIdByCode = R.pipe(
      tags || [],
      R.filter((tag): tag is { id: number, code: RuleCode } => isRuleCode(tag.code)),
      R.mapToObj(tag => [tag.code, tag.id])
    )

    for (const rule of RULE_TAGS) {
      if (tagIdByCode[rule.code] === undefined) {
        throw createError({
          statusCode: 500,
          statusMessage: `Missing pre-seeded tag: ${rule.code}`
        })
      }
    }

    const context = await fetchLiveDataContext(client, targetMatchId)
    if (targetMatchId !== null && context.liveMatches.length === 0) {
      throw createError({
        statusCode: 404,
        statusMessage: `No eligible live match found for matchId=${targetMatchId}.`
      })
    }

    const taggedByRule: Record<RuleCode, number> = {
      [SIEGE_TAG_CODE]: 0,
      [TIRED_TAG_CODE]: 0,
      [REVERSAL_TAG_CODE]: 0
    }
    const matchIdsByRule: Record<RuleCode, Set<number>> = {
      [SIEGE_TAG_CODE]: new Set<number>(),
      [TIRED_TAG_CODE]: new Set<number>(),
      [REVERSAL_TAG_CODE]: new Set<number>()
    }
    const allTaggedMatchIds = new Set<number>()
    for (const match of context.liveMatches) {
      if (analyzeSiege(match)) {
        matchIdsByRule[SIEGE_TAG_CODE].add(match.id)
      }
      if (analyzeTired(match)) {
        matchIdsByRule[TIRED_TAG_CODE].add(match.id)
      }
      if (analyzeReversal(match)) {
        matchIdsByRule[REVERSAL_TAG_CODE].add(match.id)
      }
    }

    const linksToUpsert: Array<{ match_id: number, tag_id: number }> = R.flatMap(RULE_TAGS, (rule) => {
      const matchIds = matchIdsByRule[rule.code]
      taggedByRule[rule.code] = matchIds.size
      const tagId = tagIdByCode[rule.code]
      if (tagId === undefined) {
        return []
      }

      const matchIdsArray = Array.from(matchIds)
      for (const matchId of matchIdsArray) {
        allTaggedMatchIds.add(matchId)
      }

      return R.map(matchIdsArray, matchId => ({
        match_id: matchId,
        tag_id: tagId
      }))
    })

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
        mode: scope.mode,
        match_id: scope.matchId,
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
