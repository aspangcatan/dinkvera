<script setup lang="ts">
import { Crosshair, MapPin, Plus, Search, X } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import LocationMap from '@/components/venue/LocationMap.vue'
import { saveLocation } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { Location, LocationStatus } from '@/types/venue'
import { formatHour } from '@/utils/dates'
import { findAddress, fullAddress, locationPin, roundPin, type LatLng } from '@/utils/maps'

const props = defineProps<{ open: boolean; location: Location | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()
const store = useTenantStore()
const toast = useToastStore()

/** Quick picks; owners can also type their own (max 20, 40 characters each). */
const SUGGESTED_AMENITIES = [
  'Air-conditioned',
  'Covered courts',
  'Night lights',
  'Parking',
  'Restrooms',
  'Showers',
  'Lockers',
  'Free drinking water',
  'Seating area',
  'Pro shop',
  'Cafe',
  'Paddle rental',
  'Ball machine',
  'Coaching',
  'Wi-Fi',
]
const MAX_AMENITIES = 20
const MAX_AMENITY_LENGTH = 40

const form = reactive({
  name: '',
  address: '',
  city: '',
  phone: '',
  openHour: '6',
  closeHour: '22',
  status: 'active' as LocationStatus,
  amenities: [] as string[],
})
const pin = ref<LatLng | null>(null)
const errors = reactive<Record<string, string>>({})
const saving = ref(false)
const newAmenity = ref('')
const searching = ref(false)
const locating = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.keys(errors).forEach((k) => delete errors[k])
    const l = props.location
    Object.assign(form, {
      name: l?.name ?? '',
      address: l?.address ?? '',
      city: l?.city ?? store.tenant?.city ?? '',
      phone: l?.phone ?? store.tenant?.phone ?? '',
      openHour: String(l?.openHour ?? 6),
      closeHour: String(l?.closeHour ?? 22),
      status: l?.status ?? 'active',
      amenities: [...(l?.amenities ?? [])],
    })
    pin.value = l ? locationPin(l) : null
    newAmenity.value = ''
  },
)

const openOptions = Array.from({ length: 24 }, (_, h) => ({
  value: String(h),
  label: formatHour(h),
}))
// Closing can run past midnight (e.g. 1 AM = hour 25 of the business day).
const closeOptions = computed(() =>
  Array.from({ length: 26 - Number(form.openHour) - 1 }, (_, i) => {
    const h = Number(form.openHour) + 1 + i
    return { value: String(h), label: `${formatHour(h)}${h >= 24 ? ' (next day)' : ''}` }
  }),
)

// --- Amenities ---------------------------------------------------------------

const has = (a: string) => form.amenities.some((x) => x.toLowerCase() === a.toLowerCase())
/** Owner-typed amenities (not in the quick picks), shown as removable chips. */
const custom = computed(() =>
  form.amenities.filter(
    (a) => !SUGGESTED_AMENITIES.some((s) => s.toLowerCase() === a.toLowerCase()),
  ),
)
const full = computed(() => form.amenities.length >= MAX_AMENITIES)

function toggle(a: string): void {
  if (has(a)) form.amenities = form.amenities.filter((x) => x.toLowerCase() !== a.toLowerCase())
  else if (!full.value) form.amenities = [...form.amenities, a]
}

function addAmenity(): void {
  delete errors.amenity
  const a = newAmenity.value.trim().replace(/\s+/g, ' ')
  if (!a) return
  if (a.length > MAX_AMENITY_LENGTH) {
    errors.amenity = `Keep it under ${MAX_AMENITY_LENGTH} characters`
    return
  }
  if (full.value) {
    errors.amenity = `Up to ${MAX_AMENITIES} amenities`
    return
  }
  if (!has(a)) form.amenities = [...form.amenities, a]
  newAmenity.value = ''
}

// --- Map pin -----------------------------------------------------------------

async function findOnMap(): Promise<void> {
  const query = fullAddress(form)
  if (!query) {
    errors.address = 'Enter the address first'
    return
  }
  searching.value = true
  try {
    // Try the full address, then just the city.
    const found = (await findAddress(query)) ?? (form.city ? await findAddress(form.city) : null)
    if (found) {
      pin.value = found
      toast.show('Found it — drag the pin to the exact entrance if needed')
    } else {
      toast.show("Couldn't find that address. Click the map to place the pin.", 'info')
    }
  } catch (e) {
    toast.error(e)
  } finally {
    searching.value = false
  }
}

function useMyLocation(): void {
  if (!('geolocation' in navigator)) {
    toast.show("This browser can't share your location.", 'info')
    return
  }
  locating.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      pin.value = roundPin({ lat: pos.coords.latitude, lng: pos.coords.longitude })
      locating.value = false
      toast.show('Pin set to where you are now')
    },
    () => {
      locating.value = false
      toast.show('Location permission was denied. Search the address or click the map.', 'info')
    },
    { enableHighAccuracy: true, timeout: 10000 },
  )
}

// --- Save --------------------------------------------------------------------

async function save(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = 'Enter a name'
  if (!form.address.trim()) errors.address = 'Enter the address'
  if (Object.keys(errors).length) return
  saving.value = true
  try {
    await saveLocation(
      store.tenant!.id,
      {
        ...form,
        name: form.name.trim(),
        // A plain array, not the reactive proxy (it gets copied/serialized).
        amenities: [...form.amenities],
        openHour: Number(form.openHour),
        closeHour: Number(form.closeHour),
        latitude: pin.value?.lat ?? null,
        longitude: pin.value?.lng ?? null,
      },
      props.location?.id,
    )
    toast.show(props.location ? 'Location saved' : 'Location added')
    emit('saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="location ? `Edit ${location.name}` : 'Add location'"
    size="lg"
    @close="emit('close')"
  >
    <form id="location-form" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
      <AppInput
        v-model="form.name"
        label="Location name"
        placeholder="e.g. IT Park"
        required
        :error="errors.name"
      />
      <AppSelect
        v-model="form.status"
        label="Status"
        :options="[
          { value: 'active', label: 'Open for bookings' },
          { value: 'inactive', label: 'Inactive (hidden)' },
        ]"
      />
      <div class="sm:col-span-2">
        <AppInput v-model="form.address" label="Street address" required :error="errors.address" />
      </div>
      <AppInput v-model="form.city" label="City" />
      <AppInput v-model="form.phone" type="tel" label="Phone" />

      <!-- Map pin -->
      <fieldset class="sm:col-span-2">
        <legend class="text-charcoal-600 mb-1 text-sm font-medium">Map pin</legend>
        <p class="text-charcoal-400 mb-2 text-xs">
          Players see this map and a "Get directions" button on your booking site. Search your
          address, then drag the pin to your entrance (or click the map).
        </p>
        <div class="mb-2 flex flex-wrap gap-2">
          <AppButton size="sm" variant="outline" :loading="searching" @click="findOnMap">
            <template #icon-left><Search class="size-3.5" aria-hidden="true" /></template>
            Find address on map
          </AppButton>
          <AppButton size="sm" variant="ghost" :loading="locating" @click="useMyLocation">
            <template #icon-left><Crosshair class="size-3.5" aria-hidden="true" /></template>
            I'm at the venue now
          </AppButton>
          <AppButton v-if="pin" size="sm" variant="ghost" class="ml-auto" @click="pin = null">
            Remove pin
          </AppButton>
        </div>
        <LocationMap
          v-if="open"
          v-model:pin="pin"
          editable
          label="Location map: click or drag the pin"
          class="border-charcoal-200 h-64 rounded-xl border"
        />
        <p class="mt-1.5 flex items-center gap-1.5 text-xs">
          <template v-if="pin">
            <MapPin class="size-3.5 text-emerald-600" aria-hidden="true" />
            <span class="text-charcoal-500">Pin set · {{ pin.lat }}, {{ pin.lng }}</span>
          </template>
          <span v-else class="text-amber-700">
            No pin yet — players will get directions from the address only.
          </span>
        </p>
      </fieldset>

      <AppSelect v-model="form.openHour" label="Opens" :options="openOptions" />
      <AppSelect v-model="form.closeHour" label="Closes" :options="closeOptions" />

      <!-- Amenities -->
      <fieldset class="sm:col-span-2">
        <legend class="text-charcoal-600 mb-1 text-sm font-medium">
          Amenities
          <span class="text-charcoal-400 font-normal"
            >({{ form.amenities.length }}/{{ MAX_AMENITIES }})</span
          >
        </legend>
        <p class="text-charcoal-400 mb-2 text-xs">
          Tap to add or remove. Shown on your booking site.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="a in SUGGESTED_AMENITIES"
            :key="a"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            :class="
              has(a)
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-300'
            "
            :aria-pressed="has(a)"
            :disabled="!has(a) && full"
            @click="toggle(a)"
          >
            {{ a }}
          </button>
          <span
            v-for="a in custom"
            :key="a"
            class="border-brand-600 bg-brand-50 text-brand-700 inline-flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-3 text-xs font-medium"
          >
            {{ a }}
            <button
              type="button"
              class="hover:bg-brand-100 rounded-full p-0.5"
              :aria-label="`Remove ${a}`"
              @click="toggle(a)"
            >
              <X class="size-3" aria-hidden="true" />
            </button>
          </span>
        </div>
        <div class="mt-3 flex items-start gap-2">
          <AppInput
            v-model="newAmenity"
            label="Add your own"
            hide-label
            placeholder="Add your own, e.g. Free parking for 2 hrs"
            class="flex-1"
            :error="errors.amenity"
            @keydown.enter.prevent="addAmenity"
          />
          <AppButton variant="outline" :disabled="!newAmenity.trim()" @click="addAmenity">
            <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
            Add
          </AppButton>
        </div>
      </fieldset>
    </form>
    <template #actions>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="location-form" :loading="saving">Save location</AppButton>
    </template>
  </AppModal>
</template>
