<script setup lang="ts">
import type { MatchTagAssignmentRow } from '~~/app/types/database.friendly.types'
import { getTagBadgeColor } from '~~/app/features/matches/utils/tag-colors.js'

defineProps<{
  rows: MatchTagAssignmentRow[]
}>()

function formatAssignedAt(iso: string) {
  return new Date(iso).toLocaleString()
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div
      v-for="row in rows"
      :key="`${row.code}-${row.created_at}`"
      class="flex flex-wrap items-center gap-2"
    >
      <UBadge
        size="sm"
        :color="getTagBadgeColor(row.code)"
        variant="subtle"
      >
        {{ row.code }}
      </UBadge>
      <span class="text-sm text-gray-500">{{ formatAssignedAt(row.created_at) }}</span>
    </div>
  </div>
</template>
