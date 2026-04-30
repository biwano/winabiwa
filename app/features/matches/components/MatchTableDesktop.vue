<script setup lang="ts">
import type { WinamaxMatch } from '~~/app/types/database.friendly.types'

defineProps<{
  matches: WinamaxMatch[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-details', match: WinamaxMatch): void
}>()

const columns = [
  { accessorKey: 'title', header: 'Match', id: 'title' },
  { accessorKey: 'sport', header: 'Sport', id: 'sport' },
  { accessorKey: 'tournament', header: 'Tournament', id: 'tournament' },
  { accessorKey: 'score', header: 'Score', id: 'score' },
  { accessorKey: 'match_start', header: 'Start Time', id: 'match_start' },
  { accessorKey: 'status', header: 'Status', id: 'status' }
]

function getFormattedDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}
</script>

<template>
  <UTable
    :data="matches"
    :columns="columns"
    :loading="loading"
    class="border rounded-lg"
  >
    <template #title-cell="{ row }">
      <div
        class="font-medium cursor-pointer hover:text-primary transition-colors"
        @click="emit('open-details', row.original)"
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

    <template #score-cell="{ row }">
      <span class="text-sm text-gray-500">
        {{ row.original.score || '-' }}
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
</template>
