<script setup lang="ts">
import { ArrowLeft, Check } from '@lucide/vue'

import { brand } from '@/config/brand'

import appDashboard from '@/assets/marketing/app-dashboard.webp'
import courtsNight from '@/assets/marketing/courts-night.webp'
import BrandLogo from '@/components/layout/BrandLogo.vue'
import PickleballBall from '@/components/marketing/PickleballBall.vue'
import ProductShot from '@/components/marketing/ProductShot.vue'

/**
 * Split page for sign-in and the password screens, in the landing page's
 * look: the form on the left, a court-green panel on the right. The panel
 * shows the brand pitch (large screens only) unless an `aside` slot
 * replaces it, e.g. the demo account picker, which shows on every size.
 */
defineProps<{ title: string; description?: string }>()

const points = ['Your own booking page', 'Live court calendar', 'Payments & reports']
</script>

<template>
  <div class="bg-mist text-ink grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
    <!-- Form side -->
    <div class="flex min-h-screen flex-col px-6 py-6 sm:px-12 lg:min-h-0">
      <div class="flex items-center justify-between gap-4">
        <RouterLink to="/" aria-label="CourtDesk home"><BrandLogo byline /></RouterLink>
        <RouterLink
          to="/"
          class="text-ink/60 hover:text-court inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors hover:bg-white"
        >
          <ArrowLeft class="size-4" aria-hidden="true" />
          Back to home
        </RouterLink>
      </div>

      <main class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-14">
        <h1 class="text-court font-sans text-3xl font-extrabold tracking-tight sm:text-4xl">
          {{ title }}
        </h1>
        <p v-if="description" class="text-ink/65 mt-2 leading-relaxed">{{ description }}</p>
        <div class="mt-8">
          <slot />
        </div>
      </main>

      <p class="text-ink/45 text-xs">© {{ new Date().getFullYear() }} {{ brand.legalName }}</p>
    </div>

    <!-- Court-green panel -->
    <aside
      class="bg-court relative isolate overflow-hidden text-white lg:sticky lg:top-0 lg:h-screen"
      :class="$slots.aside ? '' : 'hidden lg:block'"
    >
      <img
        :src="courtsNight"
        alt=""
        width="1600"
        height="1986"
        decoding="async"
        class="absolute inset-0 -z-20 h-full w-full object-cover opacity-45"
      />
      <div
        class="from-court/70 via-court/90 to-court absolute inset-0 -z-10 bg-gradient-to-b"
        aria-hidden="true"
      />
      <div
        class="bg-ball/10 absolute -top-32 -right-32 -z-10 size-[30rem] rounded-full blur-[110px]"
        aria-hidden="true"
      />

      <slot name="aside">
        <div class="flex h-full flex-col justify-center px-12 py-14 xl:px-16">
          <PickleballBall class="ball-float absolute top-10 right-10 size-16 opacity-90" />
          <p
            class="inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-medium text-white/85 backdrop-blur"
          >
            <span class="bg-ball size-2 rounded-full shadow-[0_0_12px_#c7f36b]" />
            Court booking software for pickleball facilities
          </p>
          <p
            class="mt-6 max-w-lg font-sans text-4xl leading-[1.05] font-extrabold tracking-tight xl:text-5xl"
          >
            <span class="block">Your Courts.</span>
            <span class="block">Your Business.</span>
            <span class="text-ball block">One Platform.</span>
          </p>
          <ul class="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-white/75">
            <li v-for="p in points" :key="p" class="flex items-center gap-2">
              <span class="bg-ball/15 flex size-5 items-center justify-center rounded-full">
                <Check class="text-ball size-3.5" aria-hidden="true" />
              </span>
              {{ p }}
            </li>
          </ul>
          <ProductShot
            :src="appDashboard"
            alt="CourtDesk owner dashboard"
            :width="1600"
            :height="1000"
            :url="`${brand.domain}/manage/your-club`"
            class="mt-10 max-w-xl"
          />
        </div>
      </slot>
    </aside>
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

@media (prefers-reduced-motion: reduce) {
  .ball-float {
    animation: none;
  }
}
</style>
