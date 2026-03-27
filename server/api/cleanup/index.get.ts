import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  try {
    const client = serverSupabaseServiceRole(event)
    const now = new Date()
    const threshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Delete matches older than 24 hours
    const { data, error, count } = await client
      .from('winamax_matches')
      .delete({ count: 'exact' })
      .lt('match_start', threshold)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error: ${error.message} (${error.code})`
      })
    }

    return {
      success: true,
      timestamp: now.toISOString(),
      threshold,
      deleted_matches_count: count || 0
    }
  } catch (error) {
    console.error('Winamax data cleanup failed:', error)
    return {
      success: false,
      message: 'Failed to cleanup data.',
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
