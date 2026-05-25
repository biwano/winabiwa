export const SIEGE_TAG_CODE = 'SIEGE'
export const TIRED_TAG_CODE = 'TIRED'
export const REVERSAL_TAG_CODE = 'REVERSAL'
export const MNAMT_TAG_CODE = 'MNAMT'

export type RuleCode =
  | typeof SIEGE_TAG_CODE
  | typeof TIRED_TAG_CODE
  | typeof REVERSAL_TAG_CODE
  | typeof MNAMT_TAG_CODE

export interface RuleTag {
  code: RuleCode
}

export const RULE_TAGS: RuleTag[] = [
  { code: SIEGE_TAG_CODE },
  { code: TIRED_TAG_CODE },
  { code: REVERSAL_TAG_CODE },
  { code: MNAMT_TAG_CODE }
]

export function isRuleCode(value: string): value is RuleCode {
  return (
    value === SIEGE_TAG_CODE
    || value === TIRED_TAG_CODE
    || value === REVERSAL_TAG_CODE
    || value === MNAMT_TAG_CODE
  )
}

export interface MatchRow {
  id: number
  main_bet_id: number | null
  match_start: string | null
  sport_name: string | null
  score: string | null
  competitor1_name: string | null
  competitor2_name: string | null
  favorite: {
    odds: OddRow[]
    label: string
    side: 'home' | 'away' | 'draw' | null
  }
  outsider: {
    odds: OddRow[]
    label: string
  }
  home: {
    odds: OddRow[]
    label: string
  }
  draw: {
    odds: OddRow[]
    label: string
  }
  away: {
    odds: OddRow[]
    label: string
  }
}

export interface OutcomeRow {
  id: number
  bet_id: number
  label: string | null
  code: string | null
}

export interface OddRow {
  outcome_id: number
  timestamp: string
  value: number
}

export interface LiveDataContext {
  liveMatches: MatchRow[]
  outcomesById: Record<number, OutcomeRow>
  outcomesByBet: Record<number, number[]>
  oddsByOutcome: Record<number, OddRow[]>
}
