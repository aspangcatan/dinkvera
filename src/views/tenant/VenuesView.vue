<script setup lang="ts">
import { Clock, MapPin, MapPinOff, Navigation, Pencil, Phone, Plus, Trash2 } from '@lucide/vue'
import { computed, ref } from 'vue'

import CourtFormModal from '@/components/tenant/CourtFormModal.vue'
import LimitNotice from '@/components/tenant/LimitNotice.vue'
import LocationFormModal from '@/components/tenant/LocationFormModal.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import EmptyState from '@/components/ui/EmptyState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useQuery } from '@/composables/useQuery'
import { deleteCourt, deleteLocation, listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { Court, Location } from '@/types/venue'
import { formatPHP } from '@/utils/currency'
import { formatHour, formatOpeningHours } from '@/utils/dates'
import { courtTypeLabels } from '@/utils/labels'
import { isAtLimit, usageLabels, type UsageItem, type UsageKey } from '@/utils/usage'
import { directionsUrl, locationPin } from '@/utils/maps'

const store = useTenantStore()
const toast = useToastStore()
const courts = useQuery(() => listCourts(store.tenant!.id))

const usage = (key: UsageKey): UsageItem =>
  store.usage.find((u) => u.key === key) ?? { key, label: usageLabels[key], used: 0, limit: null }
const locationsFull = computed(() => isAtLimit(usage('locations')))
const courtsFull = computed(() => isAtLimit(usage('courts')))

const courtsAt = (locationId: string) =>
  (courts.data.value ?? []).filter((c) => c.locationId === locationId)

// --- Modals -------------------------------------------------------------------
const locationModal = ref<{ open: boolean; location: Location | null }>({
  open: false,
  location: null,
})
const courtModal = ref<{ open: boolean; court: Court | null; locationId: string }>({
  open: false,
  court: null,
  locationId: '',
})
const deleting = ref<{ kind: 'court' | 'location'; id: string; name: string } | null>(null)
const busy = ref(false)

async function refreshAll(): Promise<void> {
  locationModal.value.open = false
  courtModal.value.open = false
  await Promise.all([courts.refresh(), store.refresh()])
}

async function confirmDelete(): Promise<void> {
  if (!deleting.value) return
  busy.value = true
  try {
    if (deleting.value.kind === 'court') await deleteCourt(deleting.value.id)
    else await deleteLocation(deleting.value.id)
    toast.show(`${deleting.value.name} deleted`)
    deleting.value = null
    await refreshAll()
  } catch (e) {
    toast.error(e)
    deleting.value = null
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Locations & courts"
      description="Opening hours, courts and rates for each of your venues."
    >
      <template #actions>
        <AppButton
          :disabled="locationsFull"
          @click="locationModal = { open: true, location: null }"
        >
          <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
          Add location
        </AppButton>
      </template>
    </PageHeader>

    <div class="space-y-4">
      <LimitNotice v-if="locationsFull" :item="usage('locations')" />
      <LimitNotice v-if="courtsFull" :item="usage('courts')" />

      <LoadingState v-if="courts.loading.value && !courts.data.value" :rows="6" />
      <EmptyState
        v-else-if="!store.locations.length"
        :icon="MapPin"
        title="No locations yet"
        description="Add your first venue to start taking bookings."
      />

      <AppCard v-for="loc in store.locations" :key="loc.id" :padded="false">
        <template #header>
          <div class="flex min-w-0 flex-1 flex-wrap items-start gap-x-6 gap-y-2">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <h2 class="text-charcoal-700 font-sans text-base font-semibold">{{ loc.name }}</h2>
                <StatusBadge kind="location" :value="loc.status" />
              </div>
              <p class="text-charcoal-400 mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <span class="flex items-center gap-1"
                  ><MapPin class="size-3.5" aria-hidden="true" />{{ loc.address }},
                  {{ loc.city }}</span
                >
                <span class="flex items-center gap-1"
                  ><Clock class="size-3.5" aria-hidden="true" />{{
                    formatOpeningHours(loc.openHour, loc.closeHour)
                  }}</span
                >
                <span class="flex items-center gap-1"
                  ><Phone class="size-3.5" aria-hidden="true" />{{ loc.phone }}</span
                >
                <a
                  v-if="locationPin(loc)"
                  :href="directionsUrl(loc)"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="flex items-center gap-1 text-emerald-700 hover:underline"
                  ><Navigation class="size-3.5" aria-hidden="true" />On the map</a
                >
                <span v-else class="flex items-center gap-1 text-amber-700"
                  ><MapPinOff class="size-3.5" aria-hidden="true" />No map pin — edit to add
                  one</span
                >
              </p>
              <div v-if="loc.amenities.length" class="mt-2 flex flex-wrap gap-1">
                <AppBadge v-for="a in loc.amenities" :key="a" :dot="false">{{ a }}</AppBadge>
              </div>
            </div>
          </div>
        </template>
        <template #actions>
          <AppButton
            size="sm"
            variant="outline"
            @click="locationModal = { open: true, location: loc }"
          >
            <template #icon-left><Pencil class="size-3.5" aria-hidden="true" /></template>
            Edit
          </AppButton>
          <button
            type="button"
            class="text-charcoal-400 rounded-lg p-2 hover:bg-red-50 hover:text-red-600"
            :aria-label="`Delete ${loc.name}`"
            @click="deleting = { kind: 'location', id: loc.id, name: loc.name }"
          >
            <Trash2 class="size-4" aria-hidden="true" />
          </button>
        </template>

        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-charcoal-400 border-charcoal-100 border-y text-xs">
                <th class="px-5 py-2 text-left font-medium">Court</th>
                <th class="px-4 py-2 text-left font-medium">Type</th>
                <th class="hidden px-4 py-2 text-left font-medium md:table-cell">Features</th>
                <th class="px-4 py-2 text-right font-medium">Day</th>
                <th class="px-4 py-2 text-right font-medium">Night</th>
                <th class="px-4 py-2 text-left font-medium">Status</th>
                <th class="px-5 py-2"><span class="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="court in courtsAt(loc.id)"
                :key="court.id"
                class="border-charcoal-100/70 hover:bg-charcoal-50/50 border-b last:border-0"
              >
                <td class="text-charcoal-700 px-5 py-3 font-medium">{{ court.name }}</td>
                <td class="text-charcoal-500 px-4 py-3">
                  {{ courtTypeLabels[court.type] }}
                  <span class="text-charcoal-400 block text-xs">{{ court.surface }}</span>
                </td>
                <td class="text-charcoal-400 hidden px-4 py-3 text-xs md:table-cell">
                  {{ court.features.join(' · ') || '—' }}
                </td>
                <td class="tabular text-charcoal-600 px-4 py-3 text-right">
                  {{ formatPHP(court.dayRate) }}
                </td>
                <td class="tabular text-charcoal-600 px-4 py-3 text-right">
                  <template v-if="court.nightStartHour < loc.closeHour">
                    {{ formatPHP(court.nightRate) }}
                    <span class="text-charcoal-400 block text-xs"
                      >from {{ formatHour(court.nightStartHour) }}</span
                    >
                  </template>
                  <span v-else class="text-charcoal-300">—</span>
                </td>
                <td class="px-4 py-3"><StatusBadge kind="court" :value="court.status" /></td>
                <td class="px-5 py-3 text-right whitespace-nowrap">
                  <button
                    type="button"
                    class="text-charcoal-400 hover:text-charcoal-700 hover:bg-charcoal-100 rounded-lg p-1.5"
                    :aria-label="`Edit ${court.name}`"
                    @click="courtModal = { open: true, court, locationId: loc.id }"
                  >
                    <Pencil class="size-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    class="text-charcoal-400 rounded-lg p-1.5 hover:bg-red-50 hover:text-red-600"
                    :aria-label="`Delete ${court.name}`"
                    @click="
                      deleting = { kind: 'court', id: court.id, name: `${loc.name} ${court.name}` }
                    "
                  >
                    <Trash2 class="size-4" aria-hidden="true" />
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="border-charcoal-100 border-t px-5 py-3">
            <AppButton
              size="sm"
              variant="ghost"
              :disabled="courtsFull"
              @click="courtModal = { open: true, court: null, locationId: loc.id }"
            >
              <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
              Add court to {{ loc.name }}
            </AppButton>
          </div>
        </div>
      </AppCard>
    </div>

    <LocationFormModal
      :open="locationModal.open"
      :location="locationModal.location"
      @close="locationModal.open = false"
      @saved="refreshAll"
    />
    <CourtFormModal
      :open="courtModal.open"
      :court="courtModal.court"
      :location-id="courtModal.locationId"
      :next-number="courtsAt(courtModal.locationId).length + 1"
      @close="courtModal.open = false"
      @saved="refreshAll"
    />
    <ConfirmDialog
      :open="deleting !== null"
      :title="`Delete ${deleting?.name}?`"
      :message="
        deleting?.kind === 'location'
          ? 'This removes the location and all its courts. Past bookings stay in your reports.'
          : 'This removes the court. Past bookings stay in your reports.'
      "
      confirm-label="Delete"
      danger
      :loading="busy"
      @cancel="deleting = null"
      @confirm="confirmDelete"
    />
  </div>
</template>
