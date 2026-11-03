<script setup lang="ts">
import {
  ArrowRight,
  CalendarDays,
  Clock,
  CreditCard,
  MapPin,
  Navigation,
  ShieldCheck,
} from '@lucide/vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import HeroCarousel from '@/components/storefront/HeroCarousel.vue'
import PolicyList from '@/components/storefront/PolicyList.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LocationMap from '@/components/venue/LocationMap.vue'
import { useQuery } from '@/composables/useQuery'
import { directionsUrl, locationPin } from '@/utils/maps'
import { listCourts } from '@/services/venueService'
import { useTenantStore } from '@/stores/tenant'
import { formatPHP } from '@/utils/currency'
import { addDays, formatOpeningHours, todayISO } from '@/utils/dates'
import { paymentMethodLabels } from '@/utils/labels'

const store = useTenantStore()
const router = useRouter()
const t = computed(() => store.tenant!)
const courts = useQuery(() => listCourts(t.value.id))

const activeCourts = computed(() => (courts.data.value ?? []).filter((c) => c.status === 'active'))
const fromPrice = computed(() => Math.min(...activeCourts.value.map((c) => c.dayRate)))
const courtsAt = (locationId: string) =>
  activeCourts.value.filter((c) => c.locationId === locationId)
const offline = computed(() => t.value.status === 'suspended' || t.value.status === 'cancelled')

/** Photo carousel when chosen in Settings → Branding and at least one photo is uploaded. */
const showCarousel = computed(
  () => t.value.branding.heroStyle === 'carousel' && t.value.branding.heroImages.length > 0,
)

// Quick booking bar → the reserve page with the choices pre-filled.
const quick = ref({ location: store.activeLocations[0]?.id ?? '', date: todayISO() })
function startBooking(): void {
  void router.push({ path: `/book/${t.value.slug}/reserve`, query: quick.value })
}

const rules = computed(() => t.value.bookingRules)
const steps = [
  {
    icon: CalendarDays,
    title: 'Pick a time',
    body: 'See every open court for the day you want, live.',
  },
  {
    icon: CreditCard,
    title: 'Pay your way',
    body: 'GCash, Maya, cards or bank transfer — whatever this venue takes.',
  },
  {
    icon: ShieldCheck,
    title: 'Show up and play',
    body: 'Your booking reference is all you need at the front desk.',
  },
]
</script>

<template>
  <div>
    <!-- Hero -->
    <component
      :is="showCarousel ? HeroCarousel : 'section'"
      v-bind="showCarousel ? { images: t.branding.heroImages, businessName: t.name } : {}"
      class="relative overflow-hidden text-white"
      :class="showCarousel ? 'bg-brand-900' : 'bg-brand-800'"
    >
      <div
        v-if="!showCarousel"
        class="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full opacity-20 blur-3xl"
        :style="{ background: t.branding.accent }"
        aria-hidden="true"
      />
      <div
        class="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:py-24"
      >
        <div>
          <p class="text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
            {{ store.activeLocations.length }}
            {{ store.activeLocations.length === 1 ? 'location' : 'locations' }} ·
            {{ activeCourts.length }} {{ activeCourts.length === 1 ? 'court' : 'courts' }} ·
            {{ t.city }}
          </p>
          <h1 class="font-display mt-4 text-4xl leading-[1.05] uppercase sm:text-5xl">
            {{ t.branding.tagline || t.name }}
          </h1>
          <p class="mt-4 max-w-lg text-white/75">{{ t.about }}</p>
          <p v-if="activeCourts.length" class="mt-6 text-sm text-white/80">
            Courts from <span class="font-semibold text-white">{{ formatPHP(fromPrice) }}</span> /
            hour
          </p>
        </div>

        <!-- Quick booking -->
        <form
          v-if="!offline"
          class="text-charcoal-700 self-end rounded-2xl bg-white p-5 shadow-2xl"
          @submit.prevent="startBooking"
        >
          <p class="font-semibold">Book a court</p>
          <label class="mt-4 block">
            <span class="text-charcoal-500 text-xs font-medium">Location</span>
            <select
              v-model="quick.location"
              class="border-charcoal-200 mt-1 h-11 w-full rounded-lg border bg-white px-3 text-sm"
            >
              <option v-for="l in store.activeLocations" :key="l.id" :value="l.id">
                {{ l.name }}
              </option>
            </select>
          </label>
          <label class="mt-3 block">
            <span class="text-charcoal-500 text-xs font-medium">Date</span>
            <input
              v-model="quick.date"
              type="date"
              :min="todayISO()"
              :max="addDays(todayISO(), rules.advanceBookingDays)"
              class="border-charcoal-200 mt-1 h-11 w-full rounded-lg border px-3 text-sm"
            />
          </label>
          <AppButton type="submit" size="lg" full-width class="mt-4">
            See open times
            <template #icon-right><ArrowRight class="size-4" aria-hidden="true" /></template>
          </AppButton>
        </form>
      </div>
    </component>

    <!-- Locations -->
    <section class="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <h2 class="text-charcoal-700 font-display text-3xl uppercase">Our locations</h2>
      <div class="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <article
          v-for="loc in store.activeLocations"
          :key="loc.id"
          class="border-charcoal-100 flex flex-col rounded-2xl border bg-white p-5"
        >
          <!-- Map when the owner set a pin; otherwise the court-line motif -->
          <div v-if="locationPin(loc)" class="relative isolate mb-4">
            <LocationMap
              :pin="locationPin(loc)"
              :label="`Map of ${loc.name}`"
              class="h-40 rounded-xl"
            />
            <span
              class="bg-brand-600 absolute bottom-3 left-3 z-[800] rounded-md px-2 py-0.5 text-xs font-semibold text-white"
            >
              {{ courtsAt(loc.id).length }} {{ courtsAt(loc.id).length === 1 ? 'court' : 'courts' }}
            </span>
          </div>
          <!-- Court-line motif in the brand color -->
          <div v-else class="bg-brand-50 relative mb-4 h-28 overflow-hidden rounded-xl">
            <svg
              viewBox="0 0 200 100"
              class="text-brand-300 absolute inset-0 h-full w-full"
              preserveAspectRatio="none"
            >
              <rect
                x="20"
                y="15"
                width="160"
                height="70"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              />
              <line x1="100" y1="15" x2="100" y2="85" stroke="currentColor" stroke-width="2" />
              <line x1="75" y1="15" x2="75" y2="85" stroke="currentColor" stroke-width="1.5" />
              <line x1="125" y1="15" x2="125" y2="85" stroke="currentColor" stroke-width="1.5" />
            </svg>

            <span
              class="bg-brand-600 absolute bottom-3 left-3 rounded-md px-2 py-0.5 text-xs font-semibold text-white"
            >
              {{ courtsAt(loc.id).length }} {{ courtsAt(loc.id).length === 1 ? 'court' : 'courts' }}
            </span>
          </div>
          <h3 class="text-charcoal-700 font-sans text-lg font-semibold">{{ loc.name }}</h3>
          <p class="text-charcoal-400 mt-1 flex gap-1.5 text-sm">
            <MapPin class="mt-0.5 size-4 shrink-0" aria-hidden="true" />{{ loc.address }},
            {{ loc.city }}
          </p>
          <a
            :href="directionsUrl(loc)"
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand-700 mt-1 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
          >
            <Navigation class="size-4" aria-hidden="true" />Get directions
          </a>
          <p class="text-charcoal-400 mt-1 flex items-center gap-1.5 text-sm">
            <Clock class="size-4" aria-hidden="true" />{{
              formatOpeningHours(loc.openHour, loc.closeHour)
            }}
          </p>
          <div class="mt-3 flex flex-wrap gap-1">
            <AppBadge v-for="a in loc.amenities" :key="a" :dot="false">{{ a }}</AppBadge>
          </div>
          <div class="mt-auto pt-5">
            <AppButton
              v-if="!offline"
              variant="outline"
              full-width
              :to="{ path: `/book/${t.slug}/reserve`, query: { location: loc.id } }"
              >Book at {{ loc.name }}</AppButton
            >
          </div>
        </article>
      </div>
    </section>

    <!-- Rules & policies -->
    <section id="policies" class="mx-auto max-w-6xl scroll-mt-20 px-4 pb-14 sm:px-6">
      <h2 class="text-charcoal-700 font-display text-3xl uppercase">Rules & policies</h2>
      <p class="text-charcoal-400 mt-2 text-sm">
        Please read these before you book. You'll be asked to agree to them at checkout.
      </p>
      <dl class="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div class="border-charcoal-100 rounded-xl border bg-white p-4">
          <dt class="text-charcoal-400 text-xs">Booking length</dt>
          <dd class="text-charcoal-700 mt-1 text-sm font-medium">
            {{ rules.minDurationMinutes / 60 }}–{{ rules.maxDurationMinutes / 60 }} hours
          </dd>
        </div>
        <div class="border-charcoal-100 rounded-xl border bg-white p-4">
          <dt class="text-charcoal-400 text-xs">Book ahead</dt>
          <dd class="text-charcoal-700 mt-1 text-sm font-medium">
            Up to {{ rules.advanceBookingDays }} days
          </dd>
        </div>
        <div class="border-charcoal-100 rounded-xl border bg-white p-4">
          <dt class="text-charcoal-400 text-xs">Cancellation</dt>
          <dd class="text-charcoal-700 mt-1 text-sm font-medium">
            Free until {{ rules.cancellationWindowHours }}h before
          </dd>
        </div>
        <div class="border-charcoal-100 rounded-xl border bg-white p-4">
          <dt class="text-charcoal-400 text-xs">Payment</dt>
          <dd class="text-charcoal-700 mt-1 text-sm font-medium">
            {{ rules.paymentMethods.map((m) => paymentMethodLabels[m]).join(', ') }}
          </dd>
        </div>
      </dl>
      <PolicyList
        v-if="t.policies.length"
        class="mt-4"
        :rules="rules"
        :policies="t.policies"
        :heading-level="3"
        :show-basics="false"
        layout="grid"
      />
    </section>

    <!-- How it works -->
    <section class="border-charcoal-100 border-y bg-white">
      <div class="mx-auto grid max-w-6xl gap-8 px-4 py-14 sm:grid-cols-3 sm:px-6">
        <div v-for="(s, i) in steps" :key="s.title">
          <span
            class="bg-brand-50 text-brand-700 flex size-10 items-center justify-center rounded-xl"
          >
            <component :is="s.icon" class="size-5" aria-hidden="true" />
          </span>
          <p class="text-charcoal-700 mt-3 font-semibold">{{ i + 1 }}. {{ s.title }}</p>
          <p class="text-charcoal-400 mt-1 text-sm">{{ s.body }}</p>
        </div>
      </div>
    </section>
  </div>
</template>
