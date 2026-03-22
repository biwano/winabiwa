import { load } from 'cheerio';
import { serverSupabaseClient } from '#supabase/server';

export default defineEventHandler(async (event) => {
  try {
    const html = await $fetch<string>('https://www.winamax.fr/paris-sportifs/calendar');
    const $ = load(html);
    
    // Find the script tag containing PRELOADED_STATE
    let preloadedStateStr = '';
    $('script').each((_, script) => {
      const content = $(script).text();
      if (content.includes('var PRELOADED_STATE =')) {
        const start = content.indexOf('var PRELOADED_STATE =') + 'var PRELOADED_STATE ='.length;
        const end = content.indexOf(';', start);
        preloadedStateStr = content.substring(start, end).trim();
      }
    });

    if (!preloadedStateStr) {
      throw createError({
        statusCode: 500,
        statusMessage: 'PRELOADED_STATE not found in the page'
      });
    }

    const state = JSON.parse(preloadedStateStr);
    const client = await serverSupabaseClient(event);

    const now = new Date().toISOString();

    // 1. Upsert Sports
    if (state.sports) {
      const sportsToUpsert = Object.entries(state.sports).map(([id, sport]: [string, any]) => ({
        id: parseInt(id),
        name: sport.sportName,
        updated_at: now
      }));
      await client.from('winamax_sports').upsert(sportsToUpsert);
    }

    // 2. Upsert Categories
    if (state.categories) {
      const categoriesToUpsert = Object.entries(state.categories).map(([id, category]: [string, any]) => {
        // Find sport_id by looking into sports to find which sport contains this category
        let sportId: number | null = null;
        if (state.sports) {
          for (const [sId, s] of Object.entries(state.sports)) {
            if ((s as any).categories?.includes(parseInt(id))) {
              sportId = parseInt(sId);
              break;
            }
          }
        }

        return {
          id: parseInt(id),
          name: category.categoryName,
          flag: category.flag || null,
          sport_id: sportId,
          updated_at: now
        };
      });
      await client.from('winamax_categories').upsert(categoriesToUpsert);
    }

    // 3. Upsert Tournaments
    if (state.tournaments) {
      const tournamentsToUpsert = Object.entries(state.tournaments).map(([id, tournament]: [string, any]) => {
        // Find category_id by looking into categories to find which category contains this tournament
        let categoryId: number | null = null;
        if (state.categories) {
          for (const [cId, c] of Object.entries(state.categories)) {
            if ((c as any).tournaments?.includes(parseInt(id))) {
              categoryId = parseInt(cId);
              break;
            }
          }
        }

        return {
          id: parseInt(id),
          name: tournament.tournamentName,
          category_id: categoryId,
          sr_tournament_id: tournament.srTournamentId || null,
          sr_season_id: tournament.srSeasonId || null,
          updated_at: now
        };
      });
      await client.from('winamax_tournaments').upsert(tournamentsToUpsert);
    }

    // 4. Upsert Bet Filters
    if (state.filters) {
      const filtersToUpsert = Object.entries(state.filters).map(([id, filter]: [string, any]) => ({
        id: parseInt(id),
        name: filter.betFilterName,
        parent_id: filter.betFilterParentId || null,
        is_default: !!filter.betFilterIsDefault,
        display_order: filter.displayOrder,
        updated_at: now
      }));
      // Need to handle order of insertion for parent_id if using foreign keys
      // For now we'll just upsert and rely on the fact that the parent_id might exist in the same batch or a later one.
      // Better to sort by parent_id being null first
      const sortedFilters = filtersToUpsert.sort((a, b) => {
        if (a.parent_id === null && b.parent_id !== null) return -1;
        if (a.parent_id !== null && b.parent_id === null) return 1;
        return 0;
      });
      await client.from('winamax_bet_filters').upsert(sortedFilters);
    }

    // 5. Upsert Bet Categories
    if (state.betCategories) {
      const betCategoriesToUpsert = Object.entries(state.betCategories).map(([id, cat]: [string, any]) => ({
        id: parseInt(id),
        name: cat.name,
        display_order: cat.displayOrder,
        updated_at: now
      }));
      await client.from('winamax_bet_categories').upsert(betCategoriesToUpsert);
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
    };

  } catch (error: any) {
    console.error('Snapshot failed:', error);
    throw createError({
      statusCode: 500,
      statusMessage: error.message || 'Unknown error during snapshot'
    });
  }
});
