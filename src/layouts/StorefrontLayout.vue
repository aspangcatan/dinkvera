<script setup lang="ts">
import { Mail, MapPin, Menu, Phone, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import BrandLogo from '@/components/layout/BrandLogo.vue'
import TenantMark from '@/components/layout/TenantMark.vue'
import AppButton from '@/components/ui/AppButton.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useBrandTheme } from '@/composables/useBrandTheme'
import { useTenantStore } from '@/stores/tenant'
import { formatOpeningHours } from '@/utils/dates'

/**
 * A tenant's public booking website. Today it lives at /book/:tenantSlug;
 * later the same layout can serve a subdomain or custom domain.
 */
const route = useRoute()
const store = useTenantStore()
const slug = computed(() => String(route.params.tenantSlug))
const menuOpen = ref(false)

watch(slug, (s) => void store.load(s), { immediate: true })
watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)

useBrandTheme(() => store.tenant?.branding)

const base = computed(() => `/book/${slug.value}`)
const links = computed(() => [
  { to: base.value, label: 'Home', exact: true },
  { to: `${base.value}/courts`, label: 'Courts & rates' },
  { to: `${base.value}#policies`, label: 'Rules & policies' },
  { to: `${base.value}/lookup`, label: 'Find my booking' },
])

const offline = computed(
  () => store.tenant?.status === 'suspended' || store.tenant?.status === 'cancelled',
)

function isActive(link: { to: string; exact?: boolean }): boolean {
  const [path, hash] = link.to.split('#')
  if (hash) return route.path === path && route.hash === `#${hash}`
  return link.exact ? route.path === link.to && !route.hash : route.path.startsWith(link.to)
}
</script>

<template>
  <div
    v-if="store.notFound"
    class="bg-warm-white flex min-h-screen items-center justify-center p-6 text-center"
  >
    <div>
      <p class="text-charcoal-700 font-display text-3xl uppercase">Page not found</p>
      <p class="text-charcoal-400 mt-2 text-sm">No booking site lives at this address.</p>
      <AppButton class="mt-5" to="/">Go to CourtDesk</AppButton>
    </div>
  </div>

  <div v-else-if="store.tenant" class="bg-warm-white flex min-h-screen flex-col">
    <header class="border-charcoal-100/80 sticky top-0 z-40 border-b bg-white/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <RouterLink :to="base" class="flex min-w-0 items-center gap-2.5">
          <TenantMark :branding="store.tenant.branding" />
          <span class="text-charcoal-700 truncate font-semibold">{{ store.tenant.name }}</span>
        </RouterLink>
        <nav class="ml-auto hidden items-center gap-1 lg:flex" aria-label="Main">
          <RouterLink
            v-for="link in links"
            :key="link.to"
            :to="link.to"
            class="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors"
            :class="isActive(link) ? 'text-brand-700' : 'text-charcoal-500 hover:text-charcoal-700'"
          >
            {{ link.label }}
          </RouterLink>
        </nav>
        <AppButton v-if="!offline" :to="`${base}/reserve`" class="ml-auto max-lg:hidden lg:ml-0">
          Book a court
        </AppButton>
        <button
          type="button"
          class="text-charcoal-600 hover:bg-charcoal-100 ml-auto rounded-lg p-2 lg:hidden"
          :aria-expanded="menuOpen"
          aria-controls="storefront-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" class="size-6" aria-hidden="true" />
          <Menu v-else class="size-6" aria-hidden="true" />
        </button>
      </div>
      <nav
        v-if="menuOpen"
        id="storefront-menu"
        class="border-charcoal-100 space-y-1 border-t bg-white px-4 py-3 lg:hidden"
        aria-label="Main"
      >
        <RouterLink
          v-for="link in links"
          :key="link.to"
          :to="link.to"
          class="block rounded-lg px-3 py-2.5 text-sm font-medium"
          :class="isActive(link) ? 'bg-brand-50 text-brand-700' : 'text-charcoal-600'"
        >
          {{ link.label }}
        </RouterLink>
        <AppButton v-if="!offline" :to="`${base}/reserve`" full-width class="mt-2">
          Book a court
        </AppButton>
      </nav>
    </header>

    <div
      v-if="offline"
      class="bg-charcoal-700 text-warm-white px-4 py-3 text-center text-sm"
      role="status"
    >
      Online booking for {{ store.tenant.name }} is paused. Please contact the venue directly.
    </div>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="bg-brand-900 text-white/80">
      <div class="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <div class="flex items-center gap-2.5">
            <TenantMark :branding="store.tenant.branding" />
            <span class="font-semibold text-white">{{ store.tenant.name }}</span>
          </div>
          <p class="mt-3 max-w-xs text-sm text-white/70">{{ store.tenant.about }}</p>
          <p class="mt-4 flex items-center gap-2 text-sm">
            <Phone class="size-4" aria-hidden="true" /> {{ store.tenant.phone }}
          </p>
          <p class="mt-1.5 flex items-center gap-2 text-sm">
            <Mail class="size-4" aria-hidden="true" /> {{ store.tenant.ownerEmail }}
          </p>
        </div>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div v-for="loc in store.activeLocations" :key="loc.id">
            <p class="font-semibold text-white">{{ loc.name }}</p>
            <p class="mt-1 flex gap-1.5 text-sm text-white/70">
              <MapPin class="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {{ loc.address }}, {{ loc.city }}
            </p>
            <p class="mt-1 text-xs text-white/60">
              {{ formatOpeningHours(loc.openHour, loc.closeHour)
              }}{{ loc.closeHour - loc.openHour >= 24 ? '' : ' daily' }}
            </p>
          </div>
        </div>
      </div>
      <div class="border-t border-white/10">
        <div
          class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-white/60 sm:px-6"
        >
          <p>
            © {{ new Date().getFullYear() }} {{ store.tenant.legalName }} ·
            <RouterLink :to="`${base}#policies`" class="underline hover:text-white"
              >Rules &amp; policies</RouterLink
            >
          </p>
          <RouterLink to="/" class="flex items-center gap-2 hover:text-white">
            Powered by <BrandLogo tone="light" class="scale-75" />
          </RouterLink>
        </div>
      </div>
    </footer>
  </div>

  <LoadingState v-else class="mx-auto mt-24 max-w-lg" :rows="6" />
  <ToastHost />
</template>
