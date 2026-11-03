<script setup lang="ts">
import { CalendarCheck } from '@lucide/vue'
import { computed } from 'vue'

import type { BookingRules, TenantPolicy } from '@/types/tenant'
import { bookingBasics, parsePolicyBody } from '@/utils/policies'

/**
 * A business's rules & policies: the booking basics every business has
 * (from its booking rules), then its own sections. Bodies are plain text.
 */
const props = withDefaults(
  defineProps<{
    rules: BookingRules
    policies: TenantPolicy[]
    /** Heading level of the section titles. */
    headingLevel?: 2 | 3
    /** Show the booking-basics box (the home page has its own summary). */
    showBasics?: boolean
    /** `grid`: sections as cards side by side (home page); `stack`: one after another. */
    layout?: 'stack' | 'grid'
  }>(),
  { headingLevel: 2, showBasics: true, layout: 'stack' },
)

const basics = computed(() => bookingBasics(props.rules))
const sections = computed(() =>
  props.policies.map((p) => ({ title: p.title, blocks: parsePolicyBody(p.body) })),
)
const heading = computed(() => `h${props.headingLevel}`)
</script>

<template>
  <div :class="layout === 'grid' ? 'grid items-start gap-4 md:grid-cols-2' : 'space-y-8'">
    <section v-if="showBasics" class="bg-brand-50 border-brand-100 rounded-2xl border p-5">
      <component
        :is="heading"
        class="text-brand-800 flex items-center gap-2 text-base font-semibold"
      >
        <CalendarCheck class="size-5" aria-hidden="true" /> Booking basics
      </component>
      <ul class="text-charcoal-600 mt-3 list-disc space-y-1.5 pl-5 text-sm">
        <li v-for="line in basics" :key="line">{{ line }}</li>
      </ul>
    </section>

    <section
      v-for="(s, i) in sections"
      :key="i"
      :class="layout === 'grid' ? 'border-charcoal-100 rounded-xl border bg-white p-5' : ''"
    >
      <component :is="heading" class="text-charcoal-700 text-lg font-semibold">
        {{ s.title }}
      </component>
      <div class="text-charcoal-600 mt-2 space-y-3 text-sm leading-relaxed">
        <template v-for="(b, j) in s.blocks" :key="j">
          <p v-if="b.kind === 'p'">{{ b.text }}</p>
          <ul v-else class="list-disc space-y-1.5 pl-5">
            <li v-for="(item, k) in b.items" :key="k">{{ item }}</li>
          </ul>
        </template>
      </div>
    </section>
  </div>
</template>
