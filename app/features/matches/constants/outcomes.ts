/** Canonical Winamax label for the draw outcome (1X2). */
export const MATCH_NUL_OUTCOME_LABEL = 'match nul'

export function isMatchNulOutcome(label: string | null | undefined): boolean {
  return label?.trim().toLowerCase() === MATCH_NUL_OUTCOME_LABEL
}
