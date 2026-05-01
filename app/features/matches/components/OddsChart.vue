<script setup lang="ts">
import { use } from 'echarts/core.js'
import { CanvasRenderer } from 'echarts/renderers.js'
import { LineChart } from 'echarts/charts.js'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkPointComponent
} from 'echarts/components.js'
import VChart from 'vue-echarts'
import type { WinamaxOutcome, WinamaxOddsHistory } from '~~/app/types/database.friendly.types'

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  MarkPointComponent
])

const props = defineProps<{
  oddsHistory: WinamaxOddsHistory[]
  outcomes: WinamaxOutcome[]
  tags: {
    code: string
    created_at: string
  }[]
  title?: string
}>()

type TooltipPoint = [number, number | string]

type TooltipParam = {
  value: TooltipPoint
  marker: string
  seriesName: string
}

type TagPoint = {
  coord: [number, number]
  value: string
  symbol: string
  symbolSize: [number, number]
  itemStyle: {
    color: string
  }
  label: {
    show: boolean
    color: string
    fontSize: number
    fontWeight: string
    formatter: () => string
  }
}

type LineSeries = {
  name: string
  type: 'line'
  smooth: boolean
  data: [number, number][]
  lineStyle: {
    width: number
  }
  emphasis: {
    focus: 'series'
  }
  markPoint?: {
    symbolKeepAspect: boolean
    data: TagPoint[]
  }
}

const option = computed(() => {
  const sortedHistory = [...props.oddsHistory].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )
  const values = sortedHistory.map(item => item.value)
  const minValue = values.length > 0 ? Math.min(...values) : 0
  const maxValue = values.length > 0 ? Math.max(...values) : 1
  const valueRange = Math.max(maxValue - minValue, 0.1)
  const tagLevelStep = Math.max(valueRange * 0.1, 0.05)

  const tagTimestampCount = new Map<number, number>()
  const tagPoints: TagPoint[] = props.tags.map((tag) => {
    const timestamp = new Date(tag.created_at).getTime()
    const currentLevel = tagTimestampCount.get(timestamp) || 0
    tagTimestampCount.set(timestamp, currentLevel + 1)
    const coord: [number, number] = [timestamp, maxValue + tagLevelStep * (currentLevel + 1)]
    const symbolSize: [number, number] = [70, 22]

    return {
      coord,
      value: tag.code,
      symbol: 'roundRect',
      symbolSize,
      itemStyle: {
        color: '#d946ef'
      },
      label: {
        show: true,
        color: '#ffffff',
        fontSize: 10,
        fontWeight: 'bold',
        formatter: () => tag.code
      }
    }
  })
  console.log('tagPoints', tagPoints)
  const maxTagStack = tagTimestampCount.size > 0
    ? Math.max(...Array.from(tagTimestampCount.values()))
    : 0
  const yAxisMax = maxValue + tagLevelStep * (maxTagStack + 1)

  const series: LineSeries[] = props.outcomes.map((outcome) => {
    const data: [number, number][] = sortedHistory
      .filter(item => item.outcome_id === outcome.id)
      .map(item => [new Date(item.timestamp).getTime(), item.value])

    return {
      name: outcome.label || 'Unknown',
      type: 'line',
      smooth: true,
      data,
      lineStyle: {
        width: 3
      },
      emphasis: {
        focus: 'series'
      }
    }
  })

  if (series.length > 0 && tagPoints.length > 0) {
    const firstSeries = series[0]
    if (firstSeries) {
      firstSeries.markPoint = {
        symbolKeepAspect: true,
        data: tagPoints
      }
    }
  }

  return {
    title: {
      text: props.title,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: TooltipParam[]) => {
        if (!params || params.length === 0) return ''
        const firstParam = params[0]
        if (!firstParam) return ''
        let result = `${new Date(firstParam.value[0]).toLocaleString()}<br/>`
        params.forEach((param) => {
          result += `${param.marker} ${param.seriesName}: <b>${param.value[1]}</b><br/>`
        })
        return result
      }
    },
    legend: {
      top: 'bottom',
      padding: [10, 0, 0, 0]
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '15%',
      top: '5%',
      containLabel: true
    },
    xAxis: {
      type: 'time',
      boundaryGap: false
    },
    yAxis: {
      type: 'value',
      scale: true,
      max: yAxisMax
    },
    series
  }
})
</script>

<template>
  <div class="h-64 w-full">
    <VChart
      class="chart"
      :option="option"
      autoresize
    />
  </div>
</template>

<style scoped>
.chart {
  height: 100%;
}
</style>
