type TagBadgeColor = 'primary'

const ASSISTANT_TAG_BADGE_COLOR: TagBadgeColor = 'primary'
const ASSISTANT_TAG_CHART_COLOR = '#d946ef'

export function getTagBadgeColor(_code: string): TagBadgeColor {
  return ASSISTANT_TAG_BADGE_COLOR
}

export function getTagChartColor(_code: string): string {
  return ASSISTANT_TAG_CHART_COLOR
}
