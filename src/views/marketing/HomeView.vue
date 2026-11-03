<script setup lang="ts">
import {
  ArrowDown,
  Building2,
  Check,
  ChevronDown,
  CircleCheck,
  Globe,
  Smartphone,
  Wallet,
  X,
} from '@lucide/vue'
import { computed, ref } from 'vue'

import appCalendar from '@/assets/marketing/app-calendar.webp'
import appDashboard from '@/assets/marketing/app-dashboard.webp'
import appReserveMobile from '@/assets/marketing/app-reserve-mobile.webp'
import courtsNight from '@/assets/marketing/courts-night.webp'
import players from '@/assets/marketing/players.webp'
import LandingButton from '@/components/marketing/LandingButton.vue'
import PickleballBall from '@/components/marketing/PickleballBall.vue'
import ProductShot from '@/components/marketing/ProductShot.vue'
import SectionIntro from '@/components/marketing/SectionIntro.vue'
import PlanCard from '@/components/platform/PlanCard.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { useQuery } from '@/composables/useQuery'
import { useReveal } from '@/composables/useReveal'
import { useSectionLink } from '@/composables/useSectionLink'
import { listPlans } from '@/services/subscriptionService'
import type { BillingCycle } from '@/types/billing'

import {
  faqs,
  features,
  heroPoints,
  links,
  problems,
  reasons,
  solutions,
  steps,
} from './landingContent'

const root = ref<HTMLElement | null>(null)
useReveal(root)
const { goToSection } = useSectionLink()

const { data: plans, loading: plansLoading } = useQuery(listPlans)
const publicPlans = computed(() => (plans.value ?? []).filter((p) => p.isPublic))
const cycle = ref<BillingCycle>('monthly')

const facts = [
  { icon: Globe, label: 'Your own booking page' },
  { icon: Smartphone, label: 'No app or player account needed' },
  { icon: Wallet, label: 'GCash, Maya & bank QR payments' },
  { icon: Building2, label: 'One location or many' },
]

const customItems = [
  'Your own booking website and domain',
  'Your own database and hosting',
  'Features built around how you run',
]

/** Staggers the scroll-in reveal of items in a row. */
const delay = (i: number) => ({ '--reveal-delay': `${i * 70}ms` })
</script>

<template>
  <div ref="root">
    <!-- Hero -->
    <section id="top" class="bg-court relative isolate overflow-hidden text-white">
      <img
        :src="courtsNight"
        alt=""
        width="1600"
        height="1986"
        fetchpriority="high"
        decoding="async"
        class="absolute inset-0 -z-20 h-full w-full object-cover object-[50%_40%] opacity-60"
      />
      <div
        class="from-court via-court/90 to-court/55 absolute inset-0 -z-10 bg-gradient-to-b lg:bg-gradient-to-r"
        aria-hidden="true"
      />
      <div
        class="bg-ball/15 absolute top-1/3 right-[-10%] -z-10 size-[36rem] rounded-full blur-[120px]"
        aria-hidden="true"
      />

      <div
        class="mx-auto grid max-w-7xl items-center gap-16 px-4 pt-14 pb-24 sm:px-6 sm:pt-20 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:pt-24 lg:pb-32"
      >
        <div data-reveal>
          <p
            class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur"
          >
            <span class="bg-ball size-2 rounded-full shadow-[0_0_12px_#c7f36b]" />
            Court booking software for pickleball facilities
          </p>
          <h1
            class="mt-7 font-sans text-[2.75rem] leading-[1.02] font-extrabold tracking-tight text-balance sm:text-6xl xl:text-7xl"
          >
            Your Courts. Your Business.
            <span class="text-ball">One Platform.</span>
          </h1>
          <p class="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-white/75">
            Manage your pickleball facility smarter. Simplify reservations, organize your courts,
            and give your players a seamless booking experience — all in one platform.
          </p>
          <div class="mt-9 flex flex-wrap gap-3">
            <LandingButton :to="links.getStarted" size="lg" arrow
              >Start Your Free Trial</LandingButton
            >
            <LandingButton to="/#features" size="lg" variant="outline-light"
              >Explore Features</LandingButton
            >
          </div>
          <ul class="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-sm text-white/75">
            <li v-for="p in heroPoints" :key="p" class="flex items-center gap-2">
              <span class="bg-ball/15 flex size-5 items-center justify-center rounded-full">
                <Check class="text-ball size-3.5" aria-hidden="true" />
              </span>
              {{ p }}
            </li>
          </ul>
        </div>

        <!-- Product visual -->
        <div data-reveal :style="delay(2)" class="relative mx-auto w-full max-w-2xl">
          <ProductShot
            :src="appDashboard"
            alt="CourtDesk owner dashboard showing today's bookings, revenue and court occupancy"
            :width="1600"
            :height="1000"
            url="courtdesk.app/manage/your-club"
            eager
            class="lg:translate-x-6"
          />
          <div
            class="absolute -bottom-12 -left-2 w-[30%] max-w-44 overflow-hidden rounded-[1.6rem] border-[5px] border-[#0d1f1a] bg-[#0d1f1a] shadow-2xl sm:-left-8"
          >
            <img
              :src="appReserveMobile"
              alt="A facility's booking page on a phone, with a court and time selected"
              width="560"
              height="1212"
              decoding="async"
              class="block h-auto w-full rounded-[1.2rem]"
            />
          </div>
          <div
            class="text-ink absolute -top-5 right-2 hidden items-center gap-3 rounded-2xl bg-white py-2.5 pr-4 pl-2.5 shadow-xl sm:flex lg:-right-2"
          >
            <span class="bg-court text-ball flex size-9 items-center justify-center rounded-xl">
              <CircleCheck class="size-5" aria-hidden="true" />
            </span>
            <span class="text-xs leading-tight">
              <span class="block font-semibold">New online booking</span>
              <span class="text-ink/60">Court 2 · 7:00 PM · Paid</span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- Quick facts -->
    <section class="border-court/10 border-b bg-white">
      <ul
        class="mx-auto grid max-w-7xl grid-cols-1 gap-x-6 gap-y-4 px-4 py-7 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8"
      >
        <li
          v-for="f in facts"
          :key="f.label"
          class="text-ink flex items-center gap-3 text-sm font-medium"
        >
          <span
            class="bg-mist text-court-2 flex size-9 shrink-0 items-center justify-center rounded-xl"
          >
            <component :is="f.icon" class="size-4.5" aria-hidden="true" />
          </span>
          {{ f.label }}
        </li>
      </ul>
    </section>

    <!-- The problem -->
    <section id="problem" class="scroll-mt-16">
      <div
        class="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_1.15fr] lg:gap-20 lg:px-8 lg:py-32"
      >
        <div class="lg:sticky lg:top-28 lg:self-start">
          <SectionIntro
            eyebrow="The problem"
            title="Still Managing Your Pickleball Courts Manually?"
            lead="Running a facility shouldn't mean living in your inbox. If any of this sounds familiar, you're not alone."
          />
        </div>
        <div>
          <ul class="space-y-3">
            <li
              v-for="(p, i) in problems"
              :key="p.title"
              data-reveal
              :style="delay(i)"
              class="border-court/10 flex gap-4 rounded-2xl border bg-white p-5"
            >
              <span
                class="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#fdecea] text-[#c2410c]"
              >
                <component :is="p.icon" class="size-5" aria-hidden="true" />
              </span>
              <div>
                <p class="text-court font-semibold">{{ p.title }}</p>
                <p class="text-ink/65 mt-1 text-sm leading-relaxed">{{ p.body }}</p>
              </div>
              <X class="ml-auto size-4 shrink-0 text-[#c2410c]/50" aria-hidden="true" />
            </li>
          </ul>
          <a
            href="/#solution"
            data-reveal
            class="bg-court group mt-6 flex items-center justify-between gap-4 rounded-2xl px-6 py-5 text-white"
            @click="goToSection($event, 'solution')"
          >
            <span class="text-lg font-bold tracking-tight"
              >There's a smarter way to run your facility.</span
            >
            <span
              class="bg-ball text-court flex size-10 shrink-0 items-center justify-center rounded-full transition-transform group-hover:translate-y-0.5"
            >
              <ArrowDown class="size-5" aria-hidden="true" />
            </span>
          </a>
        </div>
      </div>
    </section>

    <!-- The solution -->
    <section id="solution" class="border-court/10 scroll-mt-16 border-y bg-white">
      <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionIntro
          eyebrow="The solution"
          title="Everything Your Pickleball Business Needs. In One Place."
          lead="CourtDesk replaces the messages, notebooks and spreadsheets with one simple system for your courts, your bookings and your players."
          center
        />
        <div class="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="(s, i) in solutions"
            :key="s.title"
            data-reveal
            :style="delay(i % 3)"
            class="group border-court/10 bg-mist/60 hover:border-court-2/30 rounded-3xl border p-7 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_50px_-24px_rgba(18,62,53,0.35)]"
          >
            <span
              class="bg-court text-ball flex size-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:scale-105"
            >
              <component :is="s.icon" class="size-5.5" aria-hidden="true" />
            </span>
            <p class="text-court mt-6 text-lg font-bold tracking-tight">{{ s.title }}</p>
            <p class="text-ink/65 mt-2 leading-relaxed">{{ s.body }}</p>
          </div>
        </div>
        <div data-reveal class="mt-12 flex flex-wrap justify-center gap-3">
          <LandingButton :to="links.getStarted" size="lg" arrow
            >Start Your Free Trial</LandingButton
          >
          <LandingButton to="/#pricing" size="lg" variant="outline">See Pricing</LandingButton>
        </div>
      </div>
    </section>

    <!-- Features (bento) -->
    <section id="features" class="bg-court relative isolate scroll-mt-16 overflow-hidden">
      <svg
        class="pointer-events-none absolute inset-0 -z-10 h-full w-full opacity-[0.05]"
        aria-hidden="true"
        preserveAspectRatio="xMidYMid slice"
        viewBox="0 0 400 200"
      >
        <g fill="none" stroke="#c7f36b" stroke-width="0.8">
          <rect x="20" y="20" width="360" height="160" />
          <line x1="200" y1="14" x2="200" y2="186" stroke-width="1.6" />
          <line x1="150" y1="20" x2="150" y2="180" />
          <line x1="250" y1="20" x2="250" y2="180" />
          <line x1="20" y1="100" x2="150" y2="100" />
          <line x1="250" y1="100" x2="380" y2="100" />
        </g>
      </svg>
      <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionIntro
          eyebrow="Features"
          title="Built to run the whole facility, from first booking to final report."
          lead="Everything you need to manage your courts, bookings, payments and players — and nothing you don't."
          dark
        />

        <div class="mt-16 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="(f, i) in features"
            :key="f.title"
            data-reveal
            :style="delay(i % 3)"
            class="group relative overflow-hidden rounded-3xl bg-white/[0.04] ring-1 ring-white/10 transition-colors duration-300 hover:bg-white/[0.07]"
            :class="{
              'md:col-span-2 lg:row-span-2': f.shot === 'calendar',
              'lg:row-span-2': f.shot === 'reserve',
            }"
          >
            <div class="p-7">
              <span class="bg-ball text-court flex size-11 items-center justify-center rounded-2xl">
                <component :is="f.icon" class="size-5" aria-hidden="true" />
              </span>
              <h3
                class="mt-5 font-sans font-bold tracking-tight text-white"
                :class="f.shot ? 'text-2xl' : 'text-lg'"
              >
                {{ f.title }}
              </h3>
              <p
                class="mt-2 max-w-lg leading-relaxed text-white/65"
                :class="f.shot ? '' : 'text-sm'"
              >
                {{ f.body }}
              </p>
            </div>

            <!-- Calendar screenshot bleeds off the bottom-right -->
            <div v-if="f.shot === 'calendar'" class="pl-7 sm:pl-10">
              <img
                :src="appCalendar"
                alt="Court calendar with bookings for four courts"
                width="1400"
                height="875"
                loading="lazy"
                decoding="async"
                class="block h-auto w-full rounded-tl-xl shadow-2xl ring-1 ring-white/10 transition-transform duration-500 group-hover:-translate-y-1"
              />
            </div>
            <!-- Phone with the booking page -->
            <div v-else-if="f.shot === 'reserve'" class="relative h-80 lg:h-[23rem]">
              <div
                class="absolute inset-x-10 top-0 mx-auto max-w-60 overflow-hidden rounded-t-[1.8rem] border-[5px] border-b-0 border-[#0d1f1a] bg-[#0d1f1a] shadow-2xl transition-transform duration-500 group-hover:-translate-y-1"
              >
                <img
                  :src="appReserveMobile"
                  alt="Booking page on a phone showing courts and hourly prices"
                  width="560"
                  height="1212"
                  loading="lazy"
                  decoding="async"
                  class="block h-auto w-full rounded-t-[1.4rem]"
                />
              </div>
            </div>
          </article>
        </div>

        <div data-reveal class="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3">
          <LandingButton :to="links.getStarted" size="lg" arrow
            >Start Your Free Trial</LandingButton
          >
          <RouterLink
            :to="links.exampleSite"
            class="hover:text-ball text-sm font-semibold text-white/75 underline decoration-white/25 underline-offset-4 transition-colors"
            >See an example booking page</RouterLink
          >
        </div>
      </div>
    </section>

    <!-- How it works -->
    <section id="how" class="scroll-mt-16">
      <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionIntro
          eyebrow="How it works"
          title="Get Your Pickleball Facility Online in Three Simple Steps."
          center
        />
        <ol class="relative mt-16 grid gap-12 lg:grid-cols-3 lg:gap-8">
          <!-- Dashed court line joining the steps -->
          <div
            class="border-court-2/30 absolute top-12 right-[16%] left-[16%] hidden border-t-2 border-dashed lg:block"
            aria-hidden="true"
          />
          <li
            v-for="(s, i) in steps"
            :key="s.title"
            data-reveal
            :style="delay(i)"
            class="relative text-center"
          >
            <div class="relative mx-auto flex size-24 items-center justify-center">
              <span class="bg-ball/40 absolute inset-0 rounded-full" />
              <span
                class="bg-court text-ball ring-mist relative flex size-[4.5rem] items-center justify-center rounded-full ring-8"
              >
                <component :is="s.icon" class="size-7" aria-hidden="true" />
              </span>
              <span
                class="font-display bg-ball text-court ring-mist absolute -top-1 -right-1 flex size-8 items-center justify-center rounded-full text-sm font-bold ring-4"
                >{{ i + 1 }}</span
              >
            </div>
            <p class="text-court-2 mt-6 text-xs font-semibold tracking-[0.16em] uppercase">
              Step {{ i + 1 }}
            </p>
            <h3 class="text-court mt-2 font-sans text-xl font-bold tracking-tight">
              {{ s.title }}
            </h3>
            <p class="text-ink/65 mx-auto mt-2 max-w-xs leading-relaxed">{{ s.body }}</p>
          </li>
        </ol>
        <div data-reveal class="mt-14 flex justify-center">
          <LandingButton :to="links.getStarted" size="lg" arrow
            >Start Your Free Trial</LandingButton
          >
        </div>
      </div>
    </section>

    <!-- Why choose us -->
    <section id="benefits" class="border-court/10 scroll-mt-16 border-y bg-white">
      <div
        class="mx-auto grid max-w-7xl items-center gap-16 px-4 py-24 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20 lg:px-8 lg:py-32"
      >
        <div data-reveal class="relative">
          <div class="overflow-hidden rounded-[2rem]">
            <img
              :src="players"
              alt="Players in a doubles rally on an outdoor pickleball court"
              width="900"
              height="1125"
              loading="lazy"
              decoding="async"
              class="block aspect-[4/5] h-auto w-full object-cover"
            />
          </div>
          <PickleballBall class="absolute -top-6 -right-3 size-16 drop-shadow-lg sm:size-20" />
          <div
            class="text-ink absolute right-4 -bottom-8 left-4 rounded-2xl bg-white p-5 shadow-[0_24px_60px_-20px_rgba(18,62,53,0.45)] sm:right-auto sm:-left-6 sm:max-w-xs"
          >
            <p class="text-court-2 text-xs font-semibold tracking-[0.14em] uppercase">
              Your booking page
            </p>
            <p class="text-court mt-1 truncate font-mono text-sm">
              courtdesk.app/book/<span class="bg-ball/60 rounded px-1">your-club</span>
            </p>
            <p class="text-ink/60 mt-2 text-sm">Share it anywhere. Players book in minutes.</p>
          </div>
        </div>

        <div>
          <SectionIntro
            eyebrow="Why choose CourtDesk"
            title="Built for Pickleball Facility Owners."
            lead="Not a generic scheduling tool. CourtDesk is made for the way pickleball courts are rented, paid for and played on."
          />
          <ul class="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            <li
              v-for="(r, i) in reasons"
              :key="r.title"
              data-reveal
              :style="delay(i % 2)"
              class="flex gap-4"
            >
              <span
                class="bg-mist text-court-2 ring-court/10 flex size-10 shrink-0 items-center justify-center rounded-xl ring-1"
              >
                <component :is="r.icon" class="size-5" aria-hidden="true" />
              </span>
              <div>
                <p class="text-court font-semibold">{{ r.title }}</p>
                <p class="text-ink/65 mt-1 text-sm leading-relaxed">{{ r.body }}</p>
              </div>
            </li>
          </ul>
          <div data-reveal class="mt-10">
            <LandingButton :to="links.getStarted" size="lg" arrow
              >Start Your Free Trial</LandingButton
            >
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing -->
    <section id="pricing" class="scroll-mt-16">
      <div class="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8 lg:py-32">
        <SectionIntro
          eyebrow="Pricing"
          title="Find the Right Plan for Your Facility."
          lead="Every plan starts with a 7-day free trial. Pay monthly, or annually and save two months."
          center
        />
        <div data-reveal class="mt-8 flex justify-center">
          <SegmentedControl
            v-model="cycle"
            label="Billing period"
            :options="[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: 'Annual · save 2 months' },
            ]"
          />
        </div>

        <div class="mt-12 grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-4">
          <template v-if="plansLoading">
            <div
              v-for="n in 3"
              :key="n"
              class="border-court/10 h-[30rem] animate-pulse rounded-2xl border bg-white"
            />
          </template>
          <template v-else>
            <div v-for="(plan, i) in publicPlans" :key="plan.id" data-reveal :style="delay(i)">
              <PlanCard :plan="plan" :cycle="cycle" class="shadow-sm">
                <template #action>
                  <p
                    v-if="plan.comingSoon"
                    class="border-court/15 text-ink/50 rounded-full border py-3 text-center text-sm font-semibold"
                  >
                    Coming Soon
                  </p>
                  <LandingButton
                    v-else
                    :to="`${links.getStarted}?plan=${plan.id}`"
                    :variant="plan.highlighted ? 'primary' : 'outline'"
                    full-width
                    >Start Free Trial</LandingButton
                  >
                </template>
              </PlanCard>
            </div>
          </template>

          <!-- Custom: bespoke software built by Sideline (not a CourtDesk plan) -->
          <div
            data-reveal
            :style="delay(publicPlans.length)"
            class="bg-court relative isolate flex flex-col overflow-hidden rounded-2xl p-6 text-white"
          >
            <PickleballBall class="absolute -top-8 -right-8 -z-10 size-28 opacity-15" />
            <p class="text-lg font-semibold">Custom</p>
            <p class="mt-1 text-sm text-white/65">
              Booking software of your own, built for your facility by the Sideline team.
            </p>
            <p class="mt-5 text-3xl font-semibold tracking-tight">By quote</p>
            <p class="mt-1 text-xs text-white/55">Priced per project</p>
            <ul class="mt-5 flex-1 space-y-2 border-t border-white/10 pt-5 text-sm">
              <li v-for="item in customItems" :key="item" class="flex gap-2">
                <Check class="text-ball mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span class="text-white/80">{{ item }}</span>
              </li>
            </ul>
            <LandingButton :to="links.customBuild" variant="outline-light" full-width class="mt-6"
              >Talk to Us</LandingButton
            >
          </div>
        </div>
        <p class="text-ink/55 mt-8 text-center text-sm">
          Prices in Philippine pesos. Request a plan change any time from your dashboard.
        </p>
      </div>
    </section>

    <!-- FAQ -->
    <section id="faq" class="border-court/10 scroll-mt-16 border-y bg-white">
      <div
        class="mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:px-8 lg:py-32"
      >
        <div class="lg:sticky lg:top-28 lg:self-start">
          <SectionIntro
            eyebrow="FAQ"
            title="Questions, answered."
            lead="Everything court owners usually ask before getting started."
          />
          <div data-reveal class="mt-8">
            <LandingButton :to="links.getStarted" arrow>Start Your Free Trial</LandingButton>
          </div>
        </div>
        <div class="divide-court/10 border-court/10 bg-mist/60 divide-y rounded-3xl border">
          <details
            v-for="(f, i) in faqs"
            :key="f.q"
            name="faq"
            class="faq group px-6 sm:px-8"
            :open="i === 0"
          >
            <summary
              class="text-court flex list-none items-center justify-between gap-6 py-6 text-left font-semibold [&::-webkit-details-marker]:hidden"
            >
              {{ f.q }}
              <span
                class="bg-mist group-open:bg-ball flex size-8 shrink-0 items-center justify-center rounded-full transition-colors"
              >
                <ChevronDown
                  class="size-4 transition-transform duration-300 group-open:rotate-180"
                  aria-hidden="true"
                />
              </span>
            </summary>
            <p class="text-ink/70 -mt-1 pb-6 leading-relaxed sm:pr-12">{{ f.a }}</p>
          </details>
        </div>
      </div>
    </section>

    <!-- Final CTA -->
    <section class="px-4 pb-24 sm:px-6 lg:px-8">
      <div
        data-reveal
        class="bg-court relative isolate mx-auto max-w-7xl overflow-hidden rounded-[2rem] px-6 py-20 text-center text-white sm:px-12 lg:py-28"
      >
        <img
          :src="courtsNight"
          alt=""
          width="1600"
          height="1986"
          loading="lazy"
          decoding="async"
          class="absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-35"
        />
        <div
          class="from-court/80 via-court/90 to-court absolute inset-0 -z-10 bg-gradient-to-b"
          aria-hidden="true"
        />
        <PickleballBall
          class="ball-float absolute top-8 left-8 hidden size-16 opacity-90 sm:block"
        />
        <h2
          class="mx-auto max-w-3xl font-sans text-4xl leading-[1.08] font-extrabold tracking-tight text-balance sm:text-5xl"
        >
          Ready to Run Your Pickleball Business
          <span class="text-ball">Smarter?</span>
        </h2>
        <p class="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-white/75">
          Join the smarter way to manage your pickleball facility. Give your players a better
          booking experience while you focus on growing your business.
        </p>
        <div class="mt-10 flex flex-wrap justify-center gap-3">
          <LandingButton :to="links.getStarted" size="lg" arrow>Get Started Today</LandingButton>
          <LandingButton to="/#pricing" size="lg" variant="outline-light"
            >View Pricing</LandingButton
          >
        </div>
        <p class="mt-6 text-sm text-white/55">7-day free trial on every plan.</p>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ball-float {
  animation: ball-float 5s ease-in-out infinite;
}

@keyframes ball-float {
  0%,
  100% {
    transform: translateY(0) rotate(0deg);
  }
  50% {
    transform: translateY(-10px) rotate(12deg);
  }
}

/* Smoothly open FAQ answers where the browser supports it. */
.faq {
  interpolate-size: allow-keywords;
}
.faq::details-content {
  block-size: 0;
  overflow: hidden;
  transition:
    block-size 0.3s ease,
    content-visibility 0.3s allow-discrete;
}
.faq[open]::details-content {
  block-size: auto;
}

@media (prefers-reduced-motion: reduce) {
  .ball-float {
    animation: none;
  }
  .faq::details-content {
    transition: none;
  }
}
</style>
