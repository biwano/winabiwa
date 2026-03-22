<script setup lang="ts">
import { use } from 'echarts/core.js'
import { CanvasRenderer } from 'echarts/renderers.js'
import { LineChart } from 'echarts/charts.js'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
} from 'echarts/components.js'
import VChart from 'vue-echarts'
import type { WinamaxOutcome, WinamaxOddsHistory } from '~~/app/types/database.friendly.types'

use([
  CanvasRenderer,
  LineChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent
])

const props = defineProps<{
  oddsHistory: WinamaxOddsHistory[]
  outcomes: WinamaxOutcome[]
  title?: string
}>()

const option = computed(() => {
  const sortedHistory = [...props.oddsHistory].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  const series = props.outcomes.map(outcome => {
    const data = sortedHistory
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

  return {
    title: {
      text: props.title,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any[]) => {
        if (!params || params.length === 0) return ''
        let result = `${new Date(params[0].value[0]).toLocaleString()}<br/>`
        params.forEach(param => {
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
      scale: true
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
