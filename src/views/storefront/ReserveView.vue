<script setup lang="ts">
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImageUp,
  CheckCircle2,
  CircleAlert,
  Clock,
  CreditCard,
  Info,
  Smartphone,
  Store,
  Wallet,
  X,
} from '@lucide/vue'
import { computed, onBeforeUnmount, onMounted, reactive, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import MonthCalendar from '@/components/storefront/MonthCalendar.vue'
import CourtTimeGrid from '@/components/storefront/CourtTimeGrid.vue'
import PolicyList from '@/components/storefront/PolicyList.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import {
  checkBookingLimits,
  createBookingGroup,
  getAvailability,
  MAX_GROUP_SLOTS,
  type BookingSlot,
  type CreatedBookingGroup,
} from '@/services/bookingService'
import { usingSupabase } from '@/config/env'
import { listPaymentAccounts } from '@/services/paymentAccountService'
import {
  attachPaymentProof,
  PROOF_MAX_BYTES,
  PROOF_TYPES,
  assertProofFile,
  uploadPaymentProof,
} from '@/services/paymentService'
import { listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { PaymentAccount, PaymentMethod } from '@/types/tenant'
import type { Court } from '@/types/venue'
import { formatPHP } from '@/utils/currency'
import {
  addDays,
  formatLongDate,
  formatShortDate,
  formatTimeRange,
  parseISODate,
  todayISO,
} from '@/utils/dates'
import { paymentMethodLabels } from '@/utils/labels'
import { bookingPrice, hourlyRateFor } from '@/utils/pricing'
import { buildHourTiles, selectTile, type HourTile, type TileSelection } from '@/utils/timeTiles'

/**
 * Public booking flow, modelled on match-pickleball's booking modal:
 * pick a court and date, tap a start time (and a later one to book
 * longer), then "Add date" to keep it and pick another date or time. All
 * picks are booked together under one reference and paid once.
 */
const store = useTenantStore()
const toast = useToastStore()
const route = useRoute()
const tenant = computed(() => store.tenant!)
const rules = computed(() => tenant.value.bookingRules)
const policiesOpen = ref(false)

type Step = 'time' | 'details' | 'pay' | 'done'
const step = ref<Step>('time')

// --- Court and date ----------------------------------------------------------
const today = todayISO()
const nowHour = new Date().getHours()
const maxDate = computed(() => addDays(today, rules.value.advanceBookingDays))
const locationId = ref(
  store.activeLocations.some((l) => l.id === route.query.location)
    ? String(route.query.location)
    : (store.activeLocations[0]?.id ?? ''),
)
const queryDate = typeof route.query.date === 'string' ? route.query.date : ''
const date = ref(queryDate >= today && queryDate <= maxDate.value ? queryDate : today)

// --- Date bar: ‹ / › step a day; the date opens the month calendar ----------
const calendarOpen = ref(false)
const datePicker = useTemplateRef<HTMLElement>('datePicker')
watch(date, () => (calendarOpen.value = false))
function stepDay(days: number): void {
  const next = addDays(date.value, days)
  if (next >= today && next <= maxDate.value) date.value = next
}
/** "Today, Tue, Nov 3" / "Tomorrow, Wed, Nov 4" / "Fri, Nov 6". */
const dateLabel = computed(() => {
  const short = parseISODate(date.value).toLocaleDateString('en-PH', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
  if (date.value === today) return `Today, ${short}`
  if (date.value === addDays(today, 1)) return `Tomorrow, ${short}`
  return short
})
// Close the calendar on a click outside it or Escape.
function onDocumentClick(event: MouseEvent): void {
  if (calendarOpen.value && !datePicker.value?.contains(event.target as Node)) {
    calendarOpen.value = false
  }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') calendarOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocumentClick)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick)
  document.removeEventListener('keydown', onKeydown)
})

/** Every court of the business, so added picks at other locations keep their names and prices. */
const allCourts = ref<Court[]>([])
const courts = computed(() =>
  allCourts.value.filter((c) => c.locationId === locationId.value && c.status === 'active'),
)
/** The court of the current selection (the column the customer is picking in). */
const courtId = ref('')
const court = computed(() => allCourts.value.find((c) => c.id === courtId.value) ?? null)
const location = computed(() => store.locations.find((l) => l.id === locationId.value) ?? null)

void listCourts(tenant.value.id).then((list) => (allCourts.value = list))

const taken = ref<Record<string, number[]>>({})
const loadingSlots = ref(true)
async function loadAvailability(): Promise<void> {
  if (!locationId.value) return
  loadingSlots.value = true
  taken.value = await getAvailability(locationId.value, date.value)
  loadingSlots.value = false
}
watch([locationId, date], () => void loadAvailability(), { immediate: true })

// --- Time tiles ---------------------------------------------------------------
const minTiles = computed(() => Math.max(1, Math.ceil(rules.value.minDurationMinutes / 60)))
const maxTiles = computed(() =>
  Math.max(minTiles.value, Math.floor(rules.value.maxDurationMinutes / 60)),
)

/** Dates/times already added with "Add date", earliest first. */
const picks = ref<BookingSlot[]>([])
const lastAdded = ref<BookingSlot | null>(null)

const selection = ref<TileSelection | null>(null)
const selectionError = ref<string | null>(null)
/** The refused tap went past the longest booking: suggest "Add date". */
const hitMax = ref(false)
watch([locationId, date], (_, [oldLocationId, oldDate]) => {
  // A reopened pick goes back on the list as it now stands, rather than
  // vanishing (tiles start at the location's opening hour).
  const oldLocation = store.locations.find((l) => l.id === oldLocationId)
  if (editing.value && selection.value && oldLocation) {
    const kept: BookingSlot = {
      courtId: courtId.value,
      date: oldDate,
      startHour: oldLocation.openHour + selection.value.start,
      durationHours: selection.value.count,
    }
    picks.value = [...picks.value, kept].sort(byStart)
  }
  editing.value = null
  selection.value = null
  selectionError.value = null
})

// The grid is long, so a refused tap is explained in a message floating at
// the bottom of the screen; it goes after a few seconds or on the next tap.
let errorTimer: ReturnType<typeof setTimeout> | undefined
function restartErrorTimer(): void {
  clearTimeout(errorTimer)
  if (selectionError.value) errorTimer = setTimeout(() => (selectionError.value = null), 7000)
}
onBeforeUnmount(() => clearTimeout(errorTimer))

function hoursOf(slots: BookingSlot[]): number[] {
  return slots.flatMap((s) => Array.from({ length: s.durationHours }, (_, i) => s.startHour + i))
}

/** Hour tiles for every court at the location (one grid column each). */
const tilesByCourt = computed<Record<string, HourTile[]>>(() => {
  const loc = location.value
  if (!loc) return {}
  const map: Record<string, HourTile[]> = {}
  for (const c of courts.value) {
    map[c.id] = buildHourTiles({
      openHour: loc.openHour,
      closeHour: loc.closeHour,
      taken: taken.value[c.id] ?? [],
      // Added picks count as taken, so a tile can't be in two of them.
      added: hoursOf(picks.value.filter((p) => p.courtId === c.id && p.date === date.value)),
      pastBefore: date.value === today ? nowHour + 1 : null,
      priceFor: (h) => hourlyRateFor(c, h),
    })
  }
  return map
})
const tiles = computed(() => tilesByCourt.value[courtId.value] ?? [])

/** Tapping a cell in another court starts a new selection there. */
/** Most hours one player may book on one court per day (null = no limit). */
const courtDayCap = computed(() => rules.value.maxCourtHoursPerDay)
const hoursLabel = (h: number) => `${h} hour${h === 1 ? '' : 's'}`

/** Hours still free for this player on a court today, after the picks already added. */
function hoursLeftOn(cellCourtId: string): number {
  const cap = courtDayCap.value
  if (cap === null) return Infinity
  const used = picks.value
    .filter((p) => p.courtId === cellCourtId && p.date === date.value)
    .reduce((sum, p) => sum + p.durationHours, 0)
  return cap - used
}

/** Appended to the "Add date" tips when the business limits hours per court per day. */
const courtDayLimitNote = computed(() =>
  courtDayCap.value === null
    ? ''
    : ` You can book up to ${hoursLabel(courtDayCap.value)} on one court each day.`,
)

/** A pick reopened from the grid ("Added" tile), shown in a note while it's being changed. */
const editing = ref<BookingSlot | null>(null)

/**
 * Tapping an "Added" tile takes that pick back out of the list and makes it
 * the current selection, so it can be shortened, extended or cleared. Any
 * selection in progress is added first, so nothing is lost.
 */
function reopenPick(cellCourtId: string, hour: number): void {
  const pick = picks.value.find(
    (p) =>
      p.courtId === cellCourtId &&
      p.date === date.value &&
      hour >= p.startHour &&
      hour < p.startHour + p.durationHours,
  )
  if (!pick) return
  const others = picks.value.filter((p) => slotKey(p) !== slotKey(pick))
  picks.value = (range.value ? [...others, range.value] : others).sort(byStart)
  courtId.value = cellCourtId
  const start = (tilesByCourt.value[cellCourtId] ?? []).findIndex((t) => t.hour === pick.startHour)
  selection.value = { start, count: pick.durationHours }
  selectionError.value = null
  editing.value = pick
  lastAdded.value = null
}

function tapCell(cellCourtId: string, index: number): void {
  const tile = tilesByCourt.value[cellCourtId]?.[index]
  if (tile?.status === 'added') {
    reopenPick(cellCourtId, tile.hour)
    return
  }
  // Another court: keep the time picked so far (as if "Add date" was
  // tapped) and start a new selection there, so several courts can be
  // booked together.
  if (cellCourtId !== courtId.value && range.value) {
    if (!canAddDate.value) {
      selectionError.value = `One booking can have up to ${MAX_GROUP_SLOTS} times. Continue with these, then book the rest separately.`
      hitMax.value = false
      restartErrorTimer()
      return
    }
    picks.value = [...picks.value, range.value].sort(byStart)
    selection.value = null
    editing.value = null
  }
  const current = cellCourtId === courtId.value ? selection.value : null
  const cellCourt = courts.value.find((c) => c.id === cellCourtId)?.name ?? 'this court'
  const left = hoursLeftOn(cellCourtId)
  const limit = Math.min(maxTiles.value, left)
  hitMax.value = false
  if (limit < minTiles.value) {
    // Already holds the day's limit on this court through earlier picks.
    selectionError.value = `You can book up to ${hoursLabel(courtDayCap.value!)} on ${cellCourt} per day. Pick another court or day.`
  } else {
    const result = selectTile(
      tilesByCourt.value[cellCourtId] ?? [],
      current,
      index,
      minTiles.value,
      limit,
    )
    if (result.selection) courtId.value = cellCourtId
    selection.value = result.selection ?? (cellCourtId === courtId.value ? null : selection.value)
    selectionError.value = result.error
    if (result.reason === 'max' && limit < maxTiles.value) {
      // The per-court daily limit, not the booking length, is what stopped it.
      selectionError.value = `You can book up to ${hoursLabel(courtDayCap.value!)} on ${cellCourt} per day (${hoursLabel(left)} left). Pick another court or day for more.`
    } else {
      hitMax.value = result.reason === 'max'
    }
  }
  restartErrorTimer()
  // They've started on the next pick, so the "added" note has done its job.
  lastAdded.value = null
}
const gridSelection = computed(() =>
  selection.value ? { ...selection.value, courtId: courtId.value } : null,
)

/** The current tile selection as a slot. */
const range = computed<BookingSlot | null>(() => {
  const s = selection.value
  if (!s || !court.value) return null
  return {
    courtId: court.value.id,
    date: date.value,
    startHour: tiles.value[s.start]!.hour,
    durationHours: s.count,
  }
})

const byStart = (a: BookingSlot, b: BookingSlot) =>
  a.date.localeCompare(b.date) || a.startHour - b.startHour

/** Everything in this booking: the added picks plus the current selection. */
const ranges = computed(() => [...picks.value, ...(range.value ? [range.value] : [])].sort(byStart))

function priceOf(slot: BookingSlot): number {
  const c = allCourts.value.find((x) => x.id === slot.courtId)
  return c ? bookingPrice(c, slot.startHour, slot.durationHours) : 0
}
const total = computed(() => ranges.value.reduce((sum, r) => sum + priceOf(r), 0))

const canAddDate = computed(() => range.value !== null && ranges.value.length < MAX_GROUP_SLOTS)

function addAnotherDate(): void {
  if (!canAddDate.value || !range.value) return
  lastAdded.value = range.value
  picks.value = [...picks.value, range.value].sort(byStart)
  selection.value = null
  selectionError.value = null
  editing.value = null
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

/** The × in the summary: an added pick, or the selection in progress. */
function removeRange(slot: BookingSlot): void {
  if (range.value && slotKey(range.value) === slotKey(slot)) {
    selection.value = null
    editing.value = null
  } else {
    removePick(slot)
  }
}

const slotKey = (s: BookingSlot) => `${s.courtId}|${s.date}|${s.startHour}`

function removePick(slot: BookingSlot): void {
  picks.value = picks.value.filter((p) => slotKey(p) !== slotKey(slot))
  if (lastAdded.value && slotKey(lastAdded.value) === slotKey(slot)) lastAdded.value = null
  conflicts.value.delete(slotKey(slot))
}

/** Calendar dates that already have a time in this booking. */
const markedDates = computed(() => [...new Set(picks.value.map((p) => p.date))])

const multiLocation = computed(() => store.activeLocations.length > 1)
function slotWhere(slot: BookingSlot): string {
  const c = allCourts.value.find((x) => x.id === slot.courtId)
  const loc = store.locations.find((l) => l.id === c?.locationId)
  return multiLocation.value && loc ? `${c?.name} · ${loc.name}` : (c?.name ?? '')
}
function slotWhen(slot: BookingSlot): string {
  const weekday = parseISODate(slot.date).toLocaleDateString('en-PH', { weekday: 'short' })
  return `${weekday}, ${formatShortDate(slot.date)} · ${formatTimeRange(slot.startHour, slot.durationHours)}`
}

const allTiles = computed(() => Object.values(tilesByCourt.value).flat())

const priceRange = computed(() => {
  const prices = allTiles.value.map((t) => t.price)
  if (!prices.length) return null
  const lo = Math.min(...prices)
  const hi = Math.max(...prices)
  return lo === hi ? `${formatPHP(lo)}/hr` : `${formatPHP(lo)}–${formatPHP(hi)}/hr`
})

const openCount = computed(() => allTiles.value.filter((t) => t.status === 'available').length)

/** Picks someone else booked while this customer was checking out. */
const conflicts = ref(new Set<string>())

// --- Details ------------------------------------------------------------------
const details = reactive({ name: '', phone: '', email: '', notes: '', agree: false })
const errors = reactive<Record<string, string>>({})

function toDetails(): void {
  if (!ranges.value.length) return
  // Keep the current selection as a pick so Back shows everything added.
  if (range.value) {
    picks.value = [...ranges.value]
    selection.value = null
  }
  lastAdded.value = null
  editing.value = null
  step.value = 'details'
  window.scrollTo({ top: 0 })
}

/** Why this player can't book these times (from the one pre-check), if anything. */
const limitError = ref('')
const checkingLimits = ref(false)

async function toPayment(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  limitError.value = ''
  if (!details.name.trim()) errors.name = 'Enter your name'
  if (details.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter your mobile number'
  if (details.email && !/^\S+@\S+\.\S+$/.test(details.email)) errors.email = 'Check your email'
  if (!details.agree) errors.agree = 'Please accept the rules & policies'
  if (Object.keys(errors).length) return
  // First moment the phone is known: one check of the per-player limits
  // (their earlier bookings count too), instead of failing at the very end.
  checkingLimits.value = true
  try {
    await checkBookingLimits(tenant.value.id, ranges.value, details.phone.trim())
  } catch (e) {
    limitError.value = e instanceof Error ? e.message : 'Could not check your booking. Try again.'
    return
  } finally {
    checkingLimits.value = false
  }
  step.value = 'pay'
  startHold()
}

// --- Payment ------------------------------------------------------------------
/** Pay-at-venue only shows when the business doesn't require prepayment. */
const methods = computed(() =>
  rules.value.paymentMethods.filter((m) => m !== 'cash' || !rules.value.requirePrepayment),
)
const method = ref<PaymentMethod | null>(null)
watch(methods, (m) => (method.value = m[0] ?? null), { immediate: true })

const methodIcon = {
  gcash: Smartphone,
  maya: Wallet,
  card: CreditCard,
  bank_transfer: Building2,
  cash: Store,
}
const methodHint: Record<PaymentMethod, string> = {
  gcash: 'Send to our GCash number, then confirm. We verify within the hour.',
  maya: 'Send to our Maya number, then confirm. We verify within the hour.',
  card: 'Visa or Mastercard, confirmed instantly.',
  bank_transfer: 'Transfer to our account, then confirm. We verify within the hour.',
  cash: 'Reserve now and pay at the front desk.',
}
// GCash, Maya and bank transfers go to the business's own account and are
// confirmed by staff. Card would go through a payment provider instead.
const needsProof = computed(
  () => method.value === 'gcash' || method.value === 'maya' || method.value === 'bank_transfer',
)

/** The business's payment details for the chosen method (public). */
const accounts = ref<PaymentAccount[]>([])
void listPaymentAccounts(tenant.value.id).then((list) => (accounts.value = list))
const account = computed(() => accounts.value.find((a) => a.method === method.value) ?? null)

const copied = ref(false)
async function copyNumber(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value.replace(/\s/g, ''))
    copied.value = true
    setTimeout(() => (copied.value = false), 1500)
  } catch {
    // Clipboard blocked: the number is still visible to copy by hand.
  }
}

// Visual hold timer for the unpaid slots (the real hold is server-side later).
const holdLeft = ref(0)
let timer: ReturnType<typeof setInterval> | undefined
function startHold(): void {
  holdLeft.value = rules.value.holdMinutes * 60
  clearInterval(timer)
  timer = setInterval(() => {
    holdLeft.value = Math.max(0, holdLeft.value - 1)
    if (holdLeft.value === 0) clearInterval(timer)
  }, 1000)
}
onBeforeUnmount(() => clearInterval(timer))
const holdText = computed(
  () => `${Math.floor(holdLeft.value / 60)}:${String(holdLeft.value % 60).padStart(2, '0')}`,
)

const submitting = ref(false)
const result = ref<CreatedBookingGroup | null>(null)

// --- Proof of payment (GCash / Maya / bank transfer) --------------------------
const proofFile = ref<File | null>(null)
const proofPreview = ref<string | null>(null)
const proofError = ref('')
const transactionReference = ref('')
/** Set when the booking was made but the screenshot couldn't be attached. */
const proofWarning = ref('')

function onProofFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0] ?? null
  input.value = ''
  proofError.value = ''
  if (!file) return
  if (!PROOF_TYPES.includes(file.type)) {
    proofError.value = 'Use a JPG, PNG, WebP or PDF file.'
    return
  }
  if (file.size > PROOF_MAX_BYTES) {
    proofError.value = 'That file is over 5 MB. Try a smaller screenshot.'
    return
  }
  if (proofPreview.value) URL.revokeObjectURL(proofPreview.value)
  proofFile.value = file
  proofPreview.value = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
}

function clearProof(): void {
  if (proofPreview.value) URL.revokeObjectURL(proofPreview.value)
  proofFile.value = null
  proofPreview.value = null
}
onBeforeUnmount(clearProof)

async function confirm(): Promise<void> {
  if (!ranges.value.length || !method.value) return
  if (needsProof.value && !proofFile.value) {
    proofError.value = 'Upload a screenshot of your payment first.'
    return
  }
  submitting.value = true
  proofWarning.value = ''
  try {
    // Check the file first: if it's the wrong type or too big, no booking is made.
    const proof = needsProof.value ? proofFile.value : null
    if (proof) assertProofFile(proof)

    result.value = await createBookingGroup({
      tenantId: tenant.value.id,
      slots: ranges.value,
      customer: {
        name: details.name.trim(),
        phone: details.phone.trim(),
        email: details.email.trim(),
      },
      notes: details.notes.trim(),
      source: 'online',
      paymentMethod: method.value === 'cash' ? null : method.value,
      paymentPending: needsProof.value,
      fromBookingSite: true,
    })

    // The upload goes into the new booking's folder, so it comes second.
    if (proof) {
      try {
        const proofPath = await uploadPaymentProof(tenant.value.id, result.value.reference, proof)
        await attachPaymentProof(
          tenant.value.id,
          result.value.reference,
          details.phone.trim(),
          proofPath,
          transactionReference.value,
        )
      } catch {
        // The booking stands; staff can still check their account.
        proofWarning.value = `We couldn't attach your screenshot. Show it to ${tenant.value.name} or send it to ${tenant.value.phone}.`
      }
    }
    clearProof()
    clearInterval(timer)
    step.value = 'done'
    window.scrollTo({ top: 0 })
  } catch (e) {
    toast.error(e)
    // Someone else may have taken one of the times: find which, then let
    // the customer remove it or pick another.
    if (e instanceof Error && /overlap/.test(e.message)) await markConflicts()
  } finally {
    submitting.value = false
  }
}

async function markConflicts(): Promise<void> {
  const found = new Set<string>()
  for (const slot of ranges.value) {
    const c = allCourts.value.find((x) => x.id === slot.courtId)
    if (!c) continue
    const busy = (await getAvailability(c.locationId, slot.date))[c.id] ?? []
    if (hoursOf([slot]).some((h) => busy.includes(h))) found.add(slotKey(slot))
  }
  conflicts.value = found
  step.value = 'time'
  await loadAvailability()
}

function startOver(): void {
  result.value = null
  picks.value = []
  selection.value = null
  conflicts.value = new Set()
  Object.assign(details, { notes: '', agree: false })
  step.value = 'time'
  void loadAvailability()
}

const first = computed(() => result.value?.bookings[0] ?? null)
const stepIndex = computed(() => ['time', 'details', 'pay', 'done'].indexOf(step.value))
const offline = computed(
  () => tenant.value.status === 'suspended' || tenant.value.status === 'cancelled',
)
</script>

<template>
  <div
    class="mx-auto max-w-6xl px-4 py-10 sm:px-6"
    :class="step === 'time' ? 'pb-28 lg:pb-10' : ''"
  >
    <div v-if="offline" class="border-charcoal-100 rounded-2xl border bg-white p-10 text-center">
      <p class="text-charcoal-700 font-semibold">Online booking is paused</p>
      <p class="text-charcoal-400 mt-1 text-sm">Call {{ tenant.phone }} to reserve a court.</p>
    </div>

    <template v-else>
      <!-- Progress -->
      <ol
        v-if="step !== 'done'"
        class="mb-8 flex items-center gap-2 text-xs font-medium sm:gap-4"
        aria-label="Booking steps"
      >
        <li
          v-for="(label, i) in ['Choose times', 'Your details', 'Payment']"
          :key="label"
          class="flex items-center gap-2"
          :class="i <= stepIndex ? 'text-brand-700' : 'text-charcoal-300'"
          :aria-current="i === stepIndex ? 'step' : undefined"
        >
          <span
            class="tabular flex size-6 items-center justify-center rounded-full text-[11px]"
            :class="
              i < stepIndex
                ? 'bg-brand-600 text-white'
                : i === stepIndex
                  ? 'border-brand-600 border-2'
                  : 'border-charcoal-200 border'
            "
            >{{ i + 1 }}</span
          >
          <span class="hidden sm:inline">{{ label }}</span>
          <span v-if="i < 2" class="bg-charcoal-200 h-px w-6 sm:w-10" aria-hidden="true" />
        </li>
      </ol>

      <div v-if="step !== 'done'" class="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <!-- Main column -->
        <div class="min-w-0">
          <!-- Step 1: times -->
          <div v-if="step === 'time'">
            <h1 class="text-charcoal-700 font-display text-3xl uppercase">Choose your times</h1>

            <p
              v-if="lastAdded"
              class="bg-brand-700 mt-5 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm text-white"
              role="status"
            >
              <CheckCircle2 class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{{ slotWhen(lastAdded) }}</strong> added. Now pick another date above, or
                another time on this day.
              </span>
            </p>
            <p
              v-else-if="editing && range"
              class="bg-brand-50 text-charcoal-700 mt-5 flex items-start gap-2.5 rounded-2xl px-4 py-3 text-sm"
              role="status"
            >
              <Info class="text-brand-700 mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Changing <strong>{{ slotWhen(editing) }}</strong
                >. Tap a time to shorten or extend it, or tap its start time to remove it.
              </span>
            </p>

            <div class="mt-6">
              <!-- Date + location in one compact bar, so the courts get the full width -->
              <div class="flex flex-wrap items-center gap-x-3 gap-y-3">
                <div class="flex items-center gap-2">
                  <button
                    type="button"
                    class="border-charcoal-200 text-charcoal-600 hover:bg-charcoal-50 flex size-10 items-center justify-center rounded-xl border bg-white disabled:opacity-40"
                    :disabled="date <= today"
                    aria-label="Previous day"
                    @click="stepDay(-1)"
                  >
                    <ChevronLeft class="size-5" aria-hidden="true" />
                  </button>
                  <div ref="datePicker" class="relative">
                    <button
                      type="button"
                      class="text-charcoal-700 flex h-10 items-center gap-2 rounded-xl border bg-white px-4 text-sm font-semibold transition-colors"
                      :class="
                        calendarOpen
                          ? 'border-brand-600 ring-brand-600 ring-1'
                          : 'border-charcoal-200 hover:bg-charcoal-50'
                      "
                      aria-haspopup="dialog"
                      :aria-expanded="calendarOpen"
                      @click="calendarOpen = !calendarOpen"
                    >
                      <CalendarDays class="text-charcoal-400 size-4" aria-hidden="true" />
                      {{ dateLabel }}
                    </button>
                    <div
                      v-if="calendarOpen"
                      class="border-charcoal-100 absolute top-full left-0 z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border bg-white p-4 shadow-xl"
                      role="dialog"
                      aria-label="Choose a date"
                    >
                      <MonthCalendar
                        v-model="date"
                        :min="today"
                        :max="maxDate"
                        :marked="markedDates"
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    class="border-charcoal-200 text-charcoal-600 hover:bg-charcoal-50 flex size-10 items-center justify-center rounded-xl border bg-white disabled:opacity-40"
                    :disabled="date >= maxDate"
                    aria-label="Next day"
                    @click="stepDay(1)"
                  >
                    <ChevronRight class="size-5" aria-hidden="true" />
                  </button>
                </div>
                <div
                  v-if="multiLocation"
                  class="flex flex-wrap gap-2"
                  role="radiogroup"
                  aria-label="Location"
                >
                  <button
                    v-for="l in store.activeLocations"
                    :key="l.id"
                    type="button"
                    role="radio"
                    :aria-checked="locationId === l.id"
                    class="h-10 rounded-full border px-4 text-sm font-semibold transition-colors"
                    :class="
                      locationId === l.id
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-charcoal-200 text-charcoal-600 hover:bg-charcoal-50 bg-white'
                    "
                    @click="locationId = l.id"
                  >
                    {{ l.name }}
                  </button>
                </div>
                <p v-if="priceRange" class="text-charcoal-500 ml-auto text-sm">{{ priceRange }}</p>
              </div>

              <!-- Tiles -->
              <div>
                <LoadingState v-if="loadingSlots" class="!px-0" :rows="6" />
                <p
                  v-else-if="!courts.length"
                  class="bg-charcoal-50 text-charcoal-500 mt-4 rounded-2xl px-4 py-8 text-center text-sm"
                >
                  No courts are open for booking at this location.
                </p>
                <template v-else>
                  <CourtTimeGrid
                    class="mt-4"
                    :courts="courts"
                    :tiles-by-court="tilesByCourt"
                    :selection="gridSelection"
                    @tap="tapCell"
                  />
                  <p
                    v-if="!openCount && !selection"
                    class="bg-charcoal-50 text-charcoal-500 mt-3 rounded-xl px-4 py-3 text-sm"
                  >
                    Every court is fully booked on this day. Try another date.
                  </p>
                  <p class="text-charcoal-500 mt-4 flex items-start gap-2 text-sm">
                    <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    Tap a start time on a court, then a later time on the same court to book longer.
                    Tap a picked time to shorten. Want more courts? Just tap another court — your
                    times are kept. Another day or a separate time on the same court? Tap “Add
                    date”, then pick it. To change an added time, tap it on the grid, or remove it
                    with × in your booking.
                  </p>
                  <p
                    v-if="range"
                    class="bg-brand-50 text-charcoal-700 mt-4 rounded-2xl px-4 py-3 font-medium"
                    role="status"
                  >
                    {{ court?.name }} ·
                    {{ formatTimeRange(range.startHour, range.durationHours) }} ·
                    {{ range.durationHours }} hr{{ range.durationHours === 1 ? '' : 's' }} ·
                    {{ formatPHP(priceOf(range)) }}
                  </p>
                  <p
                    v-if="range && canAddDate && range.durationHours >= maxTiles"
                    class="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
                    role="status"
                  >
                    <Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>
                      That's the longest time for one pick ({{ maxTiles }} hr{{
                        maxTiles === 1 ? '' : 's'
                      }}). Want to play longer? Tap <strong>“Add date”</strong>, then keep selecting
                      your next time slot — on this day or another.{{ courtDayLimitNote }} We limit
                      each pick so bots or bulk bookings can't fill up the courts.
                    </span>
                  </p>
                  <p v-if="range && !canAddDate" class="text-charcoal-500 mt-3 text-sm">
                    That's the most dates for one booking ({{ MAX_GROUP_SLOTS }}). We limit this so
                    bots or bulk bookings can't fill up the courts.
                  </p>
                </template>

                <!-- Added picks -->
                <div v-if="picks.length" class="mt-6">
                  <p class="text-charcoal-600 text-sm font-medium">
                    Added to this booking ({{ picks.length }}
                    {{ picks.length === 1 ? 'time' : 'times' }})
                  </p>
                  <ul
                    class="border-charcoal-100 divide-charcoal-100 mt-2 divide-y rounded-2xl border bg-white"
                  >
                    <li
                      v-for="pick in picks"
                      :key="slotKey(pick)"
                      class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                    >
                      <span class="min-w-0">
                        <span class="text-charcoal-700 font-semibold">{{ slotWhen(pick) }}</span>
                        <span class="text-charcoal-500"> · {{ slotWhere(pick) }}</span>
                        <span v-if="conflicts.has(slotKey(pick))" class="block text-red-600"
                          >Just booked by someone else — remove it or pick another time.</span
                        >
                        <span v-else class="text-charcoal-500">
                          · {{ formatPHP(priceOf(pick)) }}</span
                        >
                      </span>
                      <button
                        type="button"
                        class="text-charcoal-400 hover:bg-charcoal-50 hover:text-charcoal-700 shrink-0 rounded-lg p-1.5"
                        :aria-label="`Remove ${slotWhen(pick)}`"
                        @click="removePick(pick)"
                      >
                        <X class="size-4" aria-hidden="true" />
                      </button>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Step 2: details -->
          <form
            v-else-if="step === 'details'"
            class="space-y-5"
            novalidate
            @submit.prevent="toPayment"
          >
            <button
              type="button"
              class="text-charcoal-400 hover:text-charcoal-600 flex items-center gap-1 text-sm"
              @click="step = 'time'"
            >
              <ArrowLeft class="size-4" aria-hidden="true" /> Change times
            </button>
            <h1 class="text-charcoal-700 font-display text-3xl uppercase">Your details</h1>
            <div
              class="border-charcoal-100 grid gap-4 rounded-2xl border bg-white p-5 sm:grid-cols-2"
            >
              <div class="sm:col-span-2">
                <AppInput
                  v-model="details.name"
                  label="Full name"
                  autocomplete="name"
                  required
                  :error="errors.name"
                />
              </div>
              <AppInput
                v-model="details.phone"
                type="tel"
                label="Mobile number"
                autocomplete="tel"
                placeholder="09XX XXX XXXX"
                hint="We'll text your booking reference here"
                required
                :error="errors.phone"
              />
              <AppInput
                v-model="details.email"
                type="email"
                label="Email"
                autocomplete="email"
                hint="Optional"
                :error="errors.email"
              />
              <div class="sm:col-span-2">
                <AppTextarea
                  v-model="details.notes"
                  label="Anything we should know?"
                  :rows="2"
                  placeholder="Paddle rental, beginners, etc."
                />
              </div>
              <label class="text-charcoal-600 flex items-start gap-2 text-sm sm:col-span-2">
                <input v-model="details.agree" type="checkbox" class="accent-brand-600 mt-0.5" />
                <span>
                  I have read and agree to {{ tenant.name }}'s
                  <button
                    type="button"
                    class="text-brand-700 font-semibold underline"
                    @click.prevent="policiesOpen = true"
                  >
                    rules &amp; policies</button
                  >.
                  <span class="text-charcoal-400 block text-xs">
                    Free cancellation up to {{ rules.cancellationWindowHours }} hours before start.
                  </span>
                  <span v-if="errors.agree" class="block text-xs text-red-600" role="alert">{{
                    errors.agree
                  }}</span>
                </span>
              </label>
            </div>
            <div
              v-if="limitError"
              class="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm"
              role="alert"
            >
              <CircleAlert class="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
              <div class="min-w-0 flex-1">
                <p class="font-semibold text-red-800">{{ limitError }}</p>
                <button
                  type="button"
                  class="mt-1 font-semibold text-red-700 underline"
                  @click="((limitError = ''), (step = 'time'))"
                >
                  Change times
                </button>
              </div>
            </div>
            <AppButton type="submit" size="lg" :loading="checkingLimits">
              Continue to payment
            </AppButton>
          </form>

          <!-- Step 3: payment -->
          <div v-else-if="step === 'pay'" class="space-y-5">
            <button
              type="button"
              class="text-charcoal-400 hover:text-charcoal-600 flex items-center gap-1 text-sm"
              @click="step = 'details'"
            >
              <ArrowLeft class="size-4" aria-hidden="true" /> Back
            </button>
            <h1 class="text-charcoal-700 font-display text-3xl uppercase">Payment</h1>
            <p
              v-if="holdLeft > 0"
              class="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800"
              role="status"
            >
              <Clock class="size-4" aria-hidden="true" />
              We're holding {{ ranges.length === 1 ? 'this court' : 'these times' }} for you for
              <span class="tabular font-semibold">{{ holdText }}</span
              >.
            </p>
            <p v-else class="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-800" role="status">
              Your hold expired. You can still try to book — we'll check the courts are free.
            </p>
            <div class="space-y-2" role="radiogroup" aria-label="Payment method">
              <label
                v-for="m in methods"
                :key="m"
                class="flex cursor-pointer items-start gap-3 rounded-2xl border bg-white p-4 transition-colors"
                :class="
                  method === m
                    ? 'border-brand-600 ring-brand-600 ring-1'
                    : 'border-charcoal-100 hover:border-charcoal-200'
                "
              >
                <input
                  v-model="method"
                  type="radio"
                  name="method"
                  :value="m"
                  class="accent-brand-600 mt-1"
                />
                <component
                  :is="methodIcon[m]"
                  class="text-charcoal-400 mt-0.5 size-5"
                  aria-hidden="true"
                />
                <span>
                  <span class="text-charcoal-700 block text-sm font-semibold">
                    {{ m === 'cash' ? 'Pay at the venue' : paymentMethodLabels[m] }}
                  </span>
                  <span class="text-charcoal-400 block text-xs">{{ methodHint[m] }}</span>
                </span>
              </label>
            </div>
            <div v-if="needsProof" class="bg-brand-50 text-brand-900 rounded-2xl p-5 text-sm">
              <template v-if="account && account.accountNumber">
                <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
                  <img
                    v-if="account.qrUrl"
                    :src="account.qrUrl"
                    :alt="`${tenant.name} ${paymentMethodLabels[account.method]} QR code`"
                    class="mx-auto size-48 shrink-0 rounded-xl bg-white object-contain p-2 shadow-sm sm:mx-0"
                  />
                  <div class="min-w-0 flex-1">
                    <p class="font-semibold">
                      Send {{ formatPHP(total) }} via
                      {{
                        account.method === 'bank_transfer' && account.bankName
                          ? account.bankName
                          : paymentMethodLabels[account.method]
                      }}
                    </p>
                    <p v-if="account.qrUrl" class="mt-0.5 text-xs opacity-80">
                      Scan the QR code, or send to:
                    </p>
                    <dl class="mt-3 space-y-1.5">
                      <div>
                        <dt class="text-xs opacity-70">Account name</dt>
                        <dd class="font-medium">{{ account.accountName }}</dd>
                      </div>
                      <div>
                        <dt class="text-xs opacity-70">
                          {{ account.method === 'bank_transfer' ? 'Account number' : 'Number' }}
                        </dt>
                        <dd class="flex items-center gap-2">
                          <span class="tabular font-mono text-base font-semibold">{{
                            account.accountNumber
                          }}</span>
                          <button
                            type="button"
                            class="text-brand-700 hover:bg-brand-100 rounded-md px-2 py-0.5 text-xs font-semibold"
                            @click="copyNumber(account.accountNumber)"
                          >
                            {{ copied ? 'Copied' : 'Copy' }}
                          </button>
                        </dd>
                      </div>
                    </dl>
                    <p
                      v-if="account.instructions"
                      class="mt-3 rounded-lg bg-white/70 px-3 py-2 text-xs"
                    >
                      {{ account.instructions }}
                    </p>
                  </div>
                </div>
              </template>
              <p v-else class="font-semibold">
                Send {{ formatPHP(total) }} by {{ method ? paymentMethodLabels[method] : '' }} — ask
                {{ tenant.name }} for their details at {{ tenant.phone }}.
              </p>
              <p class="mt-4 text-xs opacity-80">
                One payment covers all {{ ranges.length }}
                {{ ranges.length === 1 ? 'booking' : 'dates/times' }}. Use your name as the message;
                {{ tenant.name }} confirms once the payment is checked.
              </p>
            </div>

            <!-- Proof of payment -->
            <div v-if="needsProof" class="border-charcoal-100 rounded-2xl border bg-white p-5">
              <p class="text-charcoal-700 text-sm font-semibold">
                Upload your payment screenshot <span class="text-red-600">*</span>
              </p>
              <p class="text-charcoal-400 mt-0.5 text-xs">
                After paying, take a screenshot of the confirmation and upload it here.
              </p>

              <label
                v-if="!proofFile"
                class="border-charcoal-200 hover:border-brand-600 hover:bg-brand-50/40 mt-3 flex cursor-pointer flex-col items-center gap-1 rounded-xl border-2 border-dashed px-4 py-6 text-center transition-colors"
              >
                <ImageUp class="text-brand-600 size-7" aria-hidden="true" />
                <span class="text-charcoal-700 text-sm font-semibold">Choose a screenshot</span>
                <span class="text-charcoal-400 text-xs">JPG, PNG, WebP or PDF, up to 5 MB</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  class="sr-only"
                  @change="onProofFile"
                />
              </label>
              <div
                v-else
                class="border-charcoal-100 bg-charcoal-50 mt-3 flex items-center gap-3 rounded-xl border p-3"
              >
                <img
                  v-if="proofPreview"
                  :src="proofPreview"
                  alt="Your payment screenshot"
                  class="size-16 shrink-0 rounded-lg bg-white object-cover"
                />
                <FileText v-else class="text-charcoal-400 size-10 shrink-0" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="text-charcoal-700 truncate text-sm font-medium">{{ proofFile.name }}</p>
                  <p class="text-charcoal-400 text-xs">Ready to send</p>
                </div>
                <button
                  type="button"
                  class="text-charcoal-500 hover:bg-charcoal-100 rounded-lg px-2 py-1 text-xs font-semibold"
                  @click="clearProof"
                >
                  Change
                </button>
              </div>
              <p v-if="proofError" class="mt-2 text-xs text-red-600" role="alert">
                {{ proofError }}
              </p>

              <div class="mt-4">
                <AppInput
                  v-model="transactionReference"
                  label="Reference number"
                  hint="Optional — the Ref. No. on your GCash / bank receipt"
                  placeholder="e.g. 1012 345 678901"
                />
              </div>
            </div>

            <AppButton
              size="lg"
              :loading="submitting"
              :disabled="!method || (needsProof && !proofFile)"
              @click="confirm"
            >
              {{
                method === 'cash'
                  ? 'Reserve now, pay at venue'
                  : needsProof
                    ? 'Submit payment'
                    : `Pay ${formatPHP(total)}`
              }}
            </AppButton>
            <p v-if="!usingSupabase" class="text-charcoal-400 text-xs">
              Demo checkout — no real payment is taken.
            </p>
          </div>
        </div>

        <!-- Summary -->
        <aside
          class="border-charcoal-100 h-fit rounded-2xl border bg-white p-5 lg:sticky lg:top-24"
          aria-label="Booking summary"
        >
          <p class="text-charcoal-700 font-semibold">Your booking</p>
          <p v-if="!ranges.length" class="text-charcoal-400 mt-3 text-sm">
            Pick a court, a date and a time to get started.
          </p>
          <ul v-else class="mt-3 space-y-3 text-sm">
            <li v-for="r in ranges" :key="slotKey(r)" class="flex items-start gap-2">
              <span class="min-w-0 flex-1">
                <span class="text-charcoal-700 block font-medium">{{ slotWhen(r) }}</span>
                <span class="text-charcoal-400 block text-xs">{{ slotWhere(r) }}</span>
              </span>
              <span class="tabular text-charcoal-700 shrink-0">{{ formatPHP(priceOf(r)) }}</span>
              <button
                v-if="step === 'time'"
                type="button"
                class="text-charcoal-400 -mt-0.5 -mr-1.5 shrink-0 rounded-lg p-1 hover:bg-red-50 hover:text-red-600"
                :aria-label="`Remove ${slotWhen(r)}`"
                @click="removeRange(r)"
              >
                <X class="size-4" aria-hidden="true" />
              </button>
            </li>
          </ul>
          <div class="border-charcoal-100 mt-4 flex items-baseline justify-between border-t pt-4">
            <span class="text-charcoal-500 text-sm">
              Total<template v-if="ranges.length > 1"> · {{ ranges.length }} times</template>
            </span>
            <span class="tabular text-charcoal-700 text-xl font-semibold">{{
              ranges.length ? formatPHP(total) : '—'
            }}</span>
          </div>
          <div v-if="step === 'time'" class="mt-4 hidden space-y-2 lg:block">
            <AppButton
              v-if="canAddDate"
              variant="outline"
              full-width
              size="lg"
              @click="addAnotherDate"
            >
              <template #icon-left><CalendarPlus class="size-4" aria-hidden="true" /></template>
              Add date
            </AppButton>
            <AppButton full-width size="lg" :disabled="!ranges.length" @click="toDetails">
              Continue
            </AppButton>
          </div>
        </aside>
      </div>

      <!-- Why a tap was refused, floating above the phone action bar -->
      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="translate-y-2 opacity-0"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0"
      >
        <div
          v-if="step === 'time' && selectionError"
          class="fixed inset-x-4 bottom-24 z-40 mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-red-200 bg-white px-4 py-3 shadow-xl lg:bottom-6"
          role="alert"
        >
          <CircleAlert class="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
          <div class="min-w-0 flex-1 text-sm">
            <p class="font-semibold text-red-700">{{ selectionError }}</p>
            <p v-if="hitMax && canAddDate" class="text-charcoal-600 mt-0.5">
              Want to play longer? Tap <strong>“Add date”</strong> to keep this time, then select
              your next time slot.{{ courtDayLimitNote }} We limit each pick so bots or bulk
              bookings can't fill up the courts.
            </p>
          </div>
          <button
            type="button"
            class="text-charcoal-400 hover:text-charcoal-600 -mr-1 rounded p-0.5"
            aria-label="Dismiss"
            @click="selectionError = null"
          >
            <X class="size-4" aria-hidden="true" />
          </button>
        </div>
      </Transition>

      <!-- Phone: action bar always in view on the time step (like match-pickleball's footer) -->
      <div
        v-if="step === 'time'"
        class="border-charcoal-100 fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t bg-white/95 px-4 py-3 backdrop-blur lg:hidden"
      >
        <div class="min-w-0 flex-1">
          <p class="text-charcoal-400 text-xs">
            {{ ranges.length }} {{ ranges.length === 1 ? 'time' : 'times' }}
          </p>
          <p class="tabular text-charcoal-700 font-semibold">
            {{ ranges.length ? formatPHP(total) : '—' }}
          </p>
        </div>
        <AppButton v-if="canAddDate" variant="outline" @click="addAnotherDate">
          <template #icon-left><CalendarPlus class="size-4" aria-hidden="true" /></template>
          Add date
        </AppButton>
        <AppButton :disabled="!ranges.length" @click="toDetails">Continue</AppButton>
      </div>

      <!-- Done -->
      <div v-if="step === 'done' && result && first" class="mx-auto max-w-lg text-center">
        <CheckCircle2 class="text-brand-600 mx-auto size-14" aria-hidden="true" />
        <h1 class="text-charcoal-700 font-display mt-4 text-3xl uppercase">
          {{ first.status === 'confirmed' ? "You're booked!" : 'Booking received' }}
        </h1>
        <p class="text-charcoal-500 mt-2 text-sm">
          <template v-if="first.status === 'pending'">
            We'll confirm as soon as {{ tenant.name }} has checked your payment.
          </template>
          <template v-else-if="first.paymentStatus === 'unpaid'"
            >Pay at the front desk when you arrive.</template
          >
          <template v-else>See you on court. A confirmation was sent to your phone.</template>
        </p>
        <p
          v-if="proofWarning"
          class="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-left text-sm text-amber-900"
          role="alert"
        >
          {{ proofWarning }}
        </p>
        <div class="border-charcoal-100 mt-6 rounded-2xl border bg-white p-6 text-left">
          <p class="text-charcoal-400 text-xs">Booking reference</p>
          <p class="text-charcoal-700 font-mono text-2xl font-bold tracking-wider">
            {{ result.reference }}
          </p>
          <div class="mt-3 flex gap-2">
            <StatusBadge kind="booking" :value="first.status" />
            <StatusBadge kind="payment" :value="first.paymentStatus" />
          </div>
          <ul class="border-charcoal-100 mt-4 space-y-2.5 border-t pt-4 text-sm">
            <li v-for="b in result.bookings" :key="b.id" class="flex justify-between gap-3">
              <span>
                <span class="text-charcoal-700 block">
                  {{ formatLongDate(b.date) }}, {{ formatTimeRange(b.startHour, b.durationHours) }}
                </span>
                <span class="text-charcoal-400 block text-xs"
                  >{{ b.locationName }} · {{ b.courtName }}</span
                >
              </span>
              <span class="tabular text-charcoal-600 shrink-0">{{ formatPHP(b.amount) }}</span>
            </li>
          </ul>
          <div class="border-charcoal-100 mt-4 flex justify-between border-t pt-4 text-sm">
            <span class="text-charcoal-400">Total</span>
            <span class="tabular text-charcoal-700 font-semibold">{{
              formatPHP(result.total)
            }}</span>
          </div>
        </div>
        <div class="mt-6 flex flex-wrap justify-center gap-3">
          <AppButton variant="outline" :to="`/book/${tenant.slug}/lookup?ref=${result.reference}`"
            >Find my booking</AppButton
          >
          <AppButton @click="startOver">Book again</AppButton>
        </div>
      </div>
    </template>

    <AppModal
      :open="policiesOpen"
      :title="`${tenant.name}: rules & policies`"
      size="lg"
      @close="policiesOpen = false"
    >
      <PolicyList :rules="rules" :policies="tenant.policies" :heading-level="3" />
      <div class="mt-6 flex justify-end">
        <AppButton
          @click="
            () => {
              details.agree = true
              policiesOpen = false
            }
          "
        >
          I agree
        </AppButton>
      </div>
    </AppModal>
  </div>
</template>
