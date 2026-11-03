<script setup lang="ts">
import { Menu, X } from '@lucide/vue'
import { nextTick, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useRoute } from 'vue-router'

import type { NavGroup, NavItem } from '@/types/ui'

/**
 * Sidebar + content frame shared by the Super Admin and tenant dashboards.
 * `theme` gives each its own look: a dark platform console vs a light,
 * tenant-branded workspace. Below `lg` the sidebar is a slide-in drawer
 * (same pattern as match-pickleball's admin layout).
 */
const props = defineProps<{
  theme: 'platform' | 'tenant'
  groups: NavGroup[]
  label: string
}>()

const route = useRoute()
const menuOpen = ref(false)
const menuButton = useTemplateRef<HTMLButtonElement>('menuButton')
const closeButton = useTemplateRef<HTMLButtonElement>('closeButton')

async function openMenu(): Promise<void> {
  menuOpen.value = true
  await nextTick()
  closeButton.value?.focus()
}

function closeMenu(): void {
  if (!menuOpen.value) return
  menuOpen.value = false
  menuButton.value?.focus()
}

watch(() => route.fullPath, closeMenu)
watch(menuOpen, (open) => {
  document.body.style.overflow = open ? 'hidden' : ''
})

function onKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') closeMenu()
}
const desktop = window.matchMedia('(min-width: 1024px)')
function onBreakpoint(event: MediaQueryListEvent): void {
  if (event.matches) menuOpen.value = false
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  desktop.addEventListener('change', onBreakpoint)
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  desktop.removeEventListener('change', onBreakpoint)
  document.body.style.overflow = ''
})

const t = {
  platform: {
    aside: 'bg-forest-900 text-forest-100 border-r border-white/5',
    group: 'text-forest-400',
    link: 'text-forest-200 hover:bg-white/5 hover:text-white',
    active: 'bg-white/10 text-white',
    icon: 'text-forest-400 group-hover:text-forest-200',
    activeIcon: 'text-lime-300',
    badge: 'bg-lime-300 text-forest-900',
    close: 'text-forest-200 hover:bg-white/10',
  },
  tenant: {
    aside: 'bg-white text-charcoal-600 border-r border-charcoal-100',
    group: 'text-charcoal-300',
    link: 'text-charcoal-500 hover:bg-charcoal-50 hover:text-charcoal-700',
    active: 'bg-brand-50 text-brand-700',
    icon: 'text-charcoal-300 group-hover:text-charcoal-500',
    activeIcon: 'text-brand-600',
    badge: 'bg-brand-600 text-white',
    close: 'text-charcoal-400 hover:bg-charcoal-100',
  },
}[props.theme]

function isActive(item: NavItem): boolean {
  return item.exact ? route.path === item.to : route.path.startsWith(item.to)
}
</script>

<template>
  <div class="bg-canvas min-h-screen lg:flex">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="menuOpen"
        class="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] lg:hidden"
        aria-hidden="true"
        @click="closeMenu"
      />
    </Transition>

    <aside
      id="dashboard-sidebar"
      class="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col duration-200 ease-out lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:w-64 lg:max-w-none lg:shrink-0 lg:translate-x-0"
      :class="[
        t.aside,
        menuOpen
          ? 'visible translate-x-0 shadow-2xl transition-transform'
          : 'invisible -translate-x-full transition-[transform,visibility] lg:visible',
      ]"
      :aria-label="label"
    >
      <button
        ref="closeButton"
        type="button"
        class="absolute top-4 right-3 z-10 rounded-lg p-2 lg:hidden"
        :class="t.close"
        aria-label="Close menu"
        @click="closeMenu"
      >
        <X class="size-5" aria-hidden="true" />
      </button>

      <div class="shrink-0 px-4 pt-5 pb-3">
        <slot name="brand" />
      </div>

      <nav class="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-3" :aria-label="label">
        <div v-for="group in groups" :key="group.label">
          <p
            class="mb-1.5 px-3 text-[11px] font-semibold tracking-[0.12em] uppercase"
            :class="t.group"
          >
            {{ group.label }}
          </p>
          <ul class="space-y-0.5">
            <li v-for="item in group.items" :key="item.to">
              <RouterLink
                :to="item.to"
                class="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                :class="isActive(item) ? t.active : t.link"
                :aria-current="isActive(item) ? 'page' : undefined"
                @click="closeMenu"
              >
                <component
                  :is="item.icon"
                  class="size-[18px] shrink-0 transition-colors"
                  :class="isActive(item) ? t.activeIcon : t.icon"
                  aria-hidden="true"
                />
                <span class="flex-1 truncate">{{ item.label }}</span>
                <span
                  v-if="item.badge"
                  class="tabular rounded-full px-1.5 py-px text-[11px] font-semibold"
                  :class="t.badge"
                  >{{ item.badge }}</span
                >
              </RouterLink>
            </li>
          </ul>
        </div>
      </nav>

      <div class="shrink-0 p-3">
        <slot name="sidebar-footer" />
      </div>
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="border-charcoal-100 bg-canvas/85 sticky top-0 z-30 flex h-14 items-center gap-3 border-b px-4 backdrop-blur sm:px-6"
      >
        <button
          ref="menuButton"
          type="button"
          class="text-charcoal-500 hover:bg-charcoal-100 -ml-1.5 rounded-lg p-2 lg:hidden"
          aria-label="Open menu"
          aria-controls="dashboard-sidebar"
          :aria-expanded="menuOpen"
          @click="openMenu"
        >
          <Menu class="size-5" aria-hidden="true" />
        </button>
        <slot name="topbar" />
      </header>
      <slot name="banner" />
      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <slot />
      </main>
    </div>
  </div>
</template>
