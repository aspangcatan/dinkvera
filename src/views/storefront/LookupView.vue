<script setup lang="ts">
import { SearchX } from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { lookupBooking, type BookingRow } from '@/services/bookingService'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP } from '@/utils/currency'
import { formatLongDate, formatTimeRange } from '@/utils/dates'

const store = useTenantStore()
const route = useRoute()
const tenant = computed(() => store.tenant!)

const reference = ref(typeof route.query.ref === 'string' ? route.query.ref : '')
const phone = ref('')
const searching = ref(false)
const result = ref<BookingRow[]>([])
const notFound = ref(false)
const error = ref('')

async function search(): Promise<void> {
  error.value = ''
  if (!reference.value.trim() || phone.value.replace(/\D/g, '').length < 10) {
    error.value = 'Enter your booking reference and the mobile number you booked with.'
    return
  }
  searching.value = true
  notFound.value = false
  try {
    result.value = await lookupBooking(tenant.value.id, reference.value, phone.value)
    notFound.value = result.value.length === 0
  } finally {
    searching.value = false
  }
}
</script>

<template>
  <div class="mx-auto max-w-xl px-4 py-12 sm:px-6">
    <h1 class="text-charcoal-700 font-display text-4xl uppercase">Find my booking</h1>
    <p class="text-charcoal-400 mt-2 text-sm">
      Check the status of a booking at {{ tenant.name }}. Your reference starts with
      {{ tenant.branding.monogram }}-.
    </p>

    <form
      class="border-charcoal-100 mt-6 space-y-4 rounded-2xl border bg-white p-5"
      novalidate
      @submit.prevent="search"
    >
      <AppInput
        v-model="reference"
        label="Booking reference"
        :placeholder="`${tenant.branding.monogram}-XXXX`"
      />
      <AppInput
        v-model="phone"
        type="tel"
        label="Mobile number"
        autocomplete="tel"
        placeholder="09XX XXX XXXX"
      />
      <p v-if="error" class="text-xs text-red-600" role="alert">{{ error }}</p>
      <AppButton type="submit" :loading="searching" full-width>Find booking</AppButton>
    </form>

    <div
      v-if="notFound"
      class="mt-6 flex items-start gap-3 rounded-2xl bg-amber-50 p-5 text-sm text-amber-900"
      role="status"
    >
      <SearchX class="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <p>
        We couldn't find a booking with that reference and number. Check both, or call
        {{ tenant.phone }}.
      </p>
    </div>

    <div
      v-if="result.length"
      class="border-charcoal-100 mt-6 rounded-2xl border bg-white p-6"
      role="status"
    >
      <div class="flex flex-wrap items-center justify-between gap-2">
        <p class="text-charcoal-700 font-mono text-xl font-bold">{{ result[0]!.reference }}</p>
        <p class="text-charcoal-500 text-sm">{{ result[0]!.customerName }}</p>
      </div>
      <p v-if="result.length > 1" class="text-charcoal-400 mt-1 text-xs">
        {{ result.length }} dates/times booked together
      </p>
      <ul class="border-charcoal-100 divide-charcoal-100 mt-4 divide-y border-t text-sm">
        <li
          v-for="b in result"
          :key="b.id"
          class="flex flex-wrap items-center justify-between gap-2 py-3"
        >
          <span>
            <span class="text-charcoal-700 block">
              {{ formatLongDate(b.date) }}, {{ formatTimeRange(b.startHour, b.durationHours) }}
            </span>
            <span class="text-charcoal-400 block text-xs">
              {{ b.locationName }} · {{ b.courtName }} · {{ formatPHP(b.amount) }}
            </span>
          </span>
          <span class="flex gap-1.5">
            <StatusBadge kind="booking" :value="b.status" />
            <StatusBadge kind="payment" :value="b.paymentStatus" />
          </span>
        </li>
      </ul>
      <div class="border-charcoal-100 flex justify-between border-t pt-3 text-sm">
        <span class="text-charcoal-400">Total</span>
        <span class="tabular text-charcoal-700 font-semibold">{{
          formatPHP(result.reduce((s, b) => s + b.amount, 0))
        }}</span>
      </div>
      <p class="text-charcoal-400 mt-4 text-xs">
        Need to cancel or move it? Contact {{ tenant.name }} at least
        {{ tenant.bookingRules.cancellationWindowHours }} hours before your start time.
      </p>
    </div>
  </div>
</template>
