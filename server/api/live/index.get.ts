import {
  fetchWinamaxLiveData
} from '../../utils/winamax/live.js'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { PostgrestError } from '@supabase/supabase-js'

export default defineEventHandler(async (event) => {
  try {
    const state = await fetchWinamaxLiveData()
    const client = serverSupabaseServiceRole(event)
    const now = new Date().toISOString()

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

    const validSportIds = new Set([
      ...Object.keys(state.sports || {}).map(id => parseInt(id)),
      ...(existingSports || []).map(s => s.id)
    ])
    const validCategoryIds = new Set([
      ...Object.keys(state.categories || {}).map(id => parseInt(id)),
      ...(existingCategories || []).map(c => c.id)
    ])
    const validTournamentIds = new Set([
      ...Object.keys(state.tournaments || {}).map(id => parseInt(id)),
      ...(existingTournaments || []).map(t => t.id)
    ])
    const validBetCategoryIds = new Set([
      ...Object.keys(state.betCategories || {}).map(id => parseInt(id)),
      ...(existingBetCategories || []).map(bc => bc.id)
    ])
    const validBetFilterIds = new Set([
      ...Object.keys(state.filters || {}).map(id => parseInt(id)),
      ...(existingBetFilters || []).map(f => f.id)
    ])
    const validMatchIds = new Set([
      ...Object.keys(state.matches || {}).map(id => parseInt(id)),
      ...(existingMatches || []).map(m => m.id)
    ])

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
    const sportsToUpsert = []
    if (state.sports) {
      sportsToUpsert.push(...Object.entries(state.sports).map(([id, sport]) => {
        return {
          id: parseInt(id),
          name: sport.sportName,
          updated_at: now
        }
      }))
    }

    if (sportsToUpsert.length > 0) {
      checkError(await client.from('winamax_sports').upsert(sportsToUpsert))
    }

    // 2. Upsert Categories
    const categoriesToUpsert = []
    if (state.categories) {
      categoriesToUpsert.push(...Object.entries(state.categories).map(([id, category]) => {
        return {
          id: parseInt(id),
          name: category.categoryName,
          flag: category.flag || null,
          sport_id: getSportId(category.sportId),
          updated_at: now
        }
      }))
    }

    if (categoriesToUpsert.length > 0) {
      checkError(await client.from('winamax_categories').upsert(categoriesToUpsert))
    }

    // 3. Upsert Tournaments
    const tournamentsToUpsert = []
    if (state.tournaments) {
      tournamentsToUpsert.push(...Object.entries(state.tournaments).map(([id, tournament]) => {
        // Ensure categoryId is valid or null

        return {
          id: parseInt(id),
          name: tournament.tournamentName,
          category_id: getCategoryId(tournament.categoryId),
          sr_tournament_id: tournament.srTournamentId || null,
          sr_season_id: tournament.srSeasonId || null,
          updated_at: now
        }
      }))
    }

    if (tournamentsToUpsert.length > 0) {
      checkError(await client.from('winamax_tournaments').upsert(tournamentsToUpsert))
    }

    // 4. Upsert Bet Filters
    if (state.filters) {
      const filtersToUpsert = Object.entries(state.filters).map(([id, filter]) => {
        return {
          id: parseInt(id),
          name: filter.betFilterName,
          parent_id: getBetFilterId(filter.betFilterParentId),
          is_default: !!filter.betFilterIsDefault,
          display_order: filter.displayOrder,
          updated_at: now
        }
      })
      if (filtersToUpsert.length > 0) {
        const sortedFilters = filtersToUpsert.sort((a, b) => {
          if (a.parent_id === null && b.parent_id !== null) return -1
          if (a.parent_id !== null && b.parent_id === null) return 1
          return 0
        })
        checkError(await client.from('winamax_bet_filters').upsert(sortedFilters))
      }
    }

    // 5. Upsert Bet Categories
    if (state.betCategories) {
      const betCategoriesToUpsert = Object.entries(state.betCategories).map(([id, betCategory]) => {
        return {
          id: parseInt(id),
          name: betCategory.name,
          display_order: betCategory.displayOrder,
          updated_at: now
        }
      })
      if (betCategoriesToUpsert.length > 0) {
        checkError(await client.from('winamax_bet_categories').upsert(betCategoriesToUpsert))
      }
    }

    // 6. Upsert Matches (without main_bet_id first to avoid FK circular dependency)
    if (state.matches) {
      const matchesToUpsert = Object.entries(state.matches).map(([id, match]) => {
        return {
          id: parseInt(id),
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
          updated_at: now
        }
      })
      if (matchesToUpsert.length > 0) {
        checkError(await client.from('winamax_matches').upsert(matchesToUpsert))
      }
    }

    // 7. Upsert Bets
    if (state.bets) {
      const betsToUpsert = Object.entries(state.bets).map(([id, bet]) => {
        return {
          id: parseInt(id),
          match_id: getMatchId(bet.matchId),
          title: bet.betTitle,
          bet_type_category_id: getBetCategoryId(bet.betTypeCategoryId),
          market_id: bet.marketId,
          updated_at: now
        }
      })
      if (betsToUpsert.length > 0) {
        checkError(await client.from('winamax_bets').upsert(betsToUpsert))
      }
    }

    // Re-fetch valid bet IDs for matches and outcomes
    const { data: existingBets } = await client.from('winamax_bets').select('id')
    const validBetIds = new Set([
      ...Object.keys(state.bets || {}).map(id => parseInt(id)),
      ...(existingBets || []).map(b => b.id)
    ])

    const getBetId = (id: number | null | undefined) => (id && validBetIds.has(id)) ? id : null

    // 8. Update Matches with main_bet_id
    if (state.matches) {
      const matchesWithBetId = Object.entries(state.matches)
        .filter(([_, match]) => (match).mainBetId)
        .map(([id, match]) => {
          return {
            id: parseInt(id),
            main_bet_id: getBetId(match.mainBetId),
            updated_at: now
          }
        })
      if (matchesWithBetId.length > 0) {
        checkError(await client.from('winamax_matches').upsert(matchesWithBetId))
      }
    }

    // 9. Upsert Outcomes
    if (state.outcomes) {
      const outcomesToUpsert = Object.entries(state.outcomes).map(([id, outcome]) => {
        return {
          id: parseInt(id),
          bet_id: getBetId(outcome.betId),
          label: outcome.label,
          code: outcome.code || null,
          updated_at: now
        }
      })
      if (outcomesToUpsert.length > 0) {
        checkError(await client.from('winamax_outcomes').upsert(outcomesToUpsert))
      }
    }

    // 10. Historize Odds
    if (state.odds) {
      const oddsToInsert = Object.entries(state.odds).map(([outcomeId, value]) => ({
        outcome_id: parseInt(outcomeId),
        timestamp: oddsTimestampStr,
        value: value
      }))
      if (oddsToInsert.length > 0) {
        // Use upsert to avoid duplicate key errors if the job runs multiple times within the same minute
        checkError(await client.from('winamax_odds_history').upsert(oddsToInsert))
      }
    }

    return {
      success: true,
      timestamp: now,
      summary: {
        sports: Object.keys(state.sports || {}).length,
        categories: Object.keys(state.categories || {}).length,
        tournaments: Object.keys(state.tournaments || {}).length,
        filters: Object.keys(state.filters || {}).length,
        betCategories: Object.keys(state.betCategories || {}).length,
        matches: Object.keys(state.matches || {}).length,
        bets: Object.keys(state.bets || {}).length,
        outcomes: Object.keys(state.outcomes || {}).length,
        odds: Object.keys(state.odds || {}).length
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
