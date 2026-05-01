type TagBadgeColor = 'primary'

const ASSISTANT_TAG_BADGE_COLOR: TagBadgeColor = 'primary'
const ASSISTANT_TAG_CHART_BACKGROUND_COLOR = '#dcfce7'
const ASSISTANT_TAG_CHART_BORDER_COLOR = '#4ade80'
const ASSISTANT_TAG_CHART_TEXT_COLOR = '#166534'

export function getTagBadgeColor(_code: string): TagBadgeColor {
  return ASSISTANT_TAG_BADGE_COLOR
}

export function getTagChartColor(_code: string): string {
  return ASSISTANT_TAG_CHART_BACKGROUND_COLOR
}

export function getTagChartBorderColor(_code: string): string {
  return ASSISTANT_TAG_CHART_BORDER_COLOR
}

export function getTagChartTextColor(_code: string): string {
  return ASSISTANT_TAG_CHART_TEXT_COLOR
}
