<script setup lang="ts">
import { ArrowLeft, ArrowRight, ImagePlus, Images, Palette, Trash2 } from '@lucide/vue'
import { ref } from 'vue'

import AppCard from '@/components/ui/AppCard.vue'
import {
  HERO_MAX_IMAGES,
  moveHeroImage,
  removeHeroImage,
  uploadHeroImage,
} from '@/services/brandingService'
import { useToastStore } from '@/stores/toast'
import type { HeroImage, Tenant, TenantBranding } from '@/types/tenant'

/**
 * Settings → Branding: the booking-site homepage banner. Either the plain
 * brand color or a carousel of up to 3 photos. Photos save as soon as
 * they're uploaded; the style is saved with the page's Save changes.
 */
const props = defineProps<{ tenantId: string; images: HeroImage[] }>()
const heroStyle = defineModel<TenantBranding['heroStyle']>('heroStyle', { required: true })
const emit = defineEmits<{ updated: [tenant: Tenant] }>()
const toast = useToastStore()

const busy = ref(false)

async function run(action: () => Promise<Tenant>, message: string): Promise<void> {
  busy.value = true
  try {
    emit('updated', await action())
    toast.show(message)
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file) void run(() => uploadHeroImage(props.tenantId, file), 'Photo added')
}

const options = [
  {
    value: 'color' as const,
    icon: Palette,
    title: 'Brand color',
    body: 'A clean banner in your brand color.',
  },
  {
    value: 'carousel' as const,
    icon: Images,
    title: 'Photo carousel',
    body: `Up to ${HERO_MAX_IMAGES} photos that rotate every few seconds.`,
  },
]
</script>

<template>
  <AppCard
    title="Homepage banner"
    description="The big banner at the top of your booking site. Click Save changes after choosing a style."
  >
    <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Banner style">
      <label
        v-for="o in options"
        :key="o.value"
        class="flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors"
        :class="
          heroStyle === o.value
            ? 'border-brand-600 bg-brand-50/60 ring-brand-600 ring-1'
            : 'border-charcoal-100 hover:border-charcoal-200'
        "
      >
        <input
          v-model="heroStyle"
          type="radio"
          name="hero-style"
          :value="o.value"
          class="sr-only"
        />
        <span
          class="flex size-10 shrink-0 items-center justify-center rounded-lg"
          :class="
            heroStyle === o.value ? 'bg-brand-600 text-white' : 'bg-charcoal-50 text-charcoal-400'
          "
        >
          <component :is="o.icon" class="size-5" aria-hidden="true" />
        </span>
        <span>
          <span class="text-charcoal-700 block text-sm font-semibold">{{ o.title }}</span>
          <span class="text-charcoal-400 block text-xs">{{ o.body }}</span>
        </span>
      </label>
    </div>

    <div v-if="heroStyle === 'carousel'" class="mt-5">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <p class="text-charcoal-700 text-sm font-semibold">
          Photos ({{ images.length }}/{{ HERO_MAX_IMAGES }})
        </p>
        <p class="text-charcoal-400 text-xs">
          Landscape photos work best (at least 1600 × 900). JPG, PNG or WebP, up to 5 MB.
        </p>
      </div>

      <ul class="mt-3 grid gap-3 sm:grid-cols-3">
        <li
          v-for="(image, index) in images"
          :key="image.path"
          class="group border-charcoal-100 relative overflow-hidden rounded-xl border bg-white"
        >
          <img
            :src="image.url"
            :alt="`Banner photo ${index + 1}`"
            class="aspect-video w-full object-cover"
          />
          <span
            class="absolute top-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[11px] font-semibold text-white"
            >{{ index + 1 }}</span
          >
          <div class="flex items-center justify-between gap-1 px-2 py-1.5">
            <div class="flex gap-1">
              <button
                type="button"
                class="text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700 rounded-md p-1.5 disabled:opacity-30"
                :disabled="busy || index === 0"
                :aria-label="`Move photo ${index + 1} earlier`"
                @click="run(() => moveHeroImage(tenantId, image.path, -1), 'Order updated')"
              >
                <ArrowLeft class="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700 rounded-md p-1.5 disabled:opacity-30"
                :disabled="busy || index === images.length - 1"
                :aria-label="`Move photo ${index + 1} later`"
                @click="run(() => moveHeroImage(tenantId, image.path, 1), 'Order updated')"
              >
                <ArrowRight class="size-4" aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              class="text-charcoal-400 rounded-md p-1.5 hover:bg-red-50 hover:text-red-600"
              :disabled="busy"
              :aria-label="`Remove photo ${index + 1}`"
              @click="run(() => removeHeroImage(tenantId, image.path), 'Photo removed')"
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </button>
          </div>
        </li>

        <li v-if="images.length < HERO_MAX_IMAGES">
          <label
            class="border-charcoal-200 hover:border-brand-600 hover:bg-brand-50/40 flex aspect-video h-full min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-center transition-colors"
            :class="busy ? 'pointer-events-none opacity-60' : ''"
          >
            <ImagePlus class="text-brand-600 size-6" aria-hidden="true" />
            <span class="text-charcoal-700 text-sm font-semibold">
              {{ busy ? 'Uploading…' : 'Add photo' }}
            </span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              class="sr-only"
              :disabled="busy"
              @change="onFile"
            />
          </label>
        </li>
      </ul>

      <p
        v-if="!images.length"
        class="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800"
        role="status"
      >
        Add at least one photo. Until then, visitors see your brand color.
      </p>
    </div>
  </AppCard>
</template>
