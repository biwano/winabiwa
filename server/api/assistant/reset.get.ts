import { serverSupabaseServiceRole } from '#supabase/server'

export default defineEventHandler(async (event) => {
  try {
    const client = serverSupabaseServiceRole(event)
    const now = new Date()

    const { error, count } = await client
      .from('winamax_match_tags')
      .delete({ count: 'exact' })
      .gte('match_id', 0)

    if (error) {
      throw createError({
        statusCode: 500,
        statusMessage: `Supabase error: ${error.message} (${error.code})`
      })
    }

    return {
      success: true,
      timestamp: now.toISOString(),
      deleted_match_tag_links: count ?? 0
    }
  } catch (error) {
    console.error('Assistant match-tag reset failed:', error)
    return {
      success: false,
      message: 'Failed to reset match tags.',
      error: error instanceof Error ? error.message : String(error)
    }
  }
})
