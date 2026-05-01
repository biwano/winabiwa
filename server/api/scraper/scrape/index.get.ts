import {
  fetchWinamaxLiveData,
  type WinamaxLiveTarget
} from '../../../utils/winamax/live.js'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { PostgrestError } from '@supabase/supabase-js'
import * as R from 'remeda'

export default defineEventHandler(async (event) => {
  try {
    const query = getQuery(event)
    const targetValue = typeof query.target === 'string' ? query.target : ''
    const cleanupValue = query.cleanup
    if (targetValue !== 'live' && targetValue !== 'calendar') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Missing or invalid `target` query parameter. Allowed values: live, calendar.'
      })
    }
    if (Array.isArray(cleanupValue)) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Invalid `cleanup` query parameter. Expected a single boolean value.'
      })
    }

    let shouldCleanup = false
    if (typeof cleanupValue === 'string' && cleanupValue.length > 0) {
      if (cleanupValue !== 'true' && cleanupValue !== 'false') {
        throw createError({
          statusCode: 400,
          statusMessage: 'Invalid `cleanup` query parameter. Allowed values: true, false.'
        })
      }
      shouldCleanup = cleanupValue === 'true'
    }

    const target: WinamaxLiveTarget = targetValue
    const state = await fetchWinamaxLiveData(target)
    const client = serverSupabaseServiceRole(event)
    const now = new Date().toISOString()
    const isNotNull = <T>(value: T | null): value is T => value !== null
    const countNonNull = <T>(record: Record<string, T | null> | undefined) => Object.values(record || {}).filter(isNotNull).length

    function parsePositiveIntKey(key: string): number | null {
      if (!/^\d+$/.test(key)) return null
      const n = Number.parseInt(key, 10)
      if (!Number.isFinite(n) || n <= 0) return null
      return n
    }

    function nonNullNumericIdEntries<T>(
      record: Record<string, T | null> | undefined
    ): Array<[number, T]> {
      const result: Array<[number, T]> = []
      for (const [key, value] of Object.entries(record || {})) {
        if (!isNotNull(value)) continue
        const id = parsePositiveIntKey(key)
        if (id === null) continue
        result.push([id, value])
      }
      return result
    }

    const buildValidIds = <T>(
      existingRows: Array<{ id: number }> | null,
      record: Record<string, T | null> | undefined
    ) => new Set<number>([
      ...R.map(existingRows || [], row => row.id),
      ...R.map(nonNullNumericIdEntries(record), ([id]) => id)
    ])

    // 0. Fetch existing IDs to avoid foreign key violations for missing metadata
    const [
      { data: existingSports },
      { data: existingCategories },
      { data: existingTournaments },
      { data: existingBetCategories },
      { data: existingBetFilters },
      { data: existingMatches }
    ] = await Promise.all([
      client.from('winamax_sports').select('id'),
      client.from('winamax_categories').select('id'),
      client.from('winamax_tournaments').select('id'),
      client.from('winamax_bet_categories').select('id'),
      client.from('winamax_bet_filters').select('id'),
      client.from('winamax_matches').select('id')
    ])

    const validSportIds = buildValidIds(existingSports || null, state.sports)
    const validCategoryIds = buildValidIds(existingCategories || null, state.categories)
    const validTournamentIds = buildValidIds(existingTournaments || null, state.tournaments)
    const validBetCategoryIds = buildValidIds(existingBetCategories || null, state.betCategories)
    const validBetFilterIds = buildValidIds(existingBetFilters || null, state.filters)
    const validMatchIds = buildValidIds(existingMatches || null, state.matches)

    const getSportId = (id: number | null | undefined) => (id && validSportIds.has(id)) ? id : null
    const getCategoryId = (id: number | null | undefined) => (id && validCategoryIds.has(id)) ? id : null
    const getTournamentId = (id: number | null | undefined) => (id && validTournamentIds.has(id)) ? id : null
    const getBetCategoryId = (id: number | null | undefined) => (id && validBetCategoryIds.has(id)) ? id : null
    const getMatchId = (id: number | null | undefined) => (id && validMatchIds.has(id)) ? id : null
    const getBetFilterId = (id: number | null | undefined) => (id && validBetFilterIds.has(id)) ? id : null

    // Round current time to nearest minute for odds history
    const oddsTimestamp = new Date()
    oddsTimestamp.setSeconds(0, 0)
    const oddsTimestampStr = oddsTimestamp.toISOString()

    // Helper to throw on supabase error
    const checkError = (res: { error: PostgrestError | null }) => {
      if (res.error) {
        throw createError({
          statusCode: 500,
          statusMessage: `Supabase error: ${res.error.message} (${res.error.code})`
        })
      }
    }

    // 1. Upsert Sports
    const sportsToUpsert = R.map(
      nonNullNumericIdEntries(state.sports),
      ([id, sport]) => ({
        id,
        name: sport.sportName,
        updated_at: now
      })
    )

    if (sportsToUpsert.length > 0) {
      checkError(await client.from('winamax_sports').upsert(sportsToUpsert))
    }

    // 2. Upsert Categories
    const categoriesToUpsert = R.map(
      nonNullNumericIdEntries(state.categories),
      ([id, category]) => ({
        id,
        name: category.categoryName,
        flag: category.flag || null,
        sport_id: getSportId(category.sportId),
        updated_at: now
      })
    )

    if (categoriesToUpsert.length > 0) {
      checkError(await client.from('winamax_categories').upsert(categoriesToUpsert))
    }

    // 3. Upsert Tournaments
    const tournamentsToUpsert = R.map(
      nonNullNumericIdEntries(state.tournaments),
      ([id, tournament]) => ({
        id,
        name: tournament.tournamentName,
        category_id: getCategoryId(tournament.categoryId),
        sr_tournament_id: tournament.srTournamentId || null,
        sr_season_id: tournament.srSeasonId || null,
        updated_at: now
      })
    )

    if (tournamentsToUpsert.length > 0) {
      checkError(await client.from('winamax_tournaments').upsert(tournamentsToUpsert))
    }

    // 4. Upsert Bet Filters
    if (state.filters) {
      const filtersToUpsert = R.map(
        nonNullNumericIdEntries(state.filters),
        ([id, filter]) => ({
          id,
          name: filter.betFilterName,
          parent_id: getBetFilterId(filter.betFilterParentId),
          is_default: !!filter.betFilterIsDefault,
          display_order: filter.displayOrder,
          updated_at: now
        })
      )
      if (filtersToUpsert.length > 0) {
        const sortedFilters = [...filtersToUpsert].sort((a, b) => {
          if (a.parent_id === null && b.parent_id !== null) return -1
          if (a.parent_id !== null && b.parent_id === null) return 1
          return 0
        })
        checkError(await client.from('winamax_bet_filters').upsert(sortedFilters))
      }
    }

    // 5. Upsert Bet Categories
    if (state.betCategories) {
      const betCategoriesToUpsert = R.map(
        nonNullNumericIdEntries(state.betCategories),
        ([id, betCategory]) => ({
          id,
          name: betCategory.name,
          display_order: betCategory.displayOrder,
          updated_at: now
        })
      )
      if (betCategoriesToUpsert.length > 0) {
        checkError(await client.from('winamax_bet_categories').upsert(betCategoriesToUpsert))
      }
    }

    // 6. Upsert Matches (without main_bet_id first to avoid FK circular dependency)
    if (state.matches) {
      const matchesToUpsert = R.map(
        nonNullNumericIdEntries(state.matches),
        ([id, match]) => ({
          id,
          sport_id: getSportId(match.sportId),
          category_id: getCategoryId(match.categoryId),
          tournament_id: getTournamentId(match.tournamentId),
          title: match.title,
          status: match.status,
          match_start: new Date(match.matchStart * 1000).toISOString(),
          competitor1_id: match.competitor1Id,
          competitor1_name: match.competitor1Name,
          competitor2_id: match.competitor2Id,
          competitor2_name: match.competitor2Name,
          score: match.score || null,
          updated_at: now
        })
      )
      if (matchesToUpsert.length > 0) {
        checkError(await client.from('winamax_matches').upsert(matchesToUpsert))
      }
    }

    // 7. Upsert Bets
    if (state.bets) {
      const betsToUpsert = R.map(
        nonNullNumericIdEntries(state.bets),
        ([id, bet]) => ({
          id,
          match_id: getMatchId(bet.matchId),
          title: bet.betTitle,
          bet_type_category_id: getBetCategoryId(bet.betTypeCategoryId),
          market_id: bet.marketId,
          updated_at: now
        })
      )
      if (betsToUpsert.length > 0) {
        checkError(await client.from('winamax_bets').upsert(betsToUpsert))
      }
    }

    // Re-fetch valid bet IDs for matches and outcomes
    const { data: existingBets } = await client.from('winamax_bets').select('id')
    const validBetIds = buildValidIds(existingBets || null, state.bets)

    const getBetId = (id: number | null | undefined) => (id && validBetIds.has(id)) ? id : null

    // 8. Update Matches with main_bet_id
    if (state.matches) {
      const matchesWithBetId = R.pipe(
        nonNullNumericIdEntries(state.matches),
        R.filter(([, match]) => !!match.mainBetId),
        R.map(([id, match]) => ({
          id,
          main_bet_id: getBetId(match.mainBetId),
          updated_at: now
        }))
      )
      if (matchesWithBetId.length > 0) {
        checkError(await client.from('winamax_matches').upsert(matchesWithBetId))
      }
    }

    // 9. Upsert Outcomes
    if (state.outcomes) {
      const outcomesToUpsert = R.map(
        nonNullNumericIdEntries(state.outcomes),
        ([id, outcome]) => ({
          id,
          bet_id: getBetId(outcome.betId),
          label: outcome.label,
          code: outcome.code || null,
          updated_at: now
        })
      )
      if (outcomesToUpsert.length > 0) {
        checkError(await client.from('winamax_outcomes').upsert(outcomesToUpsert))
      }
    }

    // 10. Historize Odds
    if (state.odds) {
      const oddsToInsert = R.pipe(
        Object.entries(state.odds),
        R.filter((entry): entry is [string, number] => entry[1] !== null),
        R.map(([outcomeIdStr, value]) => {
          const outcome_id = parsePositiveIntKey(outcomeIdStr)
          if (outcome_id === null) return null
          return {
            outcome_id,
            timestamp: oddsTimestampStr,
            value
          }
        }),
        R.filter((row): row is { outcome_id: number, timestamp: string, value: number } => row !== null)
      )
      if (oddsToInsert.length > 0) {
        // Use upsert to avoid duplicate key errors if the job runs multiple times within the same minute
        checkError(await client.from('winamax_odds_history').upsert(oddsToInsert))
      }
    }

    let deletedStaleLiveMatchesCount = 0
    const cleanupApplied = shouldCleanup && target === 'live'
    if (cleanupApplied) {
      const liveMatchIdsFromScrape = R.pipe(
        nonNullNumericIdEntries(state.matches),
        R.filter(([, match]) => match.status === 'LIVE'),
        R.map(([id]) => id)
      )

      const staleLiveDeleteQuery = client
        .from('winamax_matches')
        .delete({ count: 'exact' })
        .eq('status', 'LIVE')

      const staleLiveDeleteResult = liveMatchIdsFromScrape.length === 0
        ? await staleLiveDeleteQuery
        : await staleLiveDeleteQuery.not('id', 'in', `(${liveMatchIdsFromScrape.join(',')})`)

      checkError(staleLiveDeleteResult)
      deletedStaleLiveMatchesCount = staleLiveDeleteResult.count || 0
    }

    return {
      success: true,
      timestamp: now,
      cleanup: {
        requested: shouldCleanup,
        applied: cleanupApplied,
        deletedStaleLiveMatchesCount
      },
      summary: {
        sports: countNonNull(state.sports),
        categories: countNonNull(state.categories),
        tournaments: countNonNull(state.tournaments),
        filters: countNonNull(state.filters),
        betCategories: countNonNull(state.betCategories),
        matches: countNonNull(state.matches),
        bets: countNonNull(state.bets),
        outcomes: countNonNull(state.outcomes),
        odds: countNonNull(state.odds)
      }
    }
  } catch (error) {
    console.error('Winamax live data ingestion failed:', error)
    return {
      success: false,
      message: 'Failed to ingest live data from Winamax.',
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
