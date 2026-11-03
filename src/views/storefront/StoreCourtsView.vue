<script setup lang="ts">
import { computed } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import { useQuery } from '@/composables/useQuery'
import { listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP } from '@/utils/currency'
import { formatHour, formatOpeningHours } from '@/utils/dates'
import { courtTypeLabels } from '@/utils/labels'

const store = useTenantStore()
const t = computed(() => store.tenant!)
const courts = useQuery(() => listCourts(t.value.id))

const visible = computed(() => (courts.data.value ?? []).filter((c) => c.status !== 'inactive'))
const courtsAt = (locationId: string) => visible.value.filter((c) => c.locationId === locationId)
</script>

<template>
  <div class="mx-auto max-w-6xl px-4 py-12 sm:px-6">
    <h1 class="text-charcoal-700 font-display text-4xl uppercase">Courts & rates</h1>
    <p class="text-charcoal-400 mt-2 text-sm">
      Prices are per court, per hour. Night rates run until closing.
    </p>

    <LoadingState v-if="courts.loading.value && !courts.data.value" :rows="6" />
    <template v-else>
      <section v-for="loc in store.activeLocations" :key="loc.id" class="mt-10">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 class="text-charcoal-700 font-sans text-xl font-semibold">{{ loc.name }}</h2>
            <p class="text-charcoal-400 text-sm">
              {{ loc.address }} · {{ formatOpeningHours(loc.openHour, loc.closeHour) }}
            </p>
          </div>
          <AppButton
            v-if="store.tenant!.status !== 'suspended'"
            size="sm"
            :to="{ path: `/book/${t.slug}/reserve`, query: { location: loc.id } }"
            >Book here</AppButton
          >
        </div>
        <div class="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="c in courtsAt(loc.id)"
            :key="c.id"
            class="border-charcoal-100 rounded-2xl border bg-white p-5"
            :class="c.status === 'maintenance' ? 'opacity-60' : ''"
          >
            <div class="flex items-start justify-between gap-2">
              <div>
                <h3 class="text-charcoal-700 font-sans font-semibold">{{ c.name }}</h3>
                <p class="text-charcoal-400 text-xs">
                  {{ courtTypeLabels[c.type] }} · {{ c.surface }}
                </p>
              </div>
              <span
                v-if="c.status === 'maintenance'"
                class="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
              >
                Closed for maintenance
              </span>
            </div>
            <dl class="border-charcoal-100 mt-4 grid grid-cols-2 gap-3 border-t pt-4">
              <div>
                <dt class="text-charcoal-400 text-xs">
                  Day<template v-if="c.nightStartHour < loc.closeHour">
                    · until {{ formatHour(c.nightStartHour) }}</template
                  >
                </dt>
                <dd class="tabular text-charcoal-700 text-lg font-semibold">
                  {{ formatPHP(c.dayRate) }}
                </dd>
              </div>
              <div v-if="c.nightStartHour < loc.closeHour">
                <dt class="text-charcoal-400 text-xs">
                  Night · from {{ formatHour(c.nightStartHour) }}
                </dt>
                <dd class="tabular text-charcoal-700 text-lg font-semibold">
                  {{ formatPHP(c.nightRate) }}
                </dd>
              </div>
            </dl>
            <p v-if="c.features.length" class="text-charcoal-500 mt-3 text-xs">
              {{ c.features.join(' · ') }}
            </p>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>
