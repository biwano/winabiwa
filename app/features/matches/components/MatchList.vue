<script setup lang="ts">
import type { WinamaxMatch, MatchFilters } from '~~/app/types/database.friendly.types'

const client = useSupabaseClient()

const filters = ref<MatchFilters>({
  sport_id: null,
  tournament_id: null,
  category_id: null,
  search: ''
})

const page = ref(1)
const itemsPerPage = 20

// Reset page to 1 when filters change
watch(filters, () => {
  page.value = 1
}, { deep: true })

const { data: matchesData, pending } = await useAsyncData('matches', async () => {
  let query = client
    .from('winamax_matches')
    .select('*, sport:winamax_sports(*), category:winamax_categories(*), tournament:winamax_tournaments(*)', { count: 'exact' })
    .order('match_start', { ascending: false })

  if (filters.value.sport_id) {
    query = query.eq('sport_id', filters.value.sport_id)
  }

  if (filters.value.category_id) {
    query = query.eq('category_id', filters.value.category_id)
  }

  if (filters.value.tournament_id) {
    query = query.eq('tournament_id', filters.value.tournament_id)
  }

  if (filters.value.search) {
    query = query.ilike('title', `%${filters.value.search}%`)
  }

  const start = (page.value - 1) * itemsPerPage
  const end = start + itemsPerPage - 1

  const { data, count, error } = await query.range(start, end)

  if (error) {
    console.error('Error fetching matches:', error)
    return { matches: [], count: 0 }
  }

  return {
    matches: data,
    count: count || 0
  }
}, {
  watch: [page, filters],
  immediate: true
})

const totalPages = computed(() => Math.ceil((matchesData.value?.count || 0) / itemsPerPage))

const selectedMatch = ref<WinamaxMatch | null>(null)
const isSidePanelOpen = ref(false)

function openDetails(match: WinamaxMatch) {
  selectedMatch.value = match
  isSidePanelOpen.value = true
}

const columns = [
  { accessorKey: 'title', header: 'Match', id: 'title' },
  { accessorKey: 'sport', header: 'Sport', id: 'sport' },
  { accessorKey: 'tournament', header: 'Tournament', id: 'tournament' },
  { accessorKey: 'match_start', header: 'Start Time', id: 'match_start' },
  { accessorKey: 'status', header: 'Status', id: 'status' }
]

function getFormattedDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}
</script>

<template>
  <div class="space-y-6">
    <MatchFilters v-model="filters" />

    <UTable
      :data="matchesData?.matches || []"
      :columns="columns"
      :loading="pending"
      class="border rounded-lg"
    >
      <template #title-cell="{ row }">
        <div
          class="font-medium cursor-pointer hover:text-primary transition-colors"
          @click="openDetails(row.original)"
        >
          {{ row.original.title }}
        </div>
      </template>

      <template #sport-cell="{ row }">
        <UBadge
          variant="subtle"
          size="sm"
          color="neutral"
        >
          {{ row.original.sport?.name }}
        </UBadge>
      </template>

      <template #tournament-cell="{ row }">
        <span class="text-sm text-gray-500">
          {{ row.original.tournament?.name }}
        </span>
      </template>

      <template #match_start-cell="{ row }">
        <span class="text-sm text-gray-500">
          {{ getFormattedDate(row.original.match_start || '') }}
        </span>
      </template>

      <template #status-cell="{ row }">
        <UBadge
          :color="row.original.status === 'LIVE' ? 'error' : 'neutral'"
          variant="solid"
          size="sm"
        >
          {{ row.original.status }}
        </UBadge>
      </template>
    </UTable>

    <div
      v-if="totalPages > 1"
      class="flex justify-center mt-6"
    >
      <UPagination
        v-model:page="page"
        :total="matchesData?.count || 0"
        :items-per-page="itemsPerPage"
      />
    </div>

    <MatchDetailsSidePanel
      v-model:open="isSidePanelOpen"
      :match="selectedMatch"
    />
  </div>
</template>
