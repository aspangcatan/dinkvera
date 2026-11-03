<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { computed, ref, useTemplateRef } from 'vue'
import { useRouter } from 'vue-router'

import TenantMark from '@/components/layout/TenantMark.vue'
import TenantFormModal from '@/components/platform/TenantFormModal.vue'
import TrialRequestsCard from '@/components/platform/TrialRequestsCard.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useQuery } from '@/composables/useQuery'
import { getPlatformOverview, type TenantOverviewRow } from '@/services/analyticsService'
import { listPlans } from '@/services/subscriptionService'
import type { TrialRequest } from '@/types/billing'
import type { Tenant } from '@/types/tenant'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { formatShortDate } from '@/utils/dates'
import { formatNumber } from '@/utils/format'
import { tenantStatus } from '@/utils/labels'
import { usageLevel } from '@/utils/usage'

const router = useRouter()
const { data, loading } = useQuery(getPlatformOverview)
const { data: plans } = useQuery(listPlans)

const search = ref('')
const status = ref('')
const plan = ref('')
const creating = ref(false)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.rows ?? []).filter(
    (r) =>
      (!q ||
        r.tenant.name.toLowerCase().includes(q) ||
        r.tenant.city.toLowerCase().includes(q) ||
        r.tenant.ownerEmail.toLowerCase().includes(q)) &&
      (!status.value || r.tenant.status === status.value) &&
      (!plan.value || r.plan?.id === plan.value),
  )
})

const columns: Column<TenantOverviewRow>[] = [
  { key: 'name', label: 'Business', sortable: true, sortBy: (r) => r.tenant.name },
  { key: 'status', label: 'Status', sortable: true, sortBy: (r) => r.tenant.status },
  {
    key: 'plan',
    label: 'Plan',
    sortable: true,
    sortBy: (r) => r.plan?.monthlyPrice ?? 0,
    hideBelow: 'sm',
  },
  {
    key: 'venues',
    label: 'Locations / courts',
    align: 'right',
    sortable: true,
    sortBy: (r) => r.courts,
    hideBelow: 'md',
  },
  { key: 'usage', label: 'Plan usage', hideBelow: 'lg' },
  { key: 'bookings30d', label: 'Bookings (30d)', align: 'right', sortable: true, hideBelow: 'md' },
  { key: 'mrr', label: 'MRR', align: 'right', sortable: true },
  {
    key: 'createdAt',
    label: 'Joined',
    sortable: true,
    sortBy: (r) => r.tenant.createdAt,
    hideBelow: 'lg',
  },
]

// "Add business" from a free-trial request pre-fills the form, then marks it converted.
const trialCard = useTemplateRef<InstanceType<typeof TrialRequestsCard>>('trialCard')
const fromRequest = ref<TrialRequest | null>(null)
const initial = computed(() =>
  fromRequest.value
    ? {
        name: fromRequest.value.businessName,
        ownerName: fromRequest.value.contactName,
        ownerEmail: fromRequest.value.email,
        phone: fromRequest.value.phone,
        city: fromRequest.value.city,
        ...(fromRequest.value.planId ? { planId: fromRequest.value.planId } : {}),
      }
    : undefined,
)

function addFromRequest(request: TrialRequest): void {
  fromRequest.value = request
  creating.value = true
}

function closeForm(): void {
  creating.value = false
  fromRequest.value = null
}

async function onCreated(tenant: Tenant): Promise<void> {
  if (fromRequest.value) await trialCard.value?.markConverted(fromRequest.value.id)
  closeForm()
  void router.push(`/admin/tenants/${tenant.id}`)
}

const levelDot = { ok: 'bg-emerald-500', warning: 'bg-amber-500', full: 'bg-red-500' }
function worstUsage(r: TenantOverviewRow) {
  const order = { ok: 0, warning: 1, full: 2 }
  return r.usage
    .map((u) => ({ u, level: usageLevel(u) }))
    .sort((a, b) => order[b.level] - order[a.level])[0]
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Customers"
      title="Businesses"
      description="Every pickleball business on the platform."
    >
      <template #actions>
        <AppButton @click="creating = true">
          <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
          Add business
        </AppButton>
      </template>
    </PageHeader>

    <TrialRequestsCard
      ref="trialCard"
      class="mb-6"
      :plans="plans ?? []"
      @add-business="addFromRequest"
    />

    <AppCard :padded="false">
      <div class="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <SearchInput
          v-model="search"
          class="sm:max-w-xs sm:flex-1"
          placeholder="Search name, city, email"
        />
        <AppSelect
          v-model="status"
          label="Status"
          hide-label
          placeholder="All statuses"
          :options="Object.entries(tenantStatus).map(([value, s]) => ({ value, label: s.label }))"
          class="sm:w-44"
        />
        <AppSelect
          v-model="plan"
          label="Plan"
          hide-label
          placeholder="All plans"
          :options="(plans ?? []).map((p) => ({ value: p.id, label: p.name }))"
          class="sm:w-40"
        />
      </div>
      <DataTable
        label="Businesses"
        :columns="columns"
        :rows="rows"
        :row-key="(r) => r.tenant.id"
        :loading="loading"
        clickable
        :default-sort="{ key: 'mrr', dir: 'desc' }"
        empty-title="No businesses match"
        empty-description="Try a different search or filter."
        @row-click="(r) => router.push(`/admin/tenants/${r.tenant.id}`)"
      >
        <template #cell-name="{ row }">
          <div class="flex items-center gap-3">
            <TenantMark :branding="row.tenant.branding" size="sm" />
            <div class="min-w-0">
              <p class="text-charcoal-700 truncate font-medium">{{ row.tenant.name }}</p>
              <p class="text-charcoal-400 truncate text-xs">{{ row.tenant.city }}</p>
            </div>
          </div>
        </template>
        <template #cell-status="{ row }">
          <StatusBadge kind="tenant" :value="row.tenant.status" />
        </template>
        <template #cell-plan="{ row }">
          {{ row.plan?.name }}
          <span class="text-charcoal-400 text-xs">· {{ row.subscription?.billingCycle }}</span>
        </template>
        <template #cell-venues="{ row }">
          <span class="tabular">{{ row.locations }} / {{ row.courts }}</span>
        </template>
        <template #cell-usage="{ row }">
          <span v-if="worstUsage(row)" class="text-charcoal-500 flex items-center gap-1.5 text-xs">
            <span
              class="size-1.5 rounded-full"
              :class="levelDot[worstUsage(row)!.level]"
              aria-hidden="true"
            />
            {{
              worstUsage(row)!.level === 'ok'
                ? 'Within limits'
                : `${worstUsage(row)!.u.label}: ${worstUsage(row)!.u.used}/${worstUsage(row)!.u.limit}`
            }}
          </span>
        </template>
        <template #cell-bookings30d="{ row }">
          <span class="tabular">{{ formatNumber(row.bookings30d) }}</span>
        </template>
        <template #cell-mrr="{ row }">
          <span class="tabular text-charcoal-700 font-medium">{{
            row.mrr ? formatPHP(row.mrr) : '—'
          }}</span>
        </template>
        <template #cell-createdAt="{ row }">
          <span class="text-charcoal-400">{{ formatShortDate(row.tenant.createdAt) }}</span>
        </template>
      </DataTable>
    </AppCard>

    <TenantFormModal
      :open="creating"
      :plans="plans ?? []"
      :initial="initial"
      @close="closeForm"
      @created="onCreated"
    />
  </div>
</template>
