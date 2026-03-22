<script setup lang="ts">
import type { MatchFilters, WinamaxSport, WinamaxCategory, WinamaxTournament } from '~~/app/types/database.friendly.types'

const props = defineProps<{
  modelValue: MatchFilters
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: MatchFilters): void
}>()

const filters = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
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
    filters.value.category_id = null
    filters.value.tournament_id = null
    return
  }
  
  const { data } = await client
    .from('winamax_categories')
    .select('*')
    .eq('sport_id', sportId)
    .order('name')
  
  categories.value = data || []
  filters.value.category_id = null
  filters.value.tournament_id = null
}, { immediate: true })

// Fetch tournaments based on selected category
watch(() => filters.value.category_id, async (categoryId) => {
  if (!categoryId) {
    tournaments.value = []
    filters.value.tournament_id = null
    return
  }
  
  const { data } = await client
    .from('winamax_tournaments')
    .select('*')
    .eq('category_id', categoryId)
    .order('name')
  
  tournaments.value = data || []
  filters.value.tournament_id = null
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
    search: ''
  }
}
</script>

<template>
  <div class="flex flex-col md:flex-row gap-4 mb-6">
    <UInput
      v-model="filters.search"
      icon="i-lucide-search"
      placeholder="Search match title..."
      class="flex-1"
    />
    
    <USelect
      v-model="filters.sport_id"
      :options="sportOptions"
      class="w-full md:w-48"
    />
    
    <USelect
      v-model="filters.category_id"
      :options="categoryOptions"
      :disabled="!filters.sport_id"
      class="w-full md:w-48"
    />
    
    <USelect
      v-model="filters.tournament_id"
      :options="tournamentOptions"
      :disabled="!filters.category_id"
      class="w-full md:w-48"
    />

    <UButton
      icon="i-lucide-x"
      color="neutral"
      variant="ghost"
      @click="resetFilters"
      v-if="filters.sport_id || filters.category_id || filters.tournament_id || filters.search"
    />
  </div>
</template>
