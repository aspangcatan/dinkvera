<script setup lang="ts">
import { Check } from '@lucide/vue'
import { computed } from 'vue'

import type { BillingCycle, Plan } from '@/types/billing'
import { formatPHP } from '@/utils/currency'
import { formatNumber } from '@/utils/format'

/** One plan's price, limits and features. Used on pricing and plan pickers. */
const props = withDefaults(
  defineProps<{
    plan: Plan
    cycle: BillingCycle
    current?: boolean
    dark?: boolean
  }>(),
  { current: false, dark: false },
)

const price = computed(() =>
  props.cycle === 'annual' ? Math.round(props.plan.annualPrice / 12) : props.plan.monthlyPrice,
)

const limits = computed(() => {
  const l = props.plan.limits
  const fmt = (v: number | null, unit: string) =>
    v === null ? `Unlimited ${unit}` : `${formatNumber(v)} ${unit}`
  return [
    fmt(l.locations, l.locations === 1 ? 'location' : 'locations'),
    fmt(l.courts, 'courts'),
    l.bookingsPerMonth === null
      ? 'Unlimited bookings'
      : `${formatNumber(l.bookingsPerMonth)} bookings / mo`,
  ]
})
</script>

<template>
  <div
    class="relative flex h-full flex-col rounded-2xl border p-6"
    :class="[
      dark ? 'bg-forest-800 border-forest-700 text-white' : 'border-charcoal-100 bg-white',
      plan.highlighted && !dark ? 'ring-brand-600 ring-2' : '',
      plan.highlighted && dark ? 'ring-2 ring-lime-300' : '',
    ]"
  >
    <span
      v-if="current"
      class="bg-brand-600 absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white"
      >Current plan</span
    >
    <span
      v-else-if="plan.comingSoon"
      class="absolute -top-3 left-6 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800"
      >Coming soon</span
    >
    <span
      v-else-if="plan.highlighted"
      class="absolute -top-3 left-6 rounded-full px-2.5 py-0.5 text-[11px] font-semibold"
      :class="dark ? 'text-forest-900 bg-lime-300' : 'bg-brand-600 text-white'"
      >Most popular</span
    >
    <p class="text-lg font-semibold">{{ plan.name }}</p>
    <p class="mt-1 text-sm" :class="dark ? 'text-forest-200' : 'text-charcoal-400'">
      {{ plan.description }}
    </p>
    <p class="mt-5 flex items-baseline gap-1">
      <span class="tabular text-3xl font-semibold tracking-tight">{{ formatPHP(price) }}</span>
      <span class="text-sm" :class="dark ? 'text-forest-300' : 'text-charcoal-400'">/ month</span>
    </p>
    <p class="mt-1 text-xs" :class="dark ? 'text-forest-300' : 'text-charcoal-400'">
      {{ cycle === 'annual' ? `Billed ${formatPHP(plan.annualPrice)} yearly` : 'Billed monthly' }}
    </p>

    <ul
      class="mt-5 space-y-1.5 border-t pt-5 text-sm"
      :class="dark ? 'border-white/10' : 'border-charcoal-100'"
    >
      <li v-for="l in limits" :key="l" class="font-medium">{{ l }}</li>
    </ul>
    <ul class="mt-4 flex-1 space-y-2 text-sm">
      <li v-for="f in plan.features" :key="f" class="flex gap-2">
        <Check
          class="mt-0.5 size-4 shrink-0"
          :class="dark ? 'text-lime-300' : 'text-brand-600'"
          aria-hidden="true"
        />
        <span :class="dark ? 'text-forest-100' : 'text-charcoal-500'">{{ f }}</span>
      </li>
    </ul>
    <div v-if="$slots.action" class="mt-6">
      <slot name="action" />
    </div>
  </div>
</template>
