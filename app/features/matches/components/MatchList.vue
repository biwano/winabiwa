<script setup lang="ts">
import type { WinamaxMatch, MatchFilters, MatchTag, WinamaxSport, WinamaxCategory, WinamaxTournament } from '~~/app/types/database.friendly.types'

interface MatchTagLink {
  tag: MatchTag | null
}

interface MatchListRow extends WinamaxMatch {
  sport: WinamaxSport | null
  category: WinamaxCategory | null
  tournament: WinamaxTournament | null
  winamax_match_tags?: MatchTagLink[] | null
}

const client = useSupabaseClient()

const route = useRoute()
const router = useRouter()

function getInitialFilters(): MatchFilters {
  return {
    sport_id: route.query.sport_id ? Number(route.query.sport_id) : null,
    category_id: route.query.category_id ? Number(route.query.category_id) : null,
    tournament_id: route.query.tournament_id ? Number(route.query.tournament_id) : null,
    search: typeof route.query.search === 'string' ? route.query.search : '',
    live_only: route.query.live_only === 'true',
    has_tags: route.query.has_tags === 'true',
    has_outcomes: route.query.has_outcomes === undefined ? true : route.query.has_outcomes === 'true'
  }
}

const filters = ref<MatchFilters>(getInitialFilters())
const page = ref(route.query.page ? Number(route.query.page) : 1)
const itemsPerPage = 10

// Sync URL query when filters or page change
watch([filters, page], ([newFilters, newPage]) => {
  const query: Record<string, string | number | undefined> = {}

  if (newFilters.sport_id) query.sport_id = newFilters.sport_id
  if (newFilters.category_id) query.category_id = newFilters.category_id
  if (newFilters.tournament_id) query.tournament_id = newFilters.tournament_id
  if (newFilters.search) query.search = newFilters.search
  // Only add live_only to query if it's NOT the default (false)
  if (newFilters.live_only) query.live_only = 'true'
  // Only add has_tags to query if it's NOT the default (false)
  if (newFilters.has_tags) query.has_tags = 'true'
  // Only add has_outcomes to query if it's NOT the default (true)
  if (newFilters.has_outcomes === false) query.has_outcomes = 'false'
  if (newPage > 1) query.page = newPage

  // Only push if the query has actually changed to avoid redundant history entries
  const currentQuery = { ...route.query }
  const nextQuery = { ...query }

  // Compare keys and values
  const hasChanged = Object.keys(nextQuery).length !== Object.keys(currentQuery).length
    || Object.entries(nextQuery).some(([key, value]) => String(currentQuery[key]) !== String(value))

  if (hasChanged) {
    router.push({ query })
  }
}, { deep: true })

// Sync local state when URL query changes (e.g. back/forward button)
watch(() => route.query, (newQuery) => {
  const newFilters = {
    sport_id: newQuery.sport_id ? Number(newQuery.sport_id) : null,
    category_id: newQuery.category_id ? Number(newQuery.category_id) : null,
    tournament_id: newQuery.tournament_id ? Number(newQuery.tournament_id) : null,
    search: typeof newQuery.search === 'string' ? newQuery.search : '',
    live_only: newQuery.live_only === 'true',
    has_tags: newQuery.has_tags === 'true',
    has_outcomes: newQuery.has_outcomes === undefined ? true : newQuery.has_outcomes === 'true'
  }

  const newPage = newQuery.page ? Number(newQuery.page) : 1

  // Update only if different to avoid infinite loops
  if (JSON.stringify(newFilters) !== JSON.stringify(filters.value)) {
    filters.value = newFilters
  }
  if (newPage !== page.value) {
    page.value = newPage
  }
}, { deep: true })

// Reset page to 1 when filters change (unless the change came from the URL sync)
watch(filters, (newVal, oldVal) => {
  if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
    // If the filters changed but the page didn't (meaning it's a filter change, not a URL sync that included a page)
    // and if the current query page is the same as the current page ref, reset to 1
    if (page.value !== 1 && route.query.page && Number(route.query.page) === page.value) {
      page.value = 1
    } else if (page.value !== 1 && !route.query.page) {
      page.value = 1
    }
  }
}, { deep: true })

const { data: matchesData, pending } = await useAsyncData('matches', async () => {
  const tagsSelection = filters.value.has_tags
    ? 'winamax_match_tags!inner(tag:match_tags(*))'
    : 'winamax_match_tags(tag:match_tags(*))'

  let query = client
    .from('winamax_matches')
    .select(`*, sport:winamax_sports(*), category:winamax_categories(*), tournament:winamax_tournaments(*), ${tagsSelection}`, { count: 'exact' })
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

  if (filters.value.live_only) {
    query = query.eq('status', 'LIVE')
  }

  if (filters.value.has_outcomes) {
    query = query.not('main_bet_id', 'is', null)
  }

  const start = (page.value - 1) * itemsPerPage
  const end = start + itemsPerPage - 1

  const { data, count, error } = await query.range(start, end)

  if (error) {
    console.error('Error fetching matches:', error)
    return { matches: [], count: 0 }
  }

  const matches: WinamaxMatch[] = (data || []).map((match: MatchListRow) => {
    const tags = (match.winamax_match_tags || [])
      .map(link => link.tag)
      .filter((tag): tag is MatchTag => tag !== null)

    return {
      ...match,
      tags
    }
  })

  return {
    matches,
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
</script>

<template>
  <div class="space-y-4">
    <MatchFilters v-model="filters" />

    <MatchListMobile
      class="lg:hidden"
      :matches="matchesData?.matches || []"
      :loading="pending"
      @open-details="openDetails"
    />

    <MatchTableDesktop
      class="hidden lg:block"
      :matches="matchesData?.matches || []"
      :loading="pending"
      @open-details="openDetails"
    />

    <p class="text-sm text-gray-500">
      Total filtered matches: {{ matchesData?.count || 0 }}
    </p>

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
