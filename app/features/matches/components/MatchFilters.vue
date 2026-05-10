<script setup lang="ts">
import type { MatchFilters, WinamaxSport, WinamaxCategory, WinamaxTournament } from '~~/app/types/database.friendly.types'
import { MATCH_NUL_OUTCOME_LABEL } from '~~/app/features/matches/constants/outcomes.js'

const props = defineProps<{
  modelValue: MatchFilters
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: MatchFilters): void
}>()

const filters = ref<MatchFilters>({ ...props.modelValue })

// Sync local state when prop changes
watch(() => props.modelValue, (newVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(filters.value)) {
    filters.value = { ...newVal }
  }
}, { deep: true })

// Emit changes to parent as a new object to trigger parent watches
watch(filters, (newVal) => {
  emit('update:modelValue', { ...newVal })
}, { deep: true })

watch(() => filters.value.live_only, (live) => {
  if (!live) filters.value.min_odd = null
})

const client = useSupabaseClient()

const sports = ref<WinamaxSport[]>([])
const categories = ref<WinamaxCategory[]>([])
const tournaments = ref<WinamaxTournament[]>([])

// Fetch all sports
const { data: sportsData } = await useAsyncData('sports', async () => {
  const { data } = await client.from('winamax_sports').select('*').order('name')
  return data || []
})
sports.value = sportsData.value || []

// Fetch categories based on selected sport
watch(() => filters.value.sport_id, async (sportId) => {
  if (!sportId) {
    categories.value = []
    if (filters.value.category_id !== null) filters.value.category_id = null
    if (filters.value.tournament_id !== null) filters.value.tournament_id = null
    return
  }

  const { data } = await client
    .from('winamax_categories')
    .select('*')
    .eq('sport_id', sportId)
    .order('name')

  categories.value = data || []

  // Reset category and tournament only if the current category doesn't belong to the new sport
  // and if it's not being synced from the parent prop
  const currentCategoryIsValid = categories.value.some(c => c.id === filters.value.category_id)
  if (!currentCategoryIsValid && filters.value.category_id !== props.modelValue.category_id) {
    filters.value.category_id = null
    filters.value.tournament_id = null
  }
}, { immediate: true })

// Fetch tournaments based on selected category
watch(() => filters.value.category_id, async (categoryId) => {
  if (!categoryId) {
    tournaments.value = []
    if (filters.value.tournament_id !== null) filters.value.tournament_id = null
    return
  }

  const { data } = await client
    .from('winamax_tournaments')
    .select('*')
    .eq('category_id', categoryId)
    .order('name')

  tournaments.value = data || []

  // Reset tournament only if the current tournament doesn't belong to the new category
  // and if it's not being synced from the parent prop
  const currentTournamentIsValid = tournaments.value.some(t => t.id === filters.value.tournament_id)
  if (!currentTournamentIsValid && filters.value.tournament_id !== props.modelValue.tournament_id) {
    filters.value.tournament_id = null
  }
}, { immediate: true })

const sportOptions = computed(() => [
  { label: 'All Sports', value: null },
  ...sports.value.map(s => ({ label: s.name, value: s.id }))
])

const categoryOptions = computed(() => [
  { label: 'All Categories', value: null },
  ...categories.value.map(c => ({ label: c.name, value: c.id }))
])

const tournamentOptions = computed(() => [
  { label: 'All Tournaments', value: null },
  ...tournaments.value.map(t => ({ label: t.name, value: t.id }))
])

function resetFilters() {
  filters.value = {
    sport_id: null,
    category_id: null,
    tournament_id: null,
    search: '',
    live_only: false,
    min_odd: null,
    starts_soon: true,
    has_tags: false,
    has_outcomes: true
  }
}

function setMinOddFromInput(raw: string | number | null | undefined): void {
  if (raw === '' || raw === null || raw === undefined) {
    filters.value.min_odd = null
    return
  }
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw))
  filters.value.min_odd = Number.isFinite(n) && n > 0 ? n : null
}
</script>

<template>
  <div class="flex flex-col gap-4 mb-4">
    <div class="flex flex-col md:flex-row gap-4">
      <UInput
        v-model="filters.search"
        icon="i-lucide-search"
        placeholder="Search match title..."
        class="flex-1"
      />

      <USelect
        v-model="filters.sport_id"
        :items="sportOptions"
        class="w-full md:w-48"
      />

      <USelect
        v-model="filters.category_id"
        :items="categoryOptions"
        :disabled="!filters.sport_id"
        class="w-full md:w-48"
      />

      <USelect
        v-model="filters.tournament_id"
        :items="tournamentOptions"
        :disabled="!filters.category_id"
        class="w-full md:w-48"
      />

      <UButton
        v-if="filters.sport_id || filters.category_id || filters.tournament_id || filters.search || filters.live_only || filters.min_odd != null || !filters.starts_soon || filters.has_tags || !filters.has_outcomes"
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        @click="resetFilters"
      />
    </div>

    <div class="flex flex-wrap items-center gap-2">
      <UCheckbox
        v-model="filters.live_only"
        label="Show only live matches"
      />
      <UInput
        v-if="filters.live_only"
        :model-value="filters.min_odd == null ? '' : String(filters.min_odd)"
        type="number"
        step="0.01"
        min="1"
        :placeholder="`Min. odd (excl. ${MATCH_NUL_OUTCOME_LABEL})`"
        class="w-52"
        @update:model-value="setMinOddFromInput"
      />
      <UCheckbox
        v-model="filters.starts_soon"
        label="Show only matches that start soon"
      />
      <UCheckbox
        v-model="filters.has_tags"
        label="Show only tagged matches"
      />
      <UCheckbox
        v-model="filters.has_outcomes"
        label="Show only matches with outcomes"
      />
    </div>
  </div>
</template>
