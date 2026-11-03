<script setup lang="ts">
import { Menu, X } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'

import BrandLogo from '@/components/layout/BrandLogo.vue'
import { brand } from '@/config/brand'
import LandingButton from '@/components/marketing/LandingButton.vue'
import ToastHost from '@/components/ui/ToastHost.vue'
import { useSectionLink } from '@/composables/useSectionLink'
import { links, navItems } from '@/views/marketing/landingContent'

const route = useRoute()
const { goToSection } = useSectionLink()

const menuOpen = ref(false)
const scrolled = ref(false)

function onNav(event: MouseEvent, id: string): void {
  menuOpen.value = false
  goToSection(event, id)
}

function onScroll(): void {
  scrolled.value = window.scrollY > 8
}
function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') menuOpen.value = false
}

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
)
onMounted(() => {
  onScroll()
  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll)
  window.removeEventListener('keydown', onKey)
})

const footerColumns = [
  {
    title: 'Product',
    items: [
      { label: 'Features', section: 'features' },
      { label: 'Benefits', section: 'benefits' },
      { label: 'Pricing', section: 'pricing' },
      { label: 'FAQ', section: 'faq' },
    ],
  },
  {
    title: 'Company',
    items: [
      { label: 'Contact', to: links.contact },
      { label: 'Sign in', to: links.signIn },
    ],
  },
  {
    title: 'Legal',
    items: [
      { label: 'Privacy Policy', to: links.privacy },
      { label: 'Terms and Conditions', to: links.terms },
    ],
  },
]
</script>

<template>
  <div class="bg-mist text-ink flex min-h-screen flex-col">
    <header
      class="sticky top-0 z-40 transition-colors duration-300"
      :class="
        scrolled || menuOpen
          ? 'bg-court/95 shadow-[0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md'
          : 'bg-court'
      "
    >
      <div class="mx-auto flex h-16 max-w-7xl items-center gap-8 px-4 sm:px-6 lg:px-8">
        <a href="/" aria-label="CourtDesk home" @click="onNav($event, 'top')">
          <BrandLogo tone="light" byline />
        </a>
        <nav class="hidden items-center gap-1 lg:flex" aria-label="Main">
          <a
            v-for="item in navItems"
            :key="item.id"
            :href="item.id === 'top' ? '/' : `/#${item.id}`"
            class="rounded-full px-3.5 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/5 hover:text-white"
            @click="onNav($event, item.id)"
            >{{ item.label }}</a
          >
        </nav>
        <div class="ml-auto hidden items-center gap-2 lg:flex">
          <RouterLink
            :to="links.signIn"
            class="rounded-full px-4 py-2 text-sm font-semibold text-white/85 hover:text-white"
            >Sign In</RouterLink
          >
          <LandingButton :to="links.getStarted">Get Started</LandingButton>
        </div>
        <button
          type="button"
          class="ml-auto flex size-10 items-center justify-center rounded-full text-white hover:bg-white/10 lg:hidden"
          :aria-expanded="menuOpen"
          aria-controls="mobile-menu"
          :aria-label="menuOpen ? 'Close menu' : 'Open menu'"
          @click="menuOpen = !menuOpen"
        >
          <X v-if="menuOpen" class="size-5" aria-hidden="true" />
          <Menu v-else class="size-5" aria-hidden="true" />
        </button>
      </div>

      <Transition
        enter-active-class="transition duration-200 ease-out"
        enter-from-class="opacity-0 -translate-y-2"
        leave-active-class="transition duration-150 ease-in"
        leave-to-class="opacity-0 -translate-y-2"
      >
        <nav
          v-if="menuOpen"
          id="mobile-menu"
          class="bg-court absolute inset-x-0 top-full border-t border-white/10 px-4 pt-3 pb-6 shadow-2xl sm:px-6 lg:hidden"
          aria-label="Mobile"
        >
          <a
            v-for="item in navItems"
            :key="item.id"
            :href="item.id === 'top' ? '/' : `/#${item.id}`"
            class="block rounded-xl px-3 py-3 text-base font-medium text-white/85 hover:bg-white/5 hover:text-white"
            @click="onNav($event, item.id)"
            >{{ item.label }}</a
          >
          <div class="mt-4 grid gap-3 sm:grid-cols-2">
            <LandingButton :to="links.signIn" variant="outline-light" full-width
              >Sign In</LandingButton
            >
            <LandingButton :to="links.getStarted" full-width>Get Started</LandingButton>
          </div>
        </nav>
      </Transition>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>

    <footer class="bg-court text-white/70">
      <div class="mx-auto max-w-7xl px-4 pt-16 pb-10 sm:px-6 lg:px-8">
        <div class="grid gap-12 lg:grid-cols-[1.4fr_2fr]">
          <div class="max-w-sm">
            <BrandLogo tone="light" byline />
            <p class="mt-5 text-sm leading-relaxed">
              Court booking and management software for pickleball facilities. Your own booking
              page, a live court calendar, payments and reports — in one platform.
            </p>
            <LandingButton :to="links.getStarted" class="mt-6" arrow
              >Start Your Free Trial</LandingButton
            >
          </div>
          <div class="grid grid-cols-2 gap-8 sm:grid-cols-3">
            <div v-for="col in footerColumns" :key="col.title">
              <p class="text-sm font-semibold text-white">{{ col.title }}</p>
              <ul class="mt-4 space-y-3 text-sm">
                <li v-for="item in col.items" :key="item.label">
                  <a
                    v-if="'section' in item"
                    :href="`/#${item.section}`"
                    class="hover:text-ball transition-colors"
                    @click="onNav($event, item.section!)"
                    >{{ item.label }}</a
                  >
                  <RouterLink v-else :to="item.to!" class="hover:text-ball transition-colors">{{
                    item.label
                  }}</RouterLink>
                </li>
              </ul>
            </div>
          </div>
        </div>
        <div
          class="mt-14 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/50"
        >
          <p>© {{ new Date().getFullYear() }} {{ brand.legalName }} All rights reserved.</p>
          <p>{{ brand.product }} is a product of {{ brand.company }}.</p>
        </div>
      </div>
    </footer>
  </div>
  <ToastHost />
</template>
