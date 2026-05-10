import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '~~/app/types/database.types'
import type { WinamaxMatch } from '~~/app/types/database.friendly.types'
import { isMatchNulOutcome } from '~~/app/features/matches/constants/outcomes.js'

/**
 * Keeps matches whose main bet has, for every outcome that is not "match nul",
 * a latest odds-history value >= minOdd. Match nul is never checked.
 * Matches with no such outcomes are kept.
 */
export async function filterMatchesByMinOddExcludingMatchNul(
  client: SupabaseClient<Database>,
  matches: WinamaxMatch[],
  minOdd: number
): Promise<WinamaxMatch[]> {
  const betIds = [
    ...new Set(
      matches
        .map(m => m.main_bet_id)
        .filter((id): id is number => typeof id === 'number')
    )
  ]
  if (betIds.length === 0) return matches

  const { data: outcomeRows, error: outcomesError } = await client
    .from('winamax_outcomes')
    .select('id, bet_id, label')
    .in('bet_id', betIds)

  if (outcomesError) {
    console.error('Error fetching outcomes for min-odd filter:', outcomesError)
    return []
  }

  const nonMatchNulIdsByBet = new Map<number, number[]>()
  for (const row of outcomeRows || []) {
    if (row.bet_id == null) continue
    if (isMatchNulOutcome(row.label)) continue
    const list = nonMatchNulIdsByBet.get(row.bet_id) ?? []
    list.push(row.id)
    nonMatchNulIdsByBet.set(row.bet_id, list)
  }

  const allTrackedIds = [...nonMatchNulIdsByBet.values()].flat()
  if (allTrackedIds.length === 0) return matches

  const { data: historyRows, error: historyError } = await client
    .from('winamax_odds_history')
    .select('outcome_id, value, timestamp')
    .in('outcome_id', allTrackedIds)
    .order('timestamp', { ascending: false })

  if (historyError) {
    console.error('Error fetching odds for min-odd filter:', historyError)
    return []
  }

  const latestOddByOutcomeId = new Map<number, number>()
  for (const row of historyRows || []) {
    if (!latestOddByOutcomeId.has(row.outcome_id)) {
      latestOddByOutcomeId.set(row.outcome_id, row.value)
    }
  }

  return matches.filter((match) => {
    const bid = match.main_bet_id
    if (bid == null) return false
    const ids = nonMatchNulIdsByBet.get(bid) ?? []
    if (ids.length === 0) return true
    return ids.every((outcomeId) => {
      const v = latestOddByOutcomeId.get(outcomeId)
      if (v === undefined) return false
      return v >= minOdd
    })
  })
}
