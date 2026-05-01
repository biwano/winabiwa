<script setup lang="ts">
import type { MatchTag, WinamaxMatch, WinamaxOutcome, WinamaxOddsHistory } from '~~/app/types/database.friendly.types'
import { copyTextToClipboard } from '~~/app/features/matches/utils/clipboard.js'

const props = defineProps<{
  match: WinamaxMatch | null
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: val => emit('update:open', val)
})

const client = useSupabaseClient()

const outcomes = ref<WinamaxOutcome[]>([])
const oddsHistory = ref<WinamaxOddsHistory[]>([])
type MatchTagLink = {
  created_at: string
  tag: MatchTag | null
}
type ChartTagPoint = {
  code: string
  created_at: string
}
const chartTags = ref<ChartTagPoint[]>([])
const pending = ref(false)
const copiedMatchId = ref(false)
let copiedResetTimer: ReturnType<typeof setTimeout> | null = null

async function copyMatchIdToClipboard(matchId: string | number): Promise<void> {
  const copied = await copyTextToClipboard(String(matchId))
  if (!copied) return

  copiedMatchId.value = true
  if (copiedResetTimer) clearTimeout(copiedResetTimer)
  copiedResetTimer = setTimeout(() => {
    copiedMatchId.value = false
  }, 1500)
}

function resetCopiedMatchIdUi(): void {
  copiedMatchId.value = false
  if (copiedResetTimer) {
    clearTimeout(copiedResetTimer)
    copiedResetTimer = null
  }
}

function toChartTags(data: MatchTagLink[] | null): ChartTagPoint[] {
  if (!data) return []
  return data
    .map((link) => {
      if (!link.tag || typeof link.tag.code !== 'string') return null
      return {
        code: link.tag.code,
        created_at: link.created_at
      }
    })
    .filter((tag): tag is ChartTagPoint => tag !== null)
}

// Fetch outcomes and then their odds history
watch(() => props.match, async (newMatch) => {
  resetCopiedMatchIdUi()
  if (!newMatch?.main_bet_id) {
    outcomes.value = []
    oddsHistory.value = []
    chartTags.value = []
    return
  }

  pending.value = true
  try {
    const { data: outcomesData } = await client
      .from('winamax_outcomes')
      .select('*')
      .eq('bet_id', newMatch.main_bet_id)

    outcomes.value = outcomesData || []

    if (outcomes.value.length > 0) {
      const outcomeIds = outcomes.value.map(o => o.id)
      const { data: historyData } = await client
        .from('winamax_odds_history')
        .select('*')
        .in('outcome_id', outcomeIds)
        .order('timestamp', { ascending: true })

      oddsHistory.value = historyData || []
    } else {
      oddsHistory.value = []
    }

    const { data: matchTagsData, error: matchTagsError } = await client
      .from('winamax_match_tags')
      .select('created_at, tag:match_tags(*)')
      .eq('match_id', newMatch.id)
      .order('created_at', { ascending: true })

    if (matchTagsError) throw matchTagsError
    chartTags.value = toChartTags(matchTagsData)
  } catch (error) {
    console.error('Error fetching data:', error)
  } finally {
    pending.value = false
  }
}, { immediate: true })

onBeforeUnmount(() => {
  if (copiedResetTimer) clearTimeout(copiedResetTimer)
})
</script>

<template>
  <USlideover
    v-model:open="isOpen"
    title="Match Details"
    :ui="{ content: 'max-w-4xl' }"
  >
    <template #body>
      <div
        v-if="match"
        class="space-y-6 p-6 overflow-y-auto"
      >
        <div class="flex items-start justify-between gap-4">
          <div class="flex-1 min-w-0">
            <h2 class="text-xl font-bold truncate">
              {{ match.title }}
            </h2>
            <p class="text-sm text-gray-500">
              {{ match.match_start ? new Date(match.match_start).toLocaleString() : '' }}
            </p>
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <button
              v-if="match"
              type="button"
              class="text-[10px] leading-none text-gray-500 hover:text-gray-700 font-mono transition-colors cursor-pointer"
              :title="copiedMatchId ? 'Copied' : 'Click to copy match ID'"
              @click="copyMatchIdToClipboard(match.id)"
            >
              {{ copiedMatchId ? 'Copied' : `ID: ${match.id}` }}
            </button>
            <UButton
              v-if="match"
              :to="`https://www.winamax.fr/paris-sportifs/match/${match.id}`"
              target="_blank"
              color="neutral"
              variant="ghost"
              icon="i-lucide-external-link"
              size="sm"
              title="Open on Winamax"
            />
          </div>
        </div>

        <div
          v-if="outcomes.length > 0"
          class="space-y-4"
        >
          <div v-if="oddsHistory.length > 0">
            <h3 class="text-sm font-semibold mb-2">
              Odds Evolution
            </h3>
            <OddsChart
              :odds-history="oddsHistory"
              :outcomes="outcomes"
              :tags="chartTags"
            />
          </div>
          <div
            v-else-if="!pending"
            class="text-sm text-gray-500 italic"
          >
            No odds history found.
          </div>
          <div
            v-else
            class="flex justify-center py-10"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="animate-spin text-2xl text-primary"
            />
          </div>
        </div>
        <div
          v-else-if="!pending"
          class="text-sm text-gray-500 italic"
        >
          No outcomes found for the main bet.
        </div>
      </div>
    </template>
  </USlideover>
</template>
