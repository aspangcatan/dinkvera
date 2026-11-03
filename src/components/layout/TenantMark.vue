<script setup lang="ts">
import type { TenantBranding } from '@/types/tenant'

/**
 * A tenant's monogram tile. Uses the tenant's own colors directly (not the
 * document brand vars) so lists of several tenants each show their own.
 */
withDefaults(defineProps<{ branding: TenantBranding; size?: 'sm' | 'md' | 'lg' }>(), {
  size: 'md',
})

const sizes = {
  sm: 'size-7 text-[10px] rounded-md',
  md: 'size-9 text-xs rounded-lg',
  lg: 'size-12 text-sm rounded-xl',
}
</script>

<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden font-bold tracking-wide text-white"
    :class="sizes[size]"
    :style="{ background: branding.primary }"
    aria-hidden="true"
  >
    {{ branding.monogram }}
    <span
      class="absolute right-0 bottom-0 size-2.5 rounded-tl-md"
      :style="{ background: branding.accent }"
    />
  </span>
</template>
