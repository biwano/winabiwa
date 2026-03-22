<script setup lang="ts">
import type { WinamaxMatch, WinamaxOutcome, WinamaxOddsHistory } from '~~/app/types/database.friendly.types'

const props = defineProps<{
  match: WinamaxMatch | null
  open: boolean
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
}>()

const isOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val)
})

const client = useSupabaseClient()

const outcomes = ref<WinamaxOutcome[]>([])
const selectedOutcomeId = ref<number | null>(null)
const oddsHistory = ref<WinamaxOddsHistory[]>([])
const pending = ref(false)

// Fetch outcomes for the main bet
watch(() => props.match, async (newMatch) => {
  if (!newMatch?.main_bet_id) {
    outcomes.value = []
    selectedOutcomeId.value = null
    return
  }

  pending.value = true
  try {
    const { data } = await client
      .from('winamax_outcomes')
      .select('*')
      .eq('bet_id', newMatch.main_bet_id)
    
    outcomes.value = data || []
    if (outcomes.value.length > 0) {
      selectedOutcomeId.value = outcomes.value[0].id
    }
  } catch (error) {
    console.error('Error fetching outcomes:', error)
  } finally {
    pending.value = false
  }
}, { immediate: true })

// Fetch odds history for the selected outcome
watch(selectedOutcomeId, async (id) => {
  if (!id) {
    oddsHistory.value = []
    return
  }

  pending.value = true
  try {
    const { data } = await client
      .from('winamax_odds_history')
      .select('*')
      .eq('outcome_id', id)
      .order('timestamp', { ascending: true })
    
    oddsHistory.value = data || []
  } catch (error) {
    console.error('Error fetching odds history:', error)
  } finally {
    pending.value = false
  }
}, { immediate: true })

const selectedOutcomeLabel = computed(() => 
  outcomes.value.find(o => o.id === selectedOutcomeId.value)?.label || ''
)
</script>

<template>
  <USlideover v-model="isOpen" title="Match Details">
    <template #body>
      <div v-if="match" class="space-y-6">
        <div>
          <h2 class="text-xl font-bold">{{ match.title }}</h2>
          <p class="text-sm text-gray-500">
            {{ match.match_start ? new Date(match.match_start).toLocaleString() : '' }}
          </p>
        </div>

        <div v-if="outcomes.length > 0" class="space-y-4">
          <USelect
            v-model="selectedOutcomeId"
            :options="outcomes.map(o => ({ label: o.label, value: o.id }))"
            placeholder="Select an outcome"
            class="w-full"
          />

          <div v-if="oddsHistory.length > 0">
            <h3 class="text-sm font-semibold mb-2">Odds Evolution: {{ selectedOutcomeLabel }}</h3>
            <OddsChart :odds-history="oddsHistory" />
          </div>
          <div v-else-if="!pending" class="text-sm text-gray-500 italic">
            No odds history found for this outcome.
          </div>
          <div v-else class="flex justify-center py-10">
            <UIcon name="i-lucide-loader-2" class="animate-spin text-2xl text-primary" />
          </div>
        </div>
        <div v-else-if="!pending" class="text-sm text-gray-500 italic">
          No outcomes found for the main bet.
        </div>
      </div>
    </template>
  </USlideover>
</template>
