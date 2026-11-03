<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { saveCourt } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { Court, CourtStatus, CourtType } from '@/types/venue'
import { formatHour } from '@/utils/dates'
import { courtStatus, courtTypeLabels } from '@/utils/labels'

const props = defineProps<{
  open: boolean
  court: Court | null
  locationId: string
  nextNumber: number
}>()
const emit = defineEmits<{ close: []; saved: [] }>()
const store = useTenantStore()
const toast = useToastStore()

/** "No night rate": an hour the business day never reaches. */
const NO_NIGHT = '30'

const form = reactive({
  name: '',
  locationId: '',
  type: 'outdoor' as CourtType,
  surface: '',
  dayRate: 0,
  nightRate: 0,
  nightStartHour: '17',
  status: 'active' as CourtStatus,
  features: '',
})
const errors = reactive<Record<string, string>>({})
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    Object.keys(errors).forEach((k) => delete errors[k])
    const c = props.court
    Object.assign(form, {
      name: c?.name ?? `Court ${props.nextNumber}`,
      locationId: c?.locationId ?? props.locationId,
      type: c?.type ?? 'outdoor',
      surface: c?.surface ?? 'Textured acrylic',
      dayRate: (c?.dayRate ?? 30000) / 100,
      nightRate: (c?.nightRate ?? 40000) / 100,
      nightStartHour: String(c?.nightStartHour ?? 17),
      status: c?.status ?? 'active',
      features: c?.features.join(', ') ?? '',
    })
  },
)

const location = computed(() => store.locations.find((l) => l.id === form.locationId))

/** Night can start at any hour the location is open (after opening), or never. */
const nightOptions = computed(() => {
  const loc = location.value
  const open = loc?.openHour ?? 6
  const close = loc?.closeHour ?? 24
  const options = []
  for (let h = open + 1; h < close; h++) {
    options.push({ value: String(h), label: `${formatHour(h)}${h >= 24 ? ' (next day)' : ''}` })
  }
  options.push({ value: NO_NIGHT, label: 'No night rate' })
  return options
})

// Keep the choice valid when the location (and its hours) change.
watch(nightOptions, (options) => {
  if (!options.some((o) => o.value === form.nightStartHour)) {
    form.nightStartHour = options.find((o) => o.value === '17')?.value ?? NO_NIGHT
  }
})

const hasNight = computed(() => form.nightStartHour !== NO_NIGHT)
const nightHint = computed(() =>
  hasNight.value && location.value
    ? `Night rate from ${formatHour(Number(form.nightStartHour))} until closing (${formatHour(location.value.closeHour)}).`
    : 'The day rate applies all day.',
)

async function save(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = 'Enter a court name'
  if (form.dayRate <= 0) errors.dayRate = 'Enter the day rate'
  if (hasNight.value && form.nightRate <= 0) errors.nightRate = 'Enter the night rate'
  if (Object.keys(errors).length) return
  saving.value = true
  try {
    await saveCourt(
      store.tenant!.id,
      {
        name: form.name.trim(),
        locationId: form.locationId,
        type: form.type,
        surface: form.surface.trim(),
        dayRate: Math.round(form.dayRate * 100),
        // With no night rate, store the day rate so prices stay consistent.
        nightRate: Math.round((hasNight.value ? form.nightRate : form.dayRate) * 100),
        nightStartHour: Number(form.nightStartHour),
        status: form.status,
        features: form.features
          .split(',')
          .map((f) => f.trim())
          .filter(Boolean),
      },
      props.court?.id,
    )
    toast.show(props.court ? 'Court saved' : 'Court added')
    emit('saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal :open="open" :title="court ? `Edit ${court.name}` : 'Add court'" @close="emit('close')">
    <form id="court-form" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
      <AppInput v-model="form.name" label="Court name" required :error="errors.name" />
      <AppSelect
        v-model="form.locationId"
        label="Location"
        :options="store.locations.map((l) => ({ value: l.id, label: l.name }))"
      />
      <AppSelect
        v-model="form.type"
        label="Type"
        :options="Object.entries(courtTypeLabels).map(([value, label]) => ({ value, label }))"
      />
      <AppInput v-model="form.surface" label="Surface" />

      <fieldset
        class="border-charcoal-100 grid gap-4 rounded-xl border p-4 sm:col-span-2 sm:grid-cols-3"
      >
        <legend class="text-charcoal-600 px-1 text-sm font-medium">Rates</legend>
        <AppInput
          v-model="form.dayRate"
          type="number"
          label="Day rate / hour"
          prefix="₱"
          min="0"
          step="10"
          required
          :error="errors.dayRate"
        />
        <AppSelect v-model="form.nightStartHour" label="Night starts at" :options="nightOptions" />
        <AppInput
          v-model="form.nightRate"
          type="number"
          label="Night rate / hour"
          prefix="₱"
          min="0"
          step="10"
          :disabled="!hasNight"
          :error="errors.nightRate"
        />
        <p class="text-charcoal-400 -mt-2 text-xs sm:col-span-3">{{ nightHint }}</p>
      </fieldset>

      <AppSelect
        v-model="form.status"
        label="Status"
        :options="Object.entries(courtStatus).map(([value, s]) => ({ value, label: s.label }))"
      />
      <AppInput v-model="form.features" label="Features" hint="Comma-separated" />
    </form>
    <template #actions>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="court-form" :loading="saving">Save court</AppButton>
    </template>
  </AppModal>
</template>
