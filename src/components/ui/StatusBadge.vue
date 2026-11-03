<script setup lang="ts">
import { computed } from 'vue'

import type { BadgeTone } from '@/types/ui'
import * as maps from '@/utils/labels'

import AppBadge from './AppBadge.vue'

type Kind =
  | 'booking'
  | 'payment'
  | 'paymentRecord'
  | 'tenant'
  | 'subscription'
  | 'invoice'
  | 'court'
  | 'location'
  | 'staff'

const props = defineProps<{ kind: Kind; value: string }>()

const map = {
  booking: maps.bookingStatus,
  payment: maps.paymentStatus,
  paymentRecord: maps.paymentRecordStatus,
  tenant: maps.tenantStatus,
  subscription: maps.subscriptionStatus,
  invoice: maps.invoiceStatus,
  court: maps.courtStatus,
  location: maps.locationStatus,
  staff: maps.staffStatus,
} as const

const entry = computed(
  () =>
    (map[props.kind] as Record<string, { label: string; tone: BadgeTone }>)[props.value] ?? {
      label: props.value,
      tone: 'neutral' as BadgeTone,
    },
)
</script>

<template>
  <AppBadge :tone="entry.tone">{{ entry.label }}</AppBadge>
</template>
