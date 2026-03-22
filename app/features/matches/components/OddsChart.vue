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
import type { WinamaxOddsHistory } from '~~/app/types/database.friendly.types'

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
  title?: string
}>()

const option = computed(() => {
  const sortedHistory = [...props.oddsHistory].sort((a, b) =>
    new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  )

  return {
    title: {
      text: props.title,
      left: 'center'
    },
    tooltip: {
      trigger: 'axis',
      formatter: (params: { value: [number, number] }[]) => {
        const data = params[0]
        if (!data) return ''
        return `${new Date(data.value[0]).toLocaleString()}<br/>Odds: <b>${data.value[1]}</b>`
      }
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
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
    series: [
      {
        name: 'Odds',
        type: 'line',
        smooth: true,
        data: sortedHistory.map(item => [new Date(item.timestamp).getTime(), item.value]),
        areaStyle: {
          opacity: 0.1
        },
        lineStyle: {
          width: 3
        },
        itemStyle: {
          color: '#d946ef' // Fuchsia-500
        }
      }
    ]
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
