<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import TenantMark from '@/components/layout/TenantMark.vue'
import PlanRequestsCard from '@/components/platform/PlanRequestsCard.vue'
import AppCard from '@/components/ui/AppCard.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useQuery } from '@/composables/useQuery'
import { getPlatformOverview, type TenantOverviewRow } from '@/services/analyticsService'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { daysBetween, formatLongDate, todayISO } from '@/utils/dates'

const router = useRouter()
const { data, loading, refresh } = useQuery(getPlatformOverview)

type Tab = 'all' | 'active' | 'trialing' | 'past_due' | 'cancelled'
const tab = ref<Tab>('all')

const subs = computed(() => (data.value?.rows ?? []).filter((r) => r.subscription))
const count = (s: Tab) =>
  subs.value.filter((r) => s === 'all' || r.subscription!.status === s).length
const tabs = computed(() =>
  (['all', 'active', 'trialing', 'past_due', 'cancelled'] as Tab[]).map((value) => ({
    value,
    label: {
      all: 'All',
      active: 'Active',
      trialing: 'Trials',
      past_due: 'Past due',
      cancelled: 'Cancelled',
    }[value],
    count: count(value),
  })),
)
const rows = computed(() =>
  subs.value.filter((r) => tab.value === 'all' || r.subscription!.status === tab.value),
)

const annualShare = computed(() => {
  const paying = subs.value.filter((r) => r.mrr > 0)
  return paying.length
    ? paying.filter((r) => r.subscription!.billingCycle === 'annual').length / paying.length
    : 0
})
const arpa = computed(() => {
  const paying = subs.value.filter((r) => r.mrr > 0)
  return paying.length ? paying.reduce((s, r) => s + r.mrr, 0) / paying.length : 0
})

const columns: Column<TenantOverviewRow>[] = [
  { key: 'business', label: 'Business', sortable: true, sortBy: (r) => r.tenant.name },
  { key: 'plan', label: 'Plan', sortable: true, sortBy: (r) => r.plan?.monthlyPrice ?? 0 },
  { key: 'status', label: 'Status', sortable: true, sortBy: (r) => r.subscription!.status },
  { key: 'cycle', label: 'Billing', hideBelow: 'sm' },
  {
    key: 'renews',
    label: 'Renews / ends',
    sortable: true,
    sortBy: (r) => r.subscription!.currentPeriodEnd,
    hideBelow: 'md',
  },
  { key: 'mrr', label: 'MRR', align: 'right', sortable: true },
]

function renewal(r: TenantOverviewRow): string {
  const s = r.subscription!
  if (s.status === 'trialing' && s.trialEndsAt) {
    return `Trial ends in ${daysBetween(todayISO(), s.trialEndsAt)} days`
  }
  if (s.cancelAtPeriodEnd) return `Ended ${formatLongDate(s.currentPeriodEnd)}`
  return formatLongDate(s.currentPeriodEnd)
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Customers"
      title="Subscriptions"
      description="What every business pays, and when it renews."
    />

    <PlanRequestsCard class="mb-6" @decided="refresh" />

    <div v-if="data" class="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label="MRR" :value="formatPHP(data.mrr)" hint="Active + past-due" />
      <StatTile label="ARR run-rate" :value="formatPHP(data.arr)" hint="MRR × 12" />
      <StatTile
        label="Avg. revenue per business"
        :value="formatPHP(arpa)"
        hint="Paying businesses"
      />
      <StatTile
        label="On annual billing"
        :value="`${Math.round(annualShare * 100)}%`"
        hint="Of paying businesses"
      />
    </div>

    <AppCard :padded="false">
      <div class="px-4 pt-2">
        <AppTabs v-model="tab" :tabs="tabs" label="Subscription status" />
      </div>
      <DataTable
        label="Subscriptions"
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.subscription!.id"
        :loading="loading"
        clickable
        :default-sort="{ key: 'mrr', dir: 'desc' }"
        empty-title="No subscriptions here"
        @row-click="(r) => router.push(`/admin/tenants/${r.tenant.id}`)"
      >
        <template #cell-business="{ row }">
          <div class="flex items-center gap-3">
            <TenantMark :branding="row.tenant.branding" size="sm" />
            <span class="text-charcoal-700 font-medium">{{ row.tenant.name }}</span>
          </div>
        </template>
        <template #cell-plan="{ row }">{{ row.plan?.name }}</template>
        <template #cell-status="{ row }">
          <StatusBadge kind="subscription" :value="row.subscription!.status" />
        </template>
        <template #cell-cycle="{ row }">
          <span class="capitalize">{{ row.subscription!.billingCycle }}</span>
        </template>
        <template #cell-renews="{ row }">
          <span class="text-charcoal-500">{{ renewal(row) }}</span>
        </template>
        <template #cell-mrr="{ row }">
          <span class="tabular text-charcoal-700 font-medium">{{
            row.mrr ? formatPHP(row.mrr) : '—'
          }}</span>
        </template>
      </DataTable>
    </AppCard>
  </div>
</template>
