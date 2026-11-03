<script setup lang="ts">
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarCheck,
  CircleDollarSign,
  CreditCard,
  Sparkles,
  Store,
  TrendingUp,
  UserPlus,
  Wallet,
} from '@lucide/vue'
import { computed } from 'vue'

import BarChart from '@/components/charts/BarChart.vue'
import BarList from '@/components/charts/BarList.vue'
import LineChart from '@/components/charts/LineChart.vue'
import TenantMark from '@/components/layout/TenantMark.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ErrorState from '@/components/ui/ErrorState.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useQuery } from '@/composables/useQuery'
import { getPlatformOverview, listPlatformActivity } from '@/services/analyticsService'
import type { ActivityKind } from '@/mocks/analytics'
import { formatPHP, formatPHPCompact } from '@/utils/currency'
import {
  daysBetween,
  formatMonth,
  formatMonthShort,
  formatRelative,
  formatShortDate,
  todayISO,
} from '@/utils/dates'
import { formatNumber, percentChange } from '@/utils/format'
import { usageLevel } from '@/utils/usage'

const { data, loading, error, refresh } = useQuery(getPlatformOverview)
const { data: activity } = useQuery(() => listPlatformActivity())

const tenantName = (id: string) => data.value?.rows.find((r) => r.tenant.id === id)?.tenant

/** Businesses that need someone to act: overdue, trial ending, at a plan limit. */
const attention = computed(() => {
  const rows = data.value?.rows ?? []
  const items: {
    id: string
    tenantId: string
    slug: string
    text: string
    tone: 'danger' | 'warning' | 'info'
  }[] = []
  for (const r of rows) {
    if (r.subscription?.status === 'past_due') {
      items.push({
        id: `${r.tenant.id}-due`,
        tenantId: r.tenant.id,
        slug: r.tenant.slug,
        text: 'Invoice overdue',
        tone: 'danger',
      })
    }
    if (r.subscription?.status === 'trialing' && r.subscription.trialEndsAt) {
      const days = daysBetween(todayISO(), r.subscription.trialEndsAt)
      items.push({
        id: `${r.tenant.id}-trial`,
        tenantId: r.tenant.id,
        slug: r.tenant.slug,
        text: `Trial ends in ${days} days`,
        tone: 'info',
      })
    }
    for (const u of r.usage) {
      const level = usageLevel(u)
      // Single-site plans are always "full" on locations; that's not an upsell signal.
      if (
        level === 'full' &&
        (u.key === 'courts' || (u.key === 'locations' && (u.limit ?? 0) > 1))
      ) {
        items.push({
          id: `${r.tenant.id}-${u.key}`,
          tenantId: r.tenant.id,
          slug: r.tenant.slug,
          text: `${u.label} limit reached (${u.used}/${u.limit}) — upsell`,
          tone: 'warning',
        })
      }
    }
  }
  return items
})

const topTenants = computed(() =>
  [...(data.value?.rows ?? [])].sort((a, b) => b.gmv30d - a.gmv30d).slice(0, 5),
)

const activityIcons: Record<ActivityKind, typeof Sparkles> = {
  signup: UserPlus,
  upgrade: TrendingUp,
  downgrade: TrendingUp,
  payment_failed: AlertTriangle,
  payment: CreditCard,
  suspended: AlertTriangle,
  support: Sparkles,
}
const toneDot = { danger: 'bg-red-500', warning: 'bg-amber-500', info: 'bg-sky-500' }
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Super admin"
      title="Platform overview"
      description="Revenue, growth and the health of every business on CourtDesk."
    />

    <ErrorState v-if="error" :message="error" @retry="refresh" />
    <LoadingState v-else-if="loading || !data" :rows="8" />

    <div v-else class="space-y-6">
      <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Monthly recurring revenue"
          :value="formatPHP(data.mrr)"
          :delta="percentChange(data.mrr, data.previousMrr)"
          delta-label="vs last month"
          :icon="CircleDollarSign"
          :trend="data.mrrSeries.map((p) => p.mrr)"
        />
        <StatTile
          label="Paying businesses"
          :value="formatNumber(data.tenants.active + data.tenants.pastDue)"
          :hint="`${data.tenants.trialing} on trial · ${data.tenants.suspended} suspended`"
          :icon="Store"
        />
        <StatTile
          label="Booking volume (30 days)"
          :value="formatPHPCompact(data.gmv30d)"
          :delta="percentChange(data.gmv30d, data.previousGmv30d)"
          delta-label="vs prior 30 days"
          :icon="Wallet"
        />
        <StatTile
          label="Court bookings (30 days)"
          :value="formatNumber(data.bookings30d)"
          hint="Across all businesses"
          :icon="CalendarCheck"
        />
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard
          class="lg:col-span-2"
          title="Monthly recurring revenue"
          :description="`ARR run-rate ${formatPHP(data.arr)}`"
        >
          <LineChart
            label="Monthly recurring revenue, last 12 months"
            :labels="data.mrrSeries.map((p) => formatMonthShort(p.month))"
            :tooltip-labels="data.mrrSeries.map((p) => formatMonth(p.month))"
            :series="[
              {
                name: 'MRR',
                values: data.mrrSeries.map((p) => p.mrr),
                color: 'var(--color-forest-500)',
              },
            ]"
            :format-value="formatPHP"
            :format-tick="formatPHPCompact"
          />
        </AppCard>

        <AppCard title="Needs attention" :padded="false">
          <ul v-if="attention.length" class="divide-charcoal-100 divide-y">
            <li v-for="a in attention" :key="a.id">
              <RouterLink
                :to="`/admin/tenants/${a.tenantId}`"
                class="hover:bg-charcoal-50 flex items-center gap-3 px-5 py-3"
              >
                <TenantMark
                  v-if="tenantName(a.tenantId)"
                  :branding="tenantName(a.tenantId)!.branding"
                  size="sm"
                />
                <div class="min-w-0 flex-1">
                  <p class="text-charcoal-700 truncate text-sm font-medium">
                    {{ tenantName(a.tenantId)?.name }}
                  </p>
                  <p class="text-charcoal-400 flex items-center gap-1.5 text-xs">
                    <span
                      class="size-1.5 rounded-full"
                      :class="toneDot[a.tone]"
                      aria-hidden="true"
                    />
                    {{ a.text }}
                  </p>
                </div>
                <ArrowUpRight class="text-charcoal-300 size-4" aria-hidden="true" />
              </RouterLink>
            </li>
          </ul>
          <p v-else class="text-charcoal-400 px-5 py-8 text-center text-sm">
            All businesses are healthy.
          </p>
        </AppCard>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard
          class="lg:col-span-2"
          title="Booking volume processed"
          description="Paid court bookings across all businesses, by week (current week so far)"
        >
          <BarChart
            label="Paid booking volume by week"
            :data="
              data.gmvSeries.map((p) => ({
                label: formatShortDate(p.weekStart),
                detail: `Week of ${formatShortDate(p.weekStart)} · ${formatNumber(p.bookings)} bookings`,
                value: p.gmv,
              }))
            "
            :highlight="data.gmvSeries.length - 1"
            :format-value="formatPHP"
            :format-tick="formatPHPCompact"
          />
        </AppCard>
        <AppCard title="MRR by plan">
          <BarList
            :items="
              data.planMix.map((p) => ({
                key: p.planId,
                label: p.name,
                sublabel: `${p.tenants} ${p.tenants === 1 ? 'business' : 'businesses'}`,
                value: p.mrr,
              }))
            "
            :format-value="formatPHP"
          />
        </AppCard>
      </div>

      <div class="grid gap-6 lg:grid-cols-3">
        <AppCard class="lg:col-span-2" title="Top businesses by booking volume" :padded="false">
          <template #actions>
            <RouterLink
              to="/admin/tenants"
              class="text-brand-700 text-xs font-semibold hover:underline"
            >
              View all
            </RouterLink>
          </template>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-charcoal-400 border-charcoal-100 border-b text-xs">
                  <th class="px-5 py-2.5 text-left font-medium">Business</th>
                  <th class="px-4 py-2.5 text-left font-medium">Plan</th>
                  <th class="hidden px-4 py-2.5 text-right font-medium sm:table-cell">Courts</th>
                  <th class="px-4 py-2.5 text-right font-medium">Bookings</th>
                  <th class="px-5 py-2.5 text-right font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="r in topTenants"
                  :key="r.tenant.id"
                  class="border-charcoal-100/70 hover:bg-charcoal-50/60 border-b last:border-0"
                >
                  <td class="px-5 py-3">
                    <RouterLink
                      :to="`/admin/tenants/${r.tenant.id}`"
                      class="flex items-center gap-3"
                    >
                      <TenantMark :branding="r.tenant.branding" size="sm" />
                      <span class="text-charcoal-700 font-medium">{{ r.tenant.name }}</span>
                    </RouterLink>
                  </td>
                  <td class="text-charcoal-500 px-4 py-3">{{ r.plan?.name }}</td>
                  <td class="tabular text-charcoal-500 hidden px-4 py-3 text-right sm:table-cell">
                    {{ r.courts }}
                  </td>
                  <td class="tabular text-charcoal-600 px-4 py-3 text-right">
                    {{ formatNumber(r.bookings30d) }}
                  </td>
                  <td class="tabular text-charcoal-700 px-5 py-3 text-right font-medium">
                    {{ formatPHP(r.gmv30d) }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </AppCard>

        <AppCard title="Recent activity" :padded="false">
          <ul class="divide-charcoal-100 divide-y">
            <li v-for="a in (activity ?? []).slice(0, 7)" :key="a.id" class="flex gap-3 px-5 py-3">
              <span
                class="bg-charcoal-50 text-charcoal-400 flex size-8 shrink-0 items-center justify-center rounded-lg"
              >
                <component :is="activityIcons[a.kind]" class="size-4" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <p class="text-charcoal-700 text-sm">
                  <span class="font-medium">{{ tenantName(a.tenantId)?.name ?? 'Business' }}</span>
                </p>
                <p class="text-charcoal-400 text-xs">{{ a.message }}</p>
                <p class="text-charcoal-300 mt-0.5 text-[11px]">{{ formatRelative(a.at) }}</p>
              </div>
            </li>
          </ul>
        </AppCard>
      </div>

      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="s in [
            { label: 'Active', value: data.tenants.active, kind: 'active' },
            { label: 'Trial', value: data.tenants.trialing, kind: 'trialing' },
            { label: 'Past due', value: data.tenants.pastDue, kind: 'past_due' },
            { label: 'Suspended', value: data.tenants.suspended, kind: 'suspended' },
          ]"
          :key="s.kind"
          class="border-charcoal-100 flex items-center justify-between rounded-xl border bg-white px-4 py-3"
        >
          <StatusBadge kind="tenant" :value="s.kind" />
          <span class="text-charcoal-700 tabular text-lg font-semibold">{{ s.value }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
