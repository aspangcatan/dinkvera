<script setup lang="ts">
import { CalendarClock, CalendarX2, Mail, MapPin, Phone } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'

import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  cancelBooking,
  getBookingDetail,
  markBookingPaid,
  rescheduleBooking,
  setBookingStatus,
  type BookingDetail,
  type BookingRow,
} from '@/services/bookingService'
import { approvePayment, rejectPayment } from '@/services/paymentService'
import { listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { Payment } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import type { Court } from '@/types/venue'
import { groupBookings } from '@/utils/bookingGroups'
import { formatPHP } from '@/utils/currency'
import {
  formatHour,
  formatLongDate,
  formatRelative,
  formatTimeRange,
  todayISO,
} from '@/utils/dates'
import { paymentMethodLabels, sourceLabels } from '@/utils/labels'

import ProofModal from './ProofModal.vue'

/**
 * One customer booking. Times booked together ("Add date") are shown as
 * one booking: every date/time in a list, one total and one payment.
 * Per-time actions (check in, no-show, reschedule) apply to the time
 * selected in the list; payment and cancelling can cover the whole booking.
 */
const props = defineProps<{ bookingId: string | null }>()
const emit = defineEmits<{ close: []; changed: [] }>()

const store = useTenantStore()
const toast = useToastStore()
const detail = ref<BookingDetail | null>(null)
const busy = ref(false)
const proof = ref<Payment | null>(null)

type Mode = 'view' | 'pay' | 'cancel' | 'reschedule'
const mode = ref<Mode>('view')
const method = ref<PaymentMethod>('cash')
const refund = ref(true)
const cancelScope = ref<'one' | 'all'>('all')
const courts = ref<Court[]>([])
const move = reactive({ courtId: '', date: '', startHour: '', duration: '1' })

/** The time selected in the list (per-time actions use it). */
const selectedId = ref<string | null>(null)

async function load(): Promise<void> {
  if (!props.bookingId) return
  detail.value = await getBookingDetail(props.bookingId)
  if (!slots.value.some((s) => s.id === selectedId.value)) selectedId.value = props.bookingId
}

watch(
  () => props.bookingId,
  async (id) => {
    detail.value = null
    mode.value = 'view'
    selectedId.value = id
    if (id) await load()
  },
  { immediate: true },
)

/** Every time in this booking, earliest first. */
const slots = computed<BookingRow[]>(() =>
  detail.value ? groupBookings([detail.value.booking, ...detail.value.siblings])[0]!.bookings : [],
)
const group = computed(() => (slots.value.length ? groupBookings(slots.value)[0]! : null))
const isGroup = computed(() => slots.value.length > 1)
const b = computed(
  () => slots.value.find((s) => s.id === selectedId.value) ?? slots.value[0] ?? null,
)
const canAct = computed(() => store.can('bookings'))

const openSlots = computed(() =>
  slots.value.filter(
    (s) => s.status !== 'cancelled' && s.status !== 'completed' && s.status !== 'no_show',
  ),
)
const unpaidSlots = computed(() =>
  slots.value.filter((s) => s.paymentStatus === 'unpaid' && s.status !== 'cancelled'),
)
const unpaidTotal = computed(() => unpaidSlots.value.reduce((sum, s) => sum + s.amount, 0))

/**
 * Payment records collapsed per transfer: the rows of one multi-date
 * payment share method, provider reference and status, so they show as
 * one line with the combined amount.
 */
const paymentLines = computed(() => {
  const map = new Map<string, { payment: Payment; amount: number; count: number }>()
  for (const p of detail.value?.payments ?? []) {
    const key = `${p.method}|${p.reference}|${p.status}`
    const line = map.get(key)
    if (line) {
      line.amount += p.amount
      line.count++
    } else map.set(key, { payment: p, amount: p.amount, count: 1 })
  }
  return [...map.values()]
})

/** Why the last action failed, shown inside the open form (move, cancel, pay). */
const actionError = ref('')
watch(mode, () => (actionError.value = ''))

async function run(action: () => Promise<unknown>, message: string): Promise<void> {
  busy.value = true
  actionError.value = ''
  try {
    await action()
    toast.show(message)
    mode.value = 'view'
    await load()
    emit('changed')
  } catch (e) {
    if (mode.value === 'view') toast.error(e)
    else actionError.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    busy.value = false
  }
}

async function reviewProof(approve: boolean): Promise<void> {
  const payment = proof.value
  if (!payment) return
  // Approving/rejecting one row covers the whole multi-date payment.
  await run(
    () => (approve ? approvePayment(payment.id) : rejectPayment(payment.id)),
    approve ? 'Payment approved' : 'Payment rejected',
  )
  proof.value = null
}

function recordPayment(): Promise<void> {
  const targets = unpaidSlots.value
  return run(async () => {
    for (const s of targets) await markBookingPaid(s.id, method.value)
  }, 'Payment recorded')
}

function startCancel(): void {
  cancelScope.value = isGroup.value ? 'all' : 'one'
  mode.value = 'cancel'
}

const cancelTargets = computed(() =>
  cancelScope.value === 'all' ? openSlots.value : b.value ? [b.value] : [],
)
const cancelPaidAmount = computed(() =>
  cancelTargets.value
    .filter((s) => s.paymentStatus === 'paid')
    .reduce((sum, s) => sum + s.amount, 0),
)

function confirmCancel(): Promise<void> {
  const targets = cancelTargets.value
  const all = cancelScope.value === 'all' && isGroup.value
  return run(
    async () => {
      for (const s of targets) await cancelBooking(s.id, refund.value)
    },
    all ? 'Booking cancelled' : 'Time cancelled',
  )
}

async function startReschedule(): Promise<void> {
  if (!b.value) return
  courts.value = (await listCourts(b.value.tenantId)).filter((c) => c.status === 'active')
  Object.assign(move, {
    courtId: b.value.courtId,
    date: b.value.date,
    startHour: String(b.value.startHour),
    duration: String(b.value.durationHours),
  })
  mode.value = 'reschedule'
}

const moveLocation = computed(() => {
  const court = courts.value.find((c) => c.id === move.courtId)
  return store.locations.find((l) => l.id === court?.locationId)
})
const moveHours = computed(() => {
  const loc = moveLocation.value
  if (!loc) return []
  return Array.from({ length: loc.closeHour - loc.openHour }, (_, i) => ({
    value: String(loc.openHour + i),
    label: formatHour(loc.openHour + i),
  }))
})
const courtOptions = computed(() =>
  courts.value.map((c) => ({
    value: c.id,
    label: `${store.locations.find((l) => l.id === c.locationId)?.name ?? ''} · ${c.name}`,
  })),
)
const methods = computed(() =>
  (store.tenant?.bookingRules.paymentMethods ?? []).map((m) => ({
    value: m,
    label: paymentMethodLabels[m],
  })),
)

const slotLabel = (s: BookingRow) =>
  `${formatLongDate(s.date)}, ${formatTimeRange(s.startHour, s.durationHours)}`
const today = todayISO()
const isUpcoming = computed(() => !!b.value && b.value.date >= today)
</script>

<template>
  <AppModal
    :open="bookingId !== null"
    :title="group ? `Booking ${group.reference}` : 'Booking'"
    :description="isGroup ? `${slots.length} times booked together · one payment` : ''"
    size="lg"
    @close="emit('close')"
  >
    <LoadingState v-if="!b || !group" :rows="6" />
    <div v-else class="space-y-5">
      <div class="flex flex-wrap items-center gap-2">
        <AppBadge v-if="group.status === 'mixed'">Mixed</AppBadge>
        <StatusBadge v-else kind="booking" :value="group.status" />
        <AppBadge v-if="group.paymentStatus === 'mixed'">Partly paid</AppBadge>
        <StatusBadge v-else kind="payment" :value="group.paymentStatus" />
        <span class="text-charcoal-400 ml-auto text-xs">
          {{ sourceLabels[b.source] }} booking · created {{ formatRelative(b.createdAt) }}
        </span>
      </div>

      <!-- Times -->
      <div v-if="isGroup">
        <p class="text-charcoal-700 mb-2 text-sm font-semibold">Dates & times</p>
        <ul
          class="border-charcoal-100 divide-charcoal-100 divide-y overflow-hidden rounded-xl border"
        >
          <li v-for="s in slots" :key="s.id">
            <button
              type="button"
              class="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left text-sm transition-colors"
              :class="s.id === b.id ? 'bg-brand-50' : 'hover:bg-charcoal-50'"
              :aria-pressed="s.id === b.id"
              @click="((selectedId = s.id), (mode = 'view'))"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :class="s.id === b.id ? 'bg-brand-600' : 'bg-charcoal-200'"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1">
                <span class="text-charcoal-700 block font-medium">{{ slotLabel(s) }}</span>
                <span class="text-charcoal-400 block text-xs"
                  >{{ s.locationName }} · {{ s.courtName }}</span
                >
              </span>
              <span class="tabular text-charcoal-600">{{ formatPHP(s.amount) }}</span>
              <StatusBadge kind="booking" :value="s.status" />
            </button>
          </li>
        </ul>
        <p class="text-charcoal-400 mt-1.5 text-xs">
          Select a time to check it in, mark a no-show or move it.
        </p>
      </div>

      <div class="grid gap-4 sm:grid-cols-2">
        <div v-if="!isGroup" class="bg-charcoal-50 rounded-xl p-4">
          <p class="text-charcoal-400 text-xs font-medium">When & where</p>
          <p class="text-charcoal-700 mt-1 flex items-center gap-2 font-semibold">
            <CalendarClock class="text-charcoal-400 size-4" aria-hidden="true" />
            {{ formatLongDate(b.date) }}
          </p>
          <p class="text-charcoal-600 mt-0.5 pl-6 text-sm">
            {{ formatTimeRange(b.startHour, b.durationHours) }} ({{ b.durationHours }}h)
          </p>
          <p class="text-charcoal-600 mt-2 flex items-center gap-2 text-sm">
            <MapPin class="text-charcoal-400 size-4" aria-hidden="true" />
            {{ b.locationName }} · {{ b.courtName }}
          </p>
        </div>
        <div class="bg-charcoal-50 rounded-xl p-4" :class="isGroup ? 'sm:col-span-2' : ''">
          <p class="text-charcoal-400 text-xs font-medium">Customer</p>
          <p class="text-charcoal-700 mt-1 font-semibold">{{ b.customerName }}</p>
          <p class="text-charcoal-600 mt-1 flex items-center gap-2 text-sm">
            <Phone class="text-charcoal-400 size-4" aria-hidden="true" />
            <a :href="`tel:${b.customerPhone.replace(/\s/g, '')}`" class="hover:underline">{{
              b.customerPhone
            }}</a>
          </p>
          <p
            v-if="detail?.customer?.email"
            class="text-charcoal-600 mt-1 flex items-center gap-2 text-sm"
          >
            <Mail class="text-charcoal-400 size-4" aria-hidden="true" />
            <span class="truncate">{{ detail.customer.email }}</span>
          </p>
        </div>
      </div>

      <p v-if="b.notes" class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <span class="font-semibold">Note:</span> {{ b.notes }}
      </p>

      <!-- Payment -->
      <div>
        <div class="flex items-baseline justify-between">
          <p class="text-charcoal-700 text-sm font-semibold">
            Payment<template v-if="isGroup"> · all {{ slots.length }} times</template>
          </p>
          <p class="tabular text-charcoal-700 text-lg font-semibold">
            {{ formatPHP(group.total) }}
          </p>
        </div>
        <ul v-if="paymentLines.length" class="divide-charcoal-100 mt-2 divide-y text-sm">
          <li
            v-for="line in paymentLines"
            :key="line.payment.id"
            class="flex items-center justify-between gap-3 py-2"
          >
            <span class="text-charcoal-600">
              {{ paymentMethodLabels[line.payment.method] }}
              <span class="text-charcoal-400 text-xs"
                >· {{ line.payment.reference }} · {{ formatPHP(line.amount) }}</span
              >
            </span>
            <span class="flex items-center gap-2">
              <button
                v-if="line.payment.proofPath || line.payment.status === 'pending'"
                type="button"
                class="text-brand-700 text-xs font-semibold hover:underline"
                @click="proof = { ...line.payment, amount: line.amount }"
              >
                {{ line.payment.proofPath ? 'View proof' : 'Review' }}
              </button>
              <StatusBadge kind="paymentRecord" :value="line.payment.status" />
            </span>
          </li>
        </ul>
        <p v-else class="text-charcoal-400 mt-1 text-sm">No payment recorded yet.</p>
      </div>

      <!-- Inline action panels -->
      <div v-if="mode === 'pay'" class="border-charcoal-100 space-y-3 rounded-xl border p-4">
        <AppSelect v-model="method" label="Payment method" :options="methods" />
        <p v-if="isGroup" class="text-charcoal-400 text-xs">
          Covers {{ unpaidSlots.length }} unpaid {{ unpaidSlots.length === 1 ? 'time' : 'times' }}.
        </p>
        <p v-if="actionError" class="text-sm text-red-600" role="alert">{{ actionError }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" @click="mode = 'view'">Back</AppButton>
          <AppButton :loading="busy" @click="recordPayment">
            Record {{ formatPHP(unpaidTotal) }}
          </AppButton>
        </div>
      </div>

      <div
        v-if="mode === 'cancel'"
        class="space-y-3 rounded-xl border border-red-100 bg-red-50/50 p-4"
      >
        <fieldset v-if="isGroup" class="space-y-2">
          <legend class="text-charcoal-700 mb-1 text-sm font-semibold">What to cancel</legend>
          <label class="text-charcoal-600 flex items-start gap-2 text-sm">
            <input v-model="cancelScope" type="radio" value="all" class="accent-brand-600 mt-1" />
            The whole booking ({{ openSlots.length }}
            {{ openSlots.length === 1 ? 'time' : 'times' }} left)
          </label>
          <label class="text-charcoal-600 flex items-start gap-2 text-sm">
            <input v-model="cancelScope" type="radio" value="one" class="accent-brand-600 mt-1" />
            Only {{ slotLabel(b) }} · {{ b.courtName }}
          </label>
        </fieldset>
        <p class="text-charcoal-600 text-sm">
          Cancelling frees the court for others.
          <template v-if="store.tenant"
            >Free cancellation applies up to
            {{ store.tenant.bookingRules.cancellationWindowHours }} hours before start.</template
          >
        </p>
        <AppToggle
          v-if="cancelPaidAmount > 0"
          v-model="refund"
          label="Refund the payment"
          :description="`${formatPHP(cancelPaidAmount)} back to the customer`"
        />
        <p v-if="actionError" class="text-sm text-red-600" role="alert">{{ actionError }}</p>
        <div class="flex justify-end gap-2">
          <AppButton variant="ghost" @click="mode = 'view'">Keep booking</AppButton>
          <AppButton
            variant="danger"
            :loading="busy"
            :disabled="!cancelTargets.length"
            @click="confirmCancel"
          >
            {{ cancelScope === 'all' && isGroup ? 'Cancel whole booking' : 'Cancel this time' }}
          </AppButton>
        </div>
      </div>

      <div
        v-if="mode === 'reschedule'"
        class="border-charcoal-100 grid gap-3 rounded-xl border p-4 sm:grid-cols-2"
      >
        <p v-if="isGroup" class="text-charcoal-600 text-sm sm:col-span-2">
          Moving {{ slotLabel(b) }} · {{ b.courtName }}
        </p>
        <div class="sm:col-span-2">
          <AppSelect v-model="move.courtId" label="Court" :options="courtOptions" />
        </div>
        <AppInput v-model="move.date" type="date" label="Date" />
        <div class="grid grid-cols-2 gap-3">
          <AppSelect v-model="move.startHour" label="Start" :options="moveHours" />
          <AppSelect
            v-model="move.duration"
            label="Length"
            :options="[1, 2, 3, 4].map((h) => ({ value: String(h), label: `${h}h` }))"
          />
        </div>
        <p v-if="actionError" class="text-sm text-red-600 sm:col-span-2" role="alert">
          {{ actionError }}
        </p>
        <div class="flex justify-end gap-2 sm:col-span-2">
          <AppButton variant="ghost" @click="mode = 'view'">Back</AppButton>
          <AppButton
            :loading="busy"
            @click="
              run(
                () =>
                  rescheduleBooking(b!.id, {
                    courtId: move.courtId,
                    date: move.date,
                    startHour: Number(move.startHour),
                    durationHours: Number(move.duration),
                  }),
                'Time moved',
              )
            "
            >Save new time</AppButton
          >
        </div>
      </div>
    </div>

    <template v-if="b && group && canAct && mode === 'view'" #actions>
      <AppButton
        v-if="openSlots.length"
        variant="ghost"
        class="mr-auto !text-red-600"
        @click="startCancel"
      >
        <template #icon-left><CalendarX2 class="size-4" aria-hidden="true" /></template>
        Cancel booking{{ isGroup ? '…' : '' }}
      </AppButton>
      <AppButton
        v-if="isUpcoming && b.status !== 'cancelled'"
        variant="outline"
        @click="startReschedule"
      >
        {{ isGroup ? 'Move this time' : 'Reschedule' }}
      </AppButton>
      <AppButton
        v-if="b.status === 'confirmed' && b.date <= today"
        variant="outline"
        :loading="busy"
        @click="run(() => setBookingStatus(b!.id, 'no_show'), 'Marked as no-show')"
        >No-show</AppButton
      >
      <AppButton
        v-if="b.status === 'confirmed' && b.date <= today"
        variant="outline"
        :loading="busy"
        @click="run(() => setBookingStatus(b!.id, 'completed'), 'Checked in')"
        >Check in</AppButton
      >
      <AppButton v-if="unpaidSlots.length" @click="mode = 'pay'">Record payment</AppButton>
    </template>
  </AppModal>

  <ProofModal
    :payment="proof"
    :busy="busy"
    @close="proof = null"
    @approve="reviewProof(true)"
    @reject="reviewProof(false)"
  />
</template>
