<script setup lang="ts">
import type { WinamaxMatch } from '~~/app/types/database.friendly.types'

defineProps<{
  matches: WinamaxMatch[]
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'open-details', match: WinamaxMatch): void
}>()

function getFormattedDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}
</script>

<template>
  <div>
    <div
      v-if="loading"
      class="flex justify-center p-8"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="animate-spin w-6 h-6 text-gray-400"
      />
    </div>

    <template v-else>
      <div
        v-if="matches.length > 0"
        class="border rounded-lg bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden"
      >
        <div
          v-for="match in matches"
          :key="match.id"
          class="p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="emit('open-details', match)"
        >
          <div class="flex flex-col gap-2">
            <!-- Line 1: Name and Sport -->
            <div class="flex justify-between items-start gap-2">
              <span class="font-semibold text-primary break-words flex-1 min-w-0">
                {{ match.title }}
              </span>
              <UBadge
                variant="subtle"
                size="sm"
                color="neutral"
                class="flex-shrink-0"
              >
                {{ match.sport?.name }}
              </UBadge>
            </div>

            <!-- Line 2: Start time, score, status and tags -->
            <div class="flex justify-between items-center text-xs text-gray-500 gap-2">
              <span class="truncate flex-1 min-w-0">
                {{ getFormattedDate(match.match_start || '') }}
              </span>
              <span class="font-medium text-gray-700 dark:text-gray-200 flex-shrink-0">
                {{ match.score || '-' }}
              </span>
              <div class="flex items-center gap-1 flex-shrink-0">
                <UBadge
                  :color="match.status === 'LIVE' ? 'error' : 'neutral'"
                  variant="solid"
                  size="sm"
                >
                  {{ match.status }}
                </UBadge>
                <template v-if="match.tags && match.tags.length > 0">
                  <span
                    v-for="tag in match.tags"
                    :key="`${tag.id}-${tag.assigned_at}`"
                    :title="getFormattedDate(tag.assigned_at)"
                  >
                    <UBadge
                      size="sm"
                      color="primary"
                      variant="subtle"
                    >
                      {{ tag.code }}
                    </UBadge>
                  </span>
                </template>
                <span
                  v-else
                  class="text-gray-400"
                >
                  -
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-else
        class="p-8 text-center text-gray-500 border rounded-lg border-dashed"
      >
        No matches found.
      </div>
    </template>
  </div>
</template>
