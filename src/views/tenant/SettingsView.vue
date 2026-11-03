<script setup lang="ts">
import { CreditCard, ExternalLink, TriangleAlert } from '@lucide/vue'
import { computed, reactive, ref, toRaw } from 'vue'

import TenantMark from '@/components/layout/TenantMark.vue'
import HeroBannerCard from '@/components/tenant/HeroBannerCard.vue'
import PaymentAccountCard from '@/components/tenant/PaymentAccountCard.vue'
import PoliciesEditor from '@/components/tenant/PoliciesEditor.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import { useQuery } from '@/composables/useQuery'
import { listPaymentAccounts } from '@/services/paymentAccountService'
import { updateTenant } from '@/services/tenantService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { AccountMethod, BookingRules, PaymentMethod, Tenant } from '@/types/tenant'
import { contrastRatio, isHexColor } from '@/utils/color'
import { paymentMethodLabels } from '@/utils/labels'
import { bookingBasics, cleanPolicies } from '@/utils/policies'

const store = useTenantStore()
const toast = useToastStore()
const t = store.tenant!

type Tab = 'profile' | 'rules' | 'policies' | 'branding' | 'payments'
const tab = ref<Tab>('profile')
const saving = ref(false)

// Each tab edits a copy; nothing changes until "Save".
const profile = reactive({
  name: t.name,
  legalName: t.legalName,
  phone: t.phone,
  city: t.city,
  ownerEmail: t.ownerEmail,
  about: t.about,
})
const rules = reactive<BookingRules>(structuredClone(toRaw(t.bookingRules)))
const ruleText = reactive({
  min: String(rules.minDurationMinutes),
  max: String(rules.maxDurationMinutes),
  advance: String(rules.advanceBookingDays),
  cancel: String(rules.cancellationWindowHours),
  hold: String(rules.holdMinutes),
  /** '' = no limit. */
  courtDay: rules.maxCourtHoursPerDay === null ? '' : String(rules.maxCourtHoursPerDay),
  unpaid: String(rules.maxUnpaidBookings),
})
const branding = reactive({ ...t.branding, heroImages: [...t.branding.heroImages] })
const policies = ref(t.policies.map((p) => ({ ...p })))

/** First carousel photo, for the preview (when the carousel style is chosen). */
const previewPhoto = computed(() =>
  branding.heroStyle === 'carousel' ? (branding.heroImages[0]?.url ?? null) : null,
)

/** Photos are saved right away; keep the form and the rest of the app in sync. */
function onHeroUpdated(updated: Tenant): void {
  branding.heroImages = [...updated.branding.heroImages]
  store.setTenant({
    ...updated,
    branding: { ...updated.branding, heroStyle: store.tenant!.branding.heroStyle },
  })
}

const contrast = computed(() =>
  isHexColor(branding.primary) ? contrastRatio(branding.primary, '#ffffff') : 0,
)
const lowContrast = computed(() => contrast.value < 4.5)

const ALL_METHODS: PaymentMethod[] = ['gcash', 'maya', 'card', 'bank_transfer', 'cash']
const cardsAllowed = computed(() => store.plan?.id === 'pro')

const ACCOUNT_METHODS: AccountMethod[] = ['gcash', 'maya', 'bank_transfer']
const accounts = useQuery(() => listPaymentAccounts(t.id))

function methodDescription(m: PaymentMethod): string {
  if (m === 'card') {
    return cardsAllowed.value
      ? 'Needs a payment provider (e.g. PayMongo), set up by Sideline'
      : 'Coming soon'
  }
  if (m === 'cash') return 'Pay at the front desk'
  return 'Customers pay to your account; approve it under Payments'
}
function toggleMethod(m: PaymentMethod): void {
  rules.paymentMethods = rules.paymentMethods.includes(m)
    ? rules.paymentMethods.filter((x) => x !== m)
    : [...rules.paymentMethods, m]
}

const durationOptions = [30, 60, 90, 120, 180, 240].map((m) => ({
  value: String(m),
  label: m < 60 ? `${m} min` : `${m / 60} hour${m > 60 ? 's' : ''}`,
}))

/** At least as long as one booking can be (the database checks the same). */
const courtDayOptions = computed(() => [
  { value: '', label: 'No limit' },
  ...Array.from({ length: 12 }, (_, i) => i + 1)
    .filter((h) => h * 60 >= Number(ruleText.max))
    .map((h) => ({ value: String(h), label: `${h} hour${h === 1 ? '' : 's'}` })),
])

async function save(): Promise<void> {
  if (tab.value === 'branding' && (!isHexColor(branding.primary) || !isHexColor(branding.accent))) {
    toast.show('Colors must be hex values like #0f766e', 'error')
    return
  }
  if (tab.value === 'rules' && Number(ruleText.min) > Number(ruleText.max)) {
    toast.show('Minimum length must be shorter than the maximum', 'error')
    return
  }
  if (
    tab.value === 'rules' &&
    ruleText.courtDay &&
    Number(ruleText.courtDay) * 60 < Number(ruleText.max)
  ) {
    toast.show('Hours per court per day must be at least the longest booking', 'error')
    return
  }
  const unpaid = Number(ruleText.unpaid)
  if (tab.value === 'rules' && !(Number.isInteger(unpaid) && unpaid >= 1 && unpaid <= 10)) {
    toast.show('Unpaid bookings allowed must be between 1 and 10', 'error')
    return
  }
  if (tab.value === 'payments' && !rules.paymentMethods.length) {
    toast.show('Keep at least one payment method', 'error')
    return
  }
  const cleaned = cleanPolicies(policies.value)
  if (tab.value === 'policies' && cleaned.error) {
    toast.show(cleaned.error, 'error')
    return
  }
  saving.value = true
  try {
    const patch =
      tab.value === 'profile'
        ? { ...profile }
        : tab.value === 'policies'
          ? { policies: cleaned.policies }
          : tab.value === 'branding'
            ? {
                // Photos are saved on upload; the rest of the brand saves here.
                branding: {
                  primary: branding.primary,
                  accent: branding.accent,
                  tagline: branding.tagline,
                  heroStyle: branding.heroStyle,
                  monogram: branding.monogram.toUpperCase().slice(0, 2),
                },
              }
            : {
                bookingRules: {
                  ...rules,
                  minDurationMinutes: Number(ruleText.min),
                  maxDurationMinutes: Number(ruleText.max),
                  advanceBookingDays: Number(ruleText.advance),
                  cancellationWindowHours: Number(ruleText.cancel),
                  holdMinutes: Number(ruleText.hold),
                  maxCourtHoursPerDay: ruleText.courtDay ? Number(ruleText.courtDay) : null,
                  maxUnpaidBookings: unpaid,
                },
              }
    const updated = await updateTenant(t.id, patch)
    store.setTenant(updated)
    if (tab.value === 'policies') policies.value = updated.policies.map((p) => ({ ...p }))
    toast.show('Settings saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Settings"
      description="Your business details, booking rules, policies and how your booking site looks."
    >
      <template #actions>
        <AppButton :loading="saving" @click="save">Save changes</AppButton>
      </template>
    </PageHeader>

    <AppTabs
      v-model="tab"
      class="mb-6"
      label="Settings sections"
      :tabs="[
        { value: 'profile', label: 'Business profile' },
        { value: 'rules', label: 'Booking rules' },
        { value: 'policies', label: 'Policies' },
        { value: 'branding', label: 'Branding' },
        { value: 'payments', label: 'Payment methods' },
      ]"
    />

    <!-- Profile -->
    <div v-if="tab === 'profile'" class="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <AppCard title="Business profile" description="Shown on your booking site and receipts.">
        <div class="grid gap-4 sm:grid-cols-2">
          <AppInput v-model="profile.name" label="Business name" />
          <AppInput v-model="profile.legalName" label="Registered name" />
          <AppInput v-model="profile.phone" type="tel" label="Contact number" />
          <AppInput v-model="profile.ownerEmail" type="email" label="Contact email" />
          <AppInput v-model="profile.city" label="City" />
          <AppInput
            :model-value="`/book/${t.slug}`"
            label="Booking site address"
            disabled
            hint="Your own domain comes with a Custom build — ask Sideline"
          />
          <div class="sm:col-span-2">
            <AppTextarea
              v-model="profile.about"
              label="About"
              :rows="3"
              hint="One or two sentences for your home page."
            />
          </div>
        </div>
      </AppCard>
    </div>

    <!-- Booking rules -->
    <div v-else-if="tab === 'rules'" class="grid gap-6 lg:grid-cols-2">
      <AppCard title="Booking length & window">
        <div class="grid gap-4 sm:grid-cols-2">
          <AppSelect v-model="ruleText.min" label="Shortest booking" :options="durationOptions" />
          <AppSelect v-model="ruleText.max" label="Longest booking" :options="durationOptions" />
          <AppInput
            v-model="ruleText.advance"
            type="number"
            label="Book up to (days ahead)"
            min="1"
          />
          <AppInput
            v-model="ruleText.hold"
            type="number"
            label="Hold unpaid bookings (minutes)"
            min="5"
          />
        </div>
      </AppCard>
      <AppCard title="Limits per player">
        <div class="grid gap-4 sm:grid-cols-2">
          <AppSelect
            v-model="ruleText.courtDay"
            label="Hours per court, per day"
            :options="courtDayOptions"
            hint="Total one player can book on the same court in a day, even across several picks."
          />
          <AppInput
            v-model="ruleText.unpaid"
            type="number"
            label="Unpaid bookings allowed"
            min="1"
            max="10"
            hint="Upcoming unpaid bookings one player can hold before they must pay or cancel."
          />
        </div>
        <p class="text-charcoal-400 mt-4 text-xs">
          Players are matched by mobile number. These limits apply to online bookings only, so
          bookings you add yourself are never blocked.
        </p>
      </AppCard>
      <AppCard title="Cancellations & payment">
        <div class="space-y-4">
          <AppInput
            v-model="ruleText.cancel"
            type="number"
            label="Free cancellation until (hours before)"
            min="0"
          />
          <AppToggle
            v-model="rules.requirePrepayment"
            label="Require payment to confirm online bookings"
            description="Off = players can book now and pay at the venue."
          />
          <AppToggle
            v-model="rules.allowWalkIns"
            label="Accept walk-ins at the front desk"
            description="Off = staff can't add walk-in bookings (phone and online still work)."
          />
        </div>
      </AppCard>
      <AppCard title="Court rates">
        <p class="text-charcoal-500 text-sm">
          Each court has its own day rate, night rate and the time night starts. Set them under
          <RouterLink
            :to="`/manage/${t.slug}/venues`"
            class="text-brand-700 font-semibold underline"
            >Locations &amp; courts</RouterLink
          >.
        </p>
      </AppCard>
    </div>

    <!-- Rules & policies -->
    <div v-else-if="tab === 'policies'" class="grid gap-6 lg:grid-cols-[2fr_1fr]">
      <PoliciesEditor v-model="policies" />
      <div class="space-y-6">
        <AppCard
          title="Booking basics"
          description="Shown with your policies, from your booking rules."
        >
          <ul class="text-charcoal-600 list-disc space-y-1.5 pl-5 text-sm">
            <li v-for="line in bookingBasics(store.tenant!.bookingRules)" :key="line">
              {{ line }}
            </li>
          </ul>
          <button
            type="button"
            class="text-brand-700 mt-3 text-sm font-semibold underline"
            @click="tab = 'rules'"
          >
            Change booking rules
          </button>
        </AppCard>
        <AppCard title="Where customers see them">
          <p class="text-charcoal-500 text-sm">
            In the <strong>Rules &amp; policies</strong> section of your booking site&rsquo;s home
            page (below your locations), and at checkout, where customers must tick “I agree” before
            they can pay.
          </p>
          <a
            :href="`/book/${t.slug}#policies`"
            target="_blank"
            rel="noopener"
            class="text-brand-700 mt-3 inline-flex items-center gap-1 text-sm font-semibold underline"
          >
            View on your booking site <ExternalLink class="size-3.5" aria-hidden="true" />
          </a>
        </AppCard>
      </div>
    </div>

    <!-- Branding -->
    <div v-else-if="tab === 'branding'" class="grid gap-6 lg:grid-cols-2">
      <AppCard title="Brand" description="Used on your booking site and in this dashboard.">
        <div class="grid gap-4 sm:grid-cols-2">
          <label class="flex flex-col gap-1.5">
            <span class="text-charcoal-600 text-sm font-medium">Primary color</span>
            <span class="flex items-center gap-2">
              <input
                v-model="branding.primary"
                type="color"
                class="border-charcoal-200 h-10 w-12 rounded-lg border p-1"
              />
              <input
                v-model="branding.primary"
                class="border-charcoal-200 h-10 w-full rounded-lg border px-3 font-mono text-sm"
                aria-label="Primary color hex"
              />
            </span>
          </label>
          <label class="flex flex-col gap-1.5">
            <span class="text-charcoal-600 text-sm font-medium">Accent color</span>
            <span class="flex items-center gap-2">
              <input
                v-model="branding.accent"
                type="color"
                class="border-charcoal-200 h-10 w-12 rounded-lg border p-1"
              />
              <input
                v-model="branding.accent"
                class="border-charcoal-200 h-10 w-full rounded-lg border px-3 font-mono text-sm"
                aria-label="Accent color hex"
              />
            </span>
          </label>
          <AppInput
            v-model="branding.monogram"
            label="Monogram"
            hint="Two letters, shown in the logo tile"
          />
          <AppInput v-model="branding.tagline" label="Tagline" />
        </div>
        <p
          v-if="lowContrast"
          class="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
          role="status"
        >
          <TriangleAlert class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          White text on this color has a contrast of {{ contrast.toFixed(1) }}:1. Use a darker shade
          (4.5:1 or more) so buttons stay readable.
        </p>
      </AppCard>

      <HeroBannerCard
        v-model:hero-style="branding.heroStyle"
        class="lg:order-last lg:col-span-2"
        :tenant-id="t.id"
        :images="branding.heroImages"
        @updated="onHeroUpdated"
      />

      <AppCard title="Preview">
        <div class="border-charcoal-100 overflow-hidden rounded-xl border">
          <div class="flex items-center gap-2 border-b border-black/5 bg-white px-4 py-3">
            <TenantMark :branding="branding" size="sm" />
            <span class="text-charcoal-700 text-sm font-semibold">{{ profile.name }}</span>
            <span
              class="ml-auto rounded-md px-3 py-1.5 text-xs font-semibold text-white"
              :style="{ background: branding.primary }"
            >
              Book a court
            </span>
          </div>
          <div
            class="relative isolate overflow-hidden px-5 py-8 text-white"
            :style="{ background: branding.primary }"
          >
            <template v-if="previewPhoto">
              <img
                :src="previewPhoto"
                alt=""
                class="absolute inset-0 -z-20 h-full w-full object-cover"
              />
              <div
                class="absolute inset-0 -z-10"
                :style="{
                  background: `linear-gradient(to right, color-mix(in oklab, ${branding.primary} 42%, black) 0%, color-mix(in oklab, ${branding.primary} 42%, black / 0.6) 55%, rgb(0 0 0 / 0.2) 100%)`,
                }"
              />
            </template>
            <p class="text-xs font-semibold tracking-widest uppercase opacity-80">
              {{ store.activeLocations.length }} locations
            </p>
            <p class="font-display mt-1 text-2xl uppercase">
              {{ branding.tagline || profile.name }}
            </p>
            <span
              class="mt-4 inline-block rounded-md px-3 py-1.5 text-xs font-semibold"
              :style="{
                background: branding.accent,
                color: contrastRatio(branding.accent, '#ffffff') > 3 ? '#fff' : '#111',
              }"
            >
              See available times
            </span>
          </div>
        </div>
      </AppCard>
    </div>

    <!-- Payments -->
    <div v-else class="grid items-start gap-6 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
      <AppCard
        title="Accepted payment methods"
        description="What players can choose at checkout. Click Save changes after switching."
      >
        <ul class="divide-charcoal-100 divide-y">
          <li v-for="m in ALL_METHODS" :key="m" class="py-3 first:pt-0 last:pb-0">
            <AppToggle
              :model-value="rules.paymentMethods.includes(m)"
              :label="paymentMethodLabels[m]"
              :disabled="m === 'card' && !cardsAllowed"
              :description="methodDescription(m)"
              @update:model-value="toggleMethod(m)"
            />
          </li>
        </ul>
      </AppCard>

      <AppCard
        title="Where customers send payment"
        description="Shown on your booking site when a player picks the method. Upload your QR code so they can scan it."
      >
        <LoadingState v-if="accounts.loading.value && !accounts.data.value" :rows="5" />
        <div v-else class="space-y-4">
          <PaymentAccountCard
            v-for="m in ACCOUNT_METHODS"
            :key="m"
            :tenant-id="t.id"
            :method="m"
            :account="accounts.data.value?.find((a) => a.method === m) ?? null"
            :enabled="rules.paymentMethods.includes(m)"
            @saved="accounts.refresh()"
          />
          <p class="text-charcoal-400 flex items-start gap-2 text-xs">
            <CreditCard class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Card payments don't need details here: they go through a payment provider (such as
            PayMongo) set up by Sideline. Card numbers are never stored in CourtDesk.
          </p>
        </div>
      </AppCard>
    </div>
  </div>
</template>
