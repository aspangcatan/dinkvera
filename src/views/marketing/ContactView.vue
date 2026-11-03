<script setup lang="ts">
import { CircleCheck, Clock, Mail, MapPin, Phone } from '@lucide/vue'
import { computed, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import LandingButton from '@/components/marketing/LandingButton.vue'
import PickleballBall from '@/components/marketing/PickleballBall.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import { useQuery } from '@/composables/useQuery'
import { listPlans } from '@/services/subscriptionService'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { submitTrialRequest } from '@/services/trialRequestService'
import type { PlanId } from '@/types/billing'
import { formatPHP } from '@/utils/currency'

import { contactDetails } from './landingContent'

/**
 * Contact page and the "Start your free trial" destination. Trials aren't
 * self-serve: the request goes to Super Admin → Businesses, and Sideline
 * sets up the account.
 */
const route = useRoute()
const isCustom = route.query.topic === 'custom'
/** Set by the pricing page's "Start Free Trial" buttons (?plan=growth). */
const askedPlan = typeof route.query.plan === 'string' ? route.query.plan : ''

const form = reactive({
  /** '' = not sure yet. */
  plan: isCustom ? '' : askedPlan,
  businessName: '',
  contactName: '',
  email: '',
  phone: '',
  city: '',
  courts: '',
  // From the pricing page's Custom card.
  message: isCustom
    ? "I'm interested in a Custom build: our own booking website, domain and database."
    : '',
})
// Plans a trial can start on (not hidden, not "coming soon").
const plans = useQuery(listPlans)
const trialPlans = computed(() =>
  (plans.data.value ?? []).filter((p) => p.isPublic && !p.comingSoon),
)
const planOptions = computed(() => [
  { value: '', label: 'Not sure yet' },
  ...trialPlans.value.map((p) => ({
    value: p.id,
    label: `${p.name} · ${formatPHP(p.monthlyPrice)}/month after the trial`,
  })),
])
// A link to a plan that isn't on offer falls back to "Not sure yet".
watch(trialPlans, (list) => {
  if (form.plan && list.length && !list.some((p) => p.id === form.plan)) form.plan = ''
})

const errors = reactive<Record<string, string>>({})
// Clear a field's error as soon as it's filled in.
watch(form, () => {
  for (const key of Object.keys(errors) as (keyof typeof form)[]) {
    if (form[key].trim()) delete errors[key]
  }
})
const sending = ref(false)
const sent = ref(false)
const failure = ref('')

const nextSteps = [
  'We review your request and reach out by email or phone.',
  'We set up your facility account and start your 7-day free trial.',
  'You add your courts and share your booking page with players.',
]

async function submit(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  failure.value = ''
  if (!form.businessName.trim()) errors.businessName = 'Enter your facility or business name'
  if (!form.contactName.trim()) errors.contactName = 'Enter your name'
  if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) errors.email = 'Enter a valid email address'
  const courts = form.courts.trim() === '' ? null : Number(form.courts)
  if (courts !== null && (!Number.isInteger(courts) || courts < 1 || courts > 500)) {
    errors.courts = 'Enter a number from 1 to 500'
  }
  if (Object.keys(errors).length) return
  sending.value = true
  try {
    const { plan, ...details } = form
    await submitTrialRequest({ ...details, courts, planId: (plan || null) as PlanId | null })
    sent.value = true
  } catch (e) {
    failure.value = e instanceof Error ? e.message : 'Could not send your request. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div>
    <section class="bg-court relative isolate overflow-hidden text-white">
      <div
        class="bg-ball/10 absolute -top-40 right-[-10%] -z-10 size-[36rem] rounded-full blur-[120px]"
        aria-hidden="true"
      />
      <PickleballBall class="absolute top-10 right-8 hidden size-20 opacity-90 md:block" />
      <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <p class="text-ball text-xs font-semibold tracking-[0.16em] uppercase">Contact</p>
        <h1
          class="mt-3 max-w-2xl font-sans text-4xl leading-[1.05] font-extrabold tracking-tight sm:text-5xl"
        >
          Start your <span class="text-ball">free trial.</span>
        </h1>
        <p class="mt-5 max-w-xl text-lg text-white/70">
          Tell us about your facility. Our team will set up your account and your 7-day free trial,
          and help you get your courts online.
        </p>
      </div>
    </section>

    <section
      class="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.3fr_1fr] lg:gap-16 lg:px-8 lg:py-20"
    >
      <!-- Request form -->
      <div
        class="border-court/10 rounded-3xl border bg-white p-6 shadow-[0_24px_60px_-30px_rgba(18,62,53,0.35)] sm:p-8"
      >
        <div v-if="sent" class="py-10 text-center" role="status">
          <span
            class="bg-ball/40 text-court mx-auto flex size-16 items-center justify-center rounded-full"
          >
            <CircleCheck class="size-8" aria-hidden="true" />
          </span>
          <h2 class="text-court mt-6 font-sans text-2xl font-extrabold tracking-tight">
            Request sent — thank you!
          </h2>
          <p class="text-ink/65 mx-auto mt-3 max-w-sm">
            We'll contact you at <strong class="text-court">{{ form.email }}</strong> to set up your
            free trial.
          </p>
          <div class="mt-8">
            <LandingButton to="/" variant="outline">Back to home</LandingButton>
          </div>
        </div>

        <form v-else class="grid gap-5 sm:grid-cols-2" novalidate @submit.prevent="submit">
          <div class="sm:col-span-2">
            <h2 class="text-court font-sans text-2xl font-extrabold tracking-tight">
              Request your free trial
            </h2>
            <p class="text-ink/60 mt-1 text-sm">Fields marked * are required.</p>
          </div>
          <div v-if="!isCustom" class="sm:col-span-2">
            <AppSelect
              v-model="form.plan"
              label="Plan you'd like to try"
              :options="planOptions"
              hint="You can change plans any time. Nothing is charged during the trial."
            />
          </div>
          <div class="sm:col-span-2">
            <AppInput
              v-model="form.businessName"
              label="Facility or business name *"
              autocomplete="organization"
              :error="errors.businessName"
            />
          </div>
          <AppInput
            v-model="form.contactName"
            label="Your name *"
            autocomplete="name"
            :error="errors.contactName"
          />
          <AppInput
            v-model="form.email"
            type="email"
            label="Email *"
            autocomplete="email"
            placeholder="you@business.ph"
            :error="errors.email"
          />
          <AppInput
            v-model="form.phone"
            type="tel"
            label="Mobile number"
            autocomplete="tel"
            placeholder="0917 123 4567"
          />
          <AppInput
            v-model="form.city"
            label="City"
            autocomplete="address-level2"
            placeholder="e.g. Cebu City"
          />
          <AppInput
            v-model="form.courts"
            type="text"
            label="Number of courts"
            placeholder="e.g. 4"
            :error="errors.courts"
          />
          <div class="sm:col-span-2">
            <AppTextarea
              v-model="form.message"
              label="Anything we should know?"
              :rows="3"
              placeholder="e.g. We're opening next month and have 2 locations."
            />
          </div>
          <p v-if="failure" class="text-sm text-red-600 sm:col-span-2" role="alert">
            {{ failure }}
          </p>
          <div class="sm:col-span-2">
            <AppButton type="submit" variant="ball" size="lg" full-width :loading="sending">
              Request my free trial
            </AppButton>
            <p class="text-ink/50 mt-3 text-center text-xs">
              By sending this you agree to our
              <RouterLink to="/privacy" class="underline">Privacy Policy</RouterLink>.
            </p>
          </div>
        </form>
      </div>

      <!-- What happens next + contact details -->
      <aside class="space-y-6">
        <div class="border-court/10 rounded-3xl border bg-white p-6 sm:p-8">
          <h2 class="text-court font-sans text-lg font-bold tracking-tight">What happens next</h2>
          <ol class="mt-5 space-y-4">
            <li v-for="(step, i) in nextSteps" :key="step" class="flex gap-3">
              <span
                class="font-display bg-court text-ball flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                >{{ i + 1 }}</span
              >
              <p class="text-ink/75 pt-0.5 text-sm leading-relaxed">{{ step }}</p>
            </li>
          </ol>
        </div>

        <div class="bg-court rounded-3xl p-6 text-white sm:p-8">
          <h2 class="font-sans text-lg font-bold tracking-tight">Talk to us</h2>
          <ul class="mt-5 space-y-4 text-sm">
            <li class="flex items-start gap-3">
              <Mail class="text-ball mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <a :href="`mailto:${contactDetails.email}`" class="hover:text-ball">{{
                contactDetails.email
              }}</a>
            </li>
            <li class="flex items-start gap-3">
              <Phone class="text-ball mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <a :href="`tel:${contactDetails.phone.replace(/\s/g, '')}`" class="hover:text-ball">{{
                contactDetails.phone
              }}</a>
            </li>
            <li class="flex items-start gap-3">
              <Clock class="text-ball mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span class="text-white/80">{{ contactDetails.hours }}</span>
            </li>
            <li class="flex items-start gap-3">
              <MapPin class="text-ball mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span class="text-white/80">{{ contactDetails.location }}</span>
            </li>
          </ul>
          <p class="mt-6 text-sm text-white/60">
            Questions first?
            <RouterLink to="/#faq" class="hover:text-ball font-semibold text-white underline"
              >Read the FAQ</RouterLink
            >
          </p>
        </div>
      </aside>
    </section>
  </div>
</template>
