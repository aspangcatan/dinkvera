<script setup lang="ts">
import { Lock } from '@lucide/vue'

import { useTenantStore } from '@/stores/tenant'
import type { UsageItem } from '@/utils/usage'

/** Shown where a plan limit blocks adding more (courts, locations). */
defineProps<{ item: UsageItem }>()
const store = useTenantStore()
</script>

<template>
  <div
    class="flex flex-wrap items-center gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
  >
    <Lock class="size-4 shrink-0" aria-hidden="true" />
    <p class="flex-1">
      You're using all {{ item.limit }} {{ item.label.toLowerCase() }} on the
      {{ store.plan?.name }} plan.
    </p>
    <RouterLink
      v-if="store.can('billing')"
      :to="`/manage/${store.tenant!.slug}/subscription`"
      class="font-semibold underline"
      >Upgrade</RouterLink
    >
    <span v-else class="text-xs">Ask the owner to upgrade.</span>
  </div>
</template>
