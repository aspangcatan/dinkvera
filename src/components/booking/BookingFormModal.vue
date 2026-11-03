<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import type { NewBookingPrefill } from '@/composables/useNewBooking'
import { createBooking, getAvailability } from '@/services/bookingService'
import { listCustomers, type CustomerSummary } from '@/services/customerService'
import { listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { BookingSource } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import type { Court } from '@/types/venue'
import { formatPHP } from '@/utils/currency'
import { formatHour, todayISO } from '@/utils/dates'
import { paymentMethodLabels, sourceLabels } from '@/utils/labels'
import { bookingPrice } from '@/utils/pricing'

const props = defineProps<{ open: boolean; prefill: NewBookingPrefill }>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useTenantStore()
const toast = useToastStore()

const form = reactive({
  locationId: '',
  courtId: '',
  date: todayISO(),
  startHour: '',
  duration: '1',
  name: '',
  phone: '',
  email: '',
  notes: '',
  source: 'walk_in' as BookingSource,
  recordPayment: true,
  method: 'cash' as PaymentMethod,
})
const errors = reactive<Record<string, string>>({})
const courts = ref<Court[]>([])
const taken = ref<Record<string, number[]>>({})
const customers = ref<CustomerSummary[]>([])
const saving = ref(false)

const tenant = computed(() => store.tenant!)
const location = computed(() => store.locations.find((l) => l.id === form.locationId))

// Reset from the prefill every time the modal opens.
watch(
  () => props.open,
  async (open) => {
    if (!open) return
    Object.keys(errors).forEach((k) => delete errors[k])
    const p = props.prefill
    form.locationId = p.locationId ?? store.activeLocations[0]?.id ?? ''
    form.courtId = p.courtId ?? ''
    form.date = p.date ?? todayISO()
    form.startHour = p.startHour !== undefined ? String(p.startHour) : ''
    form.duration = '1'
    form.name = p.customer?.name ?? ''
    form.phone = p.customer?.phone ?? ''
    form.email = p.customer?.email ?? ''
    form.notes = ''
    form.source = tenant.value.bookingRules.allowWalkIns ? 'walk_in' : 'phone'
    form.recordPayment = true
    form.method = tenant.value.bookingRules.paymentMethods.includes('cash')
      ? 'cash'
      : tenant.value.bookingRules.paymentMethods[0]!
    customers.value = await listCustomers(tenant.value.id)
  },
)

watch(
  () => form.locationId,
  async (locationId) => {
    if (!locationId) return
    courts.value = (await listCourts(tenant.value.id, locationId)).filter(
      (c) => c.status === 'active',
    )
    if (!courts.value.some((c) => c.id === form.courtId)) form.courtId = courts.value[0]?.id ?? ''
  },
)

watch(
  () => [form.locationId, form.date, props.open] as const,
  async ([locationId, date, open]) => {
    if (open && locationId && date) taken.value = await getAvailability(locationId, date)
  },
)

const locationOptions = computed(() =>
  store.activeLocations.map((l) => ({ value: l.id, label: l.name })),
)
const courtOptions = computed(() => courts.value.map((c) => ({ value: c.id, label: c.name })))

const hourOptions = computed(() => {
  const loc = location.value
  if (!loc) return []
  const busy = taken.value[form.courtId] ?? []
  const options = []
  for (let h = loc.openHour; h < loc.closeHour; h++) {
    const isBusy = busy.includes(h)
    options.push({ value: String(h), label: `${formatHour(h)}${isBusy ? ' — booked' : ''}` })
  }
  return options
})

const durationOptions = computed(() => {
  const max = Math.max(1, Math.floor(tenant.value.bookingRules.maxDurationMinutes / 60))
  return Array.from({ length: Math.max(max, 3) }, (_, i) => ({
    value: String(i + 1),
    label: `${i + 1} hour${i ? 's' : ''}`,
  }))
})

const methodOptions = computed(() =>
  tenant.value.bookingRules.paymentMethods.map((m) => ({
    value: m,
    label: paymentMethodLabels[m],
  })),
)
// Walk-ins only when the business accepts them (Settings → Booking rules).
const sourceOptions = computed(() =>
  (['walk_in', 'phone', 'online'] as BookingSource[])
    .filter((s) => s !== 'walk_in' || tenant.value.bookingRules.allowWalkIns)
    .map((s) => ({ value: s, label: sourceLabels[s] })),
)

const price = computed(() => {
  const court = courts.value.find((c) => c.id === form.courtId)
  if (!court || form.startHour === '') return null
  return bookingPrice(court, Number(form.startHour), Number(form.duration))
})

// Existing customer suggestions while typing a name or phone.
const suggestions = computed(() => {
  const q = form.name.trim().toLowerCase()
  if (q.length < 2) return []
  return customers.value
    .filter((c) => c.name.toLowerCase().includes(q) || c.phone.replace(/\s/g, '').includes(q))
    .slice(0, 4)
})
const showSuggestions = ref(false)
function pickCustomer(c: CustomerSummary): void {
  form.name = c.name
  form.phone = c.phone
  form.email = c.email
  showSuggestions.value = false
}

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.courtId) errors.courtId = 'Choose a court'
  if (form.startHour === '') errors.startHour = 'Choose a start time'
  if (!form.name.trim()) errors.name = 'Enter the customer name'
  if (form.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid mobile number'
  return Object.keys(errors).length === 0
}

async function submit(): Promise<void> {
  if (!validate()) return
  saving.value = true
  try {
    const booking = await createBooking({
      tenantId: tenant.value.id,
      courtId: form.courtId,
      date: form.date,
      startHour: Number(form.startHour),
      durationHours: Number(form.duration),
      customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() },
      notes: form.notes.trim(),
      source: form.source,
      paymentMethod: form.recordPayment ? form.method : null,
    })
    toast.show(`Booking ${booking.reference} created`)
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
    title="New booking"
    description="For walk-ins and phone bookings. Online bookings come in automatically."
    size="lg"
    @close="emit('close')"
  >
    <form id="new-booking" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="submit">
      <AppSelect v-model="form.locationId" label="Location" :options="locationOptions" />
      <AppSelect
        v-model="form.courtId"
        label="Court"
        :options="courtOptions"
        placeholder="Choose a court"
        :error="errors.courtId"
      />
      <AppInput v-model="form.date" type="date" label="Date" required />
      <div class="grid grid-cols-2 gap-3">
        <AppSelect
          v-model="form.startHour"
          label="Start"
          :options="hourOptions"
          placeholder="Time"
          :error="errors.startHour"
        />
        <AppSelect v-model="form.duration" label="Length" :options="durationOptions" />
      </div>

      <div class="border-charcoal-100 col-span-full border-t pt-4">
        <p class="text-charcoal-700 text-sm font-semibold">Customer</p>
      </div>
      <div class="relative">
        <AppInput
          v-model="form.name"
          label="Full name"
          required
          autocomplete="off"
          :error="errors.name"
          @focusin="showSuggestions = true"
        />
        <ul
          v-if="showSuggestions && suggestions.length"
          class="border-charcoal-100 absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg"
        >
          <li v-for="c in suggestions" :key="c.id">
            <button
              type="button"
              class="hover:bg-charcoal-50 flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm"
              @click="pickCustomer(c)"
            >
              <span class="text-charcoal-700 font-medium">{{ c.name }}</span>
              <span class="text-charcoal-400 text-xs">{{ c.bookings }} bookings</span>
            </button>
          </li>
        </ul>
      </div>
      <AppInput
        v-model="form.phone"
        type="tel"
        label="Mobile number"
        placeholder="+63 9XX XXX XXXX"
        required
        :error="errors.phone"
      />
      <AppInput v-model="form.email" type="email" label="Email" hint="Optional — for the receipt" />
      <AppSelect v-model="form.source" label="Source" :options="sourceOptions" />
      <div class="col-span-full">
        <AppTextarea
          v-model="form.notes"
          label="Notes"
          :rows="2"
          placeholder="Paddle rental, requests…"
        />
      </div>

      <div class="border-charcoal-100 col-span-full space-y-3 border-t pt-4">
        <AppToggle
          v-model="form.recordPayment"
          label="Record payment now"
          description="Turn off if the customer will pay later at the front desk."
        />
        <AppSelect
          v-if="form.recordPayment"
          v-model="form.method"
          label="Payment method"
          :options="methodOptions"
        />
      </div>
    </form>

    <template #actions>
      <p class="text-charcoal-500 mr-auto self-center text-sm">
        Total
        <span class="text-charcoal-700 tabular ml-1 text-base font-semibold">{{
          price === null ? '—' : formatPHP(price)
        }}</span>
      </p>
      <AppButton variant="outline" @click="emit('close')">Cancel</AppButton>
      <AppButton type="submit" form="new-booking" :loading="saving">Create booking</AppButton>
    </template>
  </AppModal>
</template>
