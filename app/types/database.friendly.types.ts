import type { Tables } from './database.types'

export type WinamaxSport = Tables<'winamax_sports'>
export type WinamaxCategory = Tables<'winamax_categories'>
export type WinamaxTournament = Tables<'winamax_tournaments'>
export type MatchTag = Tables<'match_tags'>
export type WinamaxMatchTag = Tables<'winamax_match_tags'>
export type WinamaxMatch = Tables<'winamax_matches'> & {
  sport?: WinamaxSport | null
  category?: WinamaxCategory | null
  tournament?: WinamaxTournament | null
  main_bet?: WinamaxBet | null
  tags?: MatchTag[]
}
export type WinamaxBet = Tables<'winamax_bets'> & {
  outcomes?: WinamaxOutcome[]
}
export type WinamaxOutcome = Tables<'winamax_outcomes'>
export type WinamaxOddsHistory = Tables<'winamax_odds_history'>

export interface MatchFilters {
  sport_id?: number | null
  tournament_id?: number | null
  category_id?: number | null
  search?: string
  live_only?: boolean
  has_outcomes?: boolean
}
