import { load } from 'cheerio'
import { serverSupabaseServiceRole } from '#supabase/server'
import type { PostgrestError } from '@supabase/supabase-js'

async function fetchPreloadedState(url: string) {
  const html = await $fetch<string>(url)
  const $ = load(html)

  // Find the script tag containing PRELOADED_STATE
  let preloadedStateStr = ''
  $('script').each((_, script) => {
    const content = $(script).text()
    const startKey = 'var PRELOADED_STATE ='
    if (content.includes(startKey)) {
      const start = content.indexOf(startKey) + startKey.length
      const remaining = content.substring(start)

      // Find the matching closing brace by counting
      let braceCount = 0
      let jsonEnd = -1
      let inString: string | false = false
      let escape = false

      for (let i = 0; i < remaining.length; i++) {
        const char = remaining[i]

        if (escape) {
          escape = false
          continue
        }

        if (char === '\\') {
          escape = true
          continue
        }

        if (char === '"' || char === '\'' || char === '`') {
          if (inString === false) inString = char
          else if (inString === char) inString = false
          continue
        }

        if (inString === false) {
          if (char === '{') braceCount++
          if (char === '}') braceCount--

          if (braceCount === 0 && jsonEnd === -1 && i > 0) {
            // Check if we've seen at least one {
            const before = remaining.substring(0, i + 1)
            if (before.includes('{')) {
              jsonEnd = i + 1
              break
            }
          }
        }
      }

      if (jsonEnd !== -1) {
        preloadedStateStr = remaining.substring(0, jsonEnd).trim()
      }
    }
  })

  if (!preloadedStateStr) {
    throw createError({
      statusCode: 500,
      statusMessage: 'PRELOADED_STATE not found in the page'
    })
  }

  return JSON.parse(preloadedStateStr)
}

export default defineEventHandler(async (event) => {
  try {
    const state = await fetchPreloadedState('https://www.winamax.fr/paris-sportifs/calendar')
    // Use service role to bypass RLS for administrative structure update
    const client = serverSupabaseServiceRole(event)

    const now = new Date().toISOString()

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
    if (state.sports) {
      const sportsToUpsert = Object.entries(state.sports).map(([id, sport]: [string, unknown]) => ({
        id: parseInt(id),
        name: (sport as { sportName: string }).sportName,
        updated_at: now
      }))
      checkError(await client.from('winamax_sports').upsert(sportsToUpsert))
    }

    // 2. Upsert Categories
    if (state.categories) {
      const categoriesToUpsert = Object.entries(state.categories).map(([id, category]: [string, unknown]) => {
        // Find sport_id by looking into sports to find which sport contains this category
        let sportId: number | null = null
        if (state.sports) {
          for (const [sId, s] of Object.entries(state.sports)) {
            if ((s as { categories?: number[] }).categories?.includes(parseInt(id))) {
              sportId = parseInt(sId)
              break
            }
          }
        }

        return {
          id: parseInt(id),
          name: (category as { categoryName: string }).categoryName,
          flag: (category as { flag?: string }).flag || null,
          sport_id: sportId,
          updated_at: now
        }
      })
      checkError(await client.from('winamax_categories').upsert(categoriesToUpsert))
    }

    // 3. Upsert Tournaments
    if (state.tournaments) {
      const tournamentsToUpsert = Object.entries(state.tournaments).map(([id, tournament]: [string, unknown]) => {
        // Find category_id by looking into categories to find which category contains this tournament
        let categoryId: number | null = null
        if (state.categories) {
          for (const [cId, c] of Object.entries(state.categories)) {
            if ((c as { tournaments?: number[] }).tournaments?.includes(parseInt(id))) {
              categoryId = parseInt(cId)
              break
            }
          }
        }

        return {
          id: parseInt(id),
          name: (tournament as { tournamentName: string }).tournamentName,
          category_id: categoryId,
          sr_tournament_id: (tournament as { srTournamentId?: string }).srTournamentId || null,
          sr_season_id: (tournament as { srSeasonId?: string }).srSeasonId || null,
          updated_at: now
        }
      })
      checkError(await client.from('winamax_tournaments').upsert(tournamentsToUpsert))
    }

    // 4. Upsert Bet Filters
    if (state.filters) {
      const filtersToUpsert = Object.entries(state.filters).map(([id, filter]: [string, unknown]) => ({
        id: parseInt(id),
        name: (filter as { betFilterName: string }).betFilterName,
        parent_id: (filter as { betFilterParentId?: number }).betFilterParentId || null,
        is_default: !!(filter as { betFilterIsDefault?: number }).betFilterIsDefault,
        display_order: (filter as { displayOrder: number }).displayOrder,
        updated_at: now
      }))
      // Need to handle order of insertion for parent_id if using foreign keys
      // For now we'll just upsert and rely on the fact that the parent_id might exist in the same batch or a later one.
      // Better to sort by parent_id being null first
      const sortedFilters = filtersToUpsert.sort((a, b) => {
        if (a.parent_id === null && b.parent_id !== null) return -1
        if (a.parent_id !== null && b.parent_id === null) return 1
        return 0
      })
      checkError(await client.from('winamax_bet_filters').upsert(sortedFilters))
    }

    // 5. Upsert Bet Categories
    if (state.betCategories) {
      const betCategoriesToUpsert = Object.entries(state.betCategories).map(([id, cat]: [string, unknown]) => ({
        id: parseInt(id),
        name: (cat as { name: string }).name,
        display_order: (cat as { displayOrder: number }).displayOrder,
        updated_at: now
      }))
      checkError(await client.from('winamax_bet_categories').upsert(betCategoriesToUpsert))
    }

    return {
      success: true,
      timestamp: now,
      summary: {
        sports: Object.keys(state.sports || {}).length,
        categories: Object.keys(state.categories || {}).length,
        tournaments: Object.keys(state.tournaments || {}).length,
        filters: Object.keys(state.filters || {}).length,
        betCategories: Object.keys(state.betCategories || {}).length
      }
    }
  } catch (error: unknown) {
    console.error('Structure update failed:', error)
    throw createError({
      statusCode: 500,
      statusMessage: (error as Error).message || 'Unknown error during structure update'
    })
  }
})
