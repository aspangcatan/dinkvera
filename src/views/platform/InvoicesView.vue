<script setup lang="ts">
import { RefreshCw } from '@lucide/vue'
import { computed, ref } from 'vue'

import TenantMark from '@/components/layout/TenantMark.vue'
import InvoiceReviewModal from '@/components/platform/InvoiceReviewModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useInvoicesToReview } from '@/composables/useInvoicesToReview'
import { useQuery } from '@/composables/useQuery'
import { useRefreshOnReturn } from '@/composables/useRefreshOnReturn'
import {
  listInvoices,
  listPlans,
  markInvoicePaid,
  runBillingCycle,
} from '@/services/subscriptionService'
import { listTenants } from '@/services/tenantService'
import { useToastStore } from '@/stores/toast'
import type { Invoice } from '@/types/billing'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { formatShortDate } from '@/utils/dates'
import { invoiceDisplayStatus, invoiceStatus } from '@/utils/labels'

const toast = useToastStore()
// "review" = proof sent and waiting; filtered here since it isn't a stored status.
const status = ref<Invoice['status'] | 'review' | ''>('')
const search = ref('')
const invoices = useQuery(
  () => listInvoices({ status: status.value === 'review' ? '' : status.value }),
  [status],
)
const { data: tenants } = useQuery(listTenants)
const { data: plans } = useQuery(listPlans)

const tenantOf = (id: string) => tenants.value?.find((t) => t.id === id)
const planName = (id: string) => plans.value?.find((p) => p.id === id)?.name ?? id

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (invoices.data.value ?? []).filter(
    (i) =>
      (status.value !== 'review' || invoiceDisplayStatus(i) === 'review') &&
      (!q ||
        i.number.toLowerCase().includes(q) ||
        (tenantOf(i.tenantId)?.name.toLowerCase().includes(q) ?? false)),
  )
})

const totals = computed(() => {
  const all = invoices.data.value ?? []
  const sum = (s: Invoice['status']) =>
    all.filter((i) => i.status === s).reduce((t, i) => t + i.amount, 0)
  return {
    paid: sum('paid'),
    overdue: sum('overdue'),
    review: all.filter((i) => invoiceDisplayStatus(i) === 'review').length,
  }
})

const columns: Column<Invoice>[] = [
  { key: 'number', label: 'Invoice', sortable: true },
  {
    key: 'tenant',
    label: 'Business',
    sortable: true,
    sortBy: (i) => tenantOf(i.tenantId)?.name ?? '',
  },
  { key: 'plan', label: 'Plan', hideBelow: 'md' },
  { key: 'issuedAt', label: 'Issued', sortable: true, hideBelow: 'sm' },
  { key: 'dueAt', label: 'Due', sortable: true, hideBelow: 'lg' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'amount', label: 'Amount', align: 'right', sortable: true },
  { key: 'actions', label: '', align: 'right' },
]

// Payments confirmed while you were elsewhere show up when you come back.
useRefreshOnReturn(() => invoices.refresh({ silent: true }))

// Same job as the daily schedule; handy after changing dates or for testing.
const running = ref(false)
async function runBilling(): Promise<void> {
  running.value = true
  try {
    const r = await runBillingCycle()
    const parts = [
      r.invoicesIssued && `${r.invoicesIssued} invoice${r.invoicesIssued === 1 ? '' : 's'} issued`,
      r.trialsEnded && `${r.trialsEnded} trial${r.trialsEnded === 1 ? '' : 's'} ended`,
      r.overdue && `${r.overdue} marked overdue`,
      r.cancelled && `${r.cancelled} cancelled`,
    ].filter(Boolean)
    toast.show(
      parts.length ? `Billing done: ${parts.join(', ')}` : 'Billing done — nothing was due',
    )
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    running.value = false
  }
}

const reviewing = ref<Invoice | null>(null)
const markingPaid = ref<Invoice | null>(null)
const busy = ref(false)

/** Paid some other way (e.g. cash), so there's no proof to review. */
async function pay(invoice: Invoice): Promise<void> {
  busy.value = true
  try {
    await markInvoicePaid(invoice.id)
    toast.show(`${invoice.number} marked as paid`)
    markingPaid.value = null
    await refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function refresh(): Promise<void> {
  await Promise.all([invoices.refresh(), useInvoicesToReview().refresh()])
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Customers"
      title="Invoices"
      description="CourtDesk subscription invoices. New ones are issued automatically every day at 12:05 AM (renewals, trials ending, approved plan changes)."
    >
      <template #actions>
        <AppButton variant="outline" :loading="running" @click="runBilling">
          <template #icon-left><RefreshCw class="size-4" aria-hidden="true" /></template>
          Run billing now
        </AppButton>
      </template>
    </PageHeader>

    <div class="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatTile
        label="Collected"
        :value="formatPHP(totals.paid)"
        hint="Paid invoices in this view"
      />
      <StatTile label="Overdue" :value="formatPHP(totals.overdue)" hint="Needs follow-up" />
      <StatTile
        label="To review"
        :value="String(totals.review)"
        hint="Payment proofs waiting for you"
      />
    </div>

    <AppCard :padded="false">
      <div class="flex flex-col gap-3 p-4 sm:flex-row">
        <SearchInput
          v-model="search"
          class="sm:max-w-xs sm:flex-1"
          placeholder="Invoice no. or business"
        />
        <AppSelect
          v-model="status"
          label="Status"
          hide-label
          placeholder="All statuses"
          :options="Object.entries(invoiceStatus).map(([value, s]) => ({ value, label: s.label }))"
          class="sm:w-44"
        />
      </div>
      <DataTable
        label="Invoices"
        :columns="columns"
        :rows="rows"
        :row-key="(i) => i.id"
        :loading="invoices.loading.value"
        :page-size="12"
        :default-sort="{ key: 'issuedAt', dir: 'desc' }"
        empty-title="No invoices match"
      >
        <template #cell-number="{ row }">
          <span class="text-charcoal-700 font-medium">{{ row.number }}</span>
        </template>
        <template #cell-tenant="{ row }">
          <RouterLink
            v-if="tenantOf(row.tenantId)"
            :to="`/admin/tenants/${row.tenantId}`"
            class="flex items-center gap-2 hover:underline"
          >
            <TenantMark :branding="tenantOf(row.tenantId)!.branding" size="sm" />
            {{ tenantOf(row.tenantId)!.name }}
          </RouterLink>
        </template>
        <template #cell-plan="{ row }">{{ planName(row.planId) }}</template>
        <template #cell-issuedAt="{ row }">{{ formatShortDate(row.issuedAt) }}</template>
        <template #cell-dueAt="{ row }">{{ formatShortDate(row.dueAt) }}</template>
        <template #cell-status="{ row }">
          <StatusBadge kind="invoice" :value="invoiceDisplayStatus(row)" />
          <span v-if="row.paidOnline" class="text-charcoal-400 ml-1.5 text-xs">via PayMongo</span>
        </template>
        <template #cell-amount="{ row }">
          <span class="tabular text-charcoal-700 font-medium">{{ formatPHP(row.amount) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <AppButton
            v-if="invoiceDisplayStatus(row) === 'review'"
            size="sm"
            @click="reviewing = row"
            >Review</AppButton
          >
          <AppButton
            v-else-if="row.status === 'overdue' || row.status === 'open'"
            size="sm"
            variant="outline"
            @click="markingPaid = row"
            >Mark paid</AppButton
          >
        </template>
      </DataTable>
    </AppCard>

    <InvoiceReviewModal
      :open="!!reviewing"
      :invoice="reviewing"
      :business-name="reviewing ? (tenantOf(reviewing.tenantId)?.name ?? '') : ''"
      @close="reviewing = null"
      @decided="((reviewing = null), refresh())"
    />
    <ConfirmDialog
      :open="!!markingPaid"
      title="Mark as paid?"
      :message="`Only do this if ${markingPaid ? (tenantOf(markingPaid.tenantId)?.name ?? 'the business') : ''} paid ${markingPaid ? formatPHP(markingPaid.amount) : ''} some other way, e.g. in cash. Payments with proof are approved with Review.`"
      confirm-label="Mark paid"
      :loading="busy"
      @cancel="markingPaid = null"
      @confirm="pay(markingPaid!)"
    />
  </div>
</template>
