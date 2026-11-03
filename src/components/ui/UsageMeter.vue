<script setup lang="ts">
import { computed } from 'vue'

import { formatNumber } from '@/utils/format'
import { usageLevel, usageRatio, type UsageItem } from '@/utils/usage'

const props = withDefaults(defineProps<{ item: UsageItem; compact?: boolean }>(), {
  compact: false,
})

const level = computed(() => usageLevel(props.item))
const ratio = computed(() => usageRatio(props.item))

// Fill carries severity; the track is a lighter step of the same ramp.
const fill = { ok: 'bg-brand-600', warning: 'bg-amber-500', full: 'bg-red-500' }
const track = { ok: 'bg-brand-100', warning: 'bg-amber-100', full: 'bg-red-100' }
</script>

<template>
  <div>
    <div class="flex items-baseline justify-between gap-2" :class="compact ? 'text-xs' : 'text-sm'">
      <span class="text-charcoal-600 font-medium">{{ item.label }}</span>
      <span class="tabular text-charcoal-500">
        <span class="text-charcoal-700 font-semibold">{{ formatNumber(item.used) }}</span>
        / {{ item.limit === null ? 'Unlimited' : formatNumber(item.limit) }}
      </span>
    </div>
    <div
      class="mt-1.5 h-1.5 overflow-hidden rounded-full"
      :class="item.limit === null ? 'bg-charcoal-100' : track[level]"
      role="meter"
      :aria-label="item.label"
      :aria-valuenow="item.used"
      :aria-valuemin="0"
      :aria-valuemax="item.limit ?? undefined"
    >
      <div
        v-if="item.limit !== null"
        class="h-full rounded-full transition-[width]"
        :class="fill[level]"
        :style="{ width: `${Math.max(ratio * 100, 2)}%` }"
      />
    </div>
    <p v-if="!compact && level === 'full'" class="mt-1 text-xs text-red-700">
      Limit reached — upgrade to add more.
    </p>
  </div>
</template>
