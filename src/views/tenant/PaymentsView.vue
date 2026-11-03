<script setup lang="ts">
import { Image as ImageIcon } from '@lucide/vue'
import { computed, ref } from 'vue'

import BookingDetailModal from '@/components/booking/BookingDetailModal.vue'
import ProofModal from '@/components/booking/ProofModal.vue'
import BarList from '@/components/charts/BarList.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import StatTile from '@/components/ui/StatTile.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { useQuery } from '@/composables/useQuery'
import {
  approvePayment,
  listPayments,
  refundPayment,
  rejectPayment,
} from '@/services/paymentService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { PaymentRecordStatus } from '@/types/booking'
import type { PaymentMethod } from '@/types/tenant'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { addDays, formatRelative, formatShortDate, todayISO } from '@/utils/dates'
import { groupPayments, type PaymentGroup } from '@/utils/bookingGroups'
import { paymentMethodLabels } from '@/utils/labels'

const store = useTenantStore()
const toast = useToastStore()
const { bookingsVersion } = useNewBooking()

type Tab = 'pending' | 'all' | 'refunded' | 'failed'
const tab = ref<Tab>('all')
const method = ref<PaymentMethod | ''>('')
const locationId = ref('')
const search = ref('')
const from = addDays(todayISO(), -30)

const payments = useQuery(
  () =>
    listPayments(store.tenant!.id, { from, method: method.value, locationId: locationId.value }),
  [method, locationId, bookingsVersion],
)
// The review queue isn't limited to 30 days.
const queue = useQuery(
  () => listPayments(store.tenant!.id, { status: 'pending' }),
  [bookingsVersion],
)

const statusFor: Record<Tab, PaymentRecordStatus | null> = {
  pending: 'pending',
  all: null,
  refunded: 'refunded',
  failed: 'failed',
}
const source = computed(
  () => (tab.value === 'pending' ? queue.data.value : payments.data.value) ?? [],
)
// One line per transfer: a multi-date booking's payment rows are combined.
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  const s = statusFor[tab.value]
  return groupPayments(source.value).filter(
    (p) =>
      (!s || p.status === s) &&
      (!q ||
        p.customerName.toLowerCase().includes(q) ||
        p.bookingReference.toLowerCase().includes(q) ||
        p.reference.toLowerCase().includes(q)),
  )
})

const tabs = computed(() => [
  {
    value: 'all' as Tab,
    label: 'Last 30 days',
    count: groupPayments(payments.data.value ?? []).length,
  },
  {
    value: 'pending' as Tab,
    label: 'Needs review',
    count: groupPayments(queue.data.value ?? []).length,
  },
  {
    value: 'refunded' as Tab,
    label: 'Refunded',
    count: groupPayments(payments.data.value ?? []).filter((p) => p.status === 'refunded').length,
  },
  {
    value: 'failed' as Tab,
    label: 'Failed',
    count: groupPayments(payments.data.value ?? []).filter((p) => p.status === 'failed').length,
  },
])

const totals = computed(() => {
  const all = payments.data.value ?? []
  const paid = all.filter((p) => p.status === 'paid')
  const byMethod = new Map<PaymentMethod, number>()
  for (const p of paid) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount)
  return {
    collected: paid.reduce((s, p) => s + p.amount, 0),
    refunded: all.filter((p) => p.status === 'refunded').reduce((s, p) => s + p.amount, 0),
    count: groupPayments(paid).length,
    byMethod: [...byMethod.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([key, value]) => ({ key, label: paymentMethodLabels[key], value })),
  }
})

const columns: Column<PaymentGroup>[] = [
  { key: 'createdAt', label: 'Date', sortable: true },
  { key: 'customerName', label: 'Customer', sortable: true },
  { key: 'bookingReference', label: 'Booking', hideBelow: 'md' },
  { key: 'method', label: 'Method', sortable: true, hideBelow: 'sm' },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'amount', label: 'Amount', align: 'right', sortable: true },
  { key: 'actions', label: '', align: 'right' },
]

const busyId = ref<string | null>(null)
const refunding = ref<PaymentGroup | null>(null)
const viewing = ref<PaymentGroup | null>(null)
const bookingId = ref<string | null>(null)

async function act(p: PaymentGroup, action: 'approve' | 'reject' | 'refund'): Promise<void> {
  busyId.value = p.id
  try {
    if (action === 'approve') await approvePayment(p.id)
    if (action === 'reject') await rejectPayment(p.id)
    // Approve/reject cover the whole transfer already; refunds go row by row.
    if (action === 'refund') for (const id of p.ids) await refundPayment(id)
    toast.show(
      {
        approve: `Payment approved — ${p.bookingReference} confirmed`,
        reject: 'Payment rejected',
        refund: `${formatPHP(p.amount)} refunded`,
      }[action],
    )
    refunding.value = null
    viewing.value = null
    await Promise.all([payments.refresh(), queue.refresh()])
  } catch (e) {
    toast.error(e)
  } finally {
    busyId.value = null
  }
}
</script>

<template>
  <div>
    <PageHeader
      title="Payments"
      description="Money collected for court bookings, and transfers waiting for review."
    />

    <div class="mb-6 grid gap-3 lg:grid-cols-4">
      <StatTile
        label="Collected (30 days)"
        :value="formatPHP(totals.collected)"
        :hint="`${totals.count} payments`"
      />
      <StatTile
        label="Refunded (30 days)"
        :value="formatPHP(totals.refunded)"
        hint="Back to customers"
      />
      <StatTile
        label="Waiting for review"
        :value="queue.data.value ? String(groupPayments(queue.data.value).length) : '—'"
        hint="GCash / transfer proofs"
      />
      <AppCard title="By method" class="row-span-1">
        <BarList :items="totals.byMethod.slice(0, 3)" :format-value="formatPHP" />
      </AppCard>
    </div>

    <AppCard :padded="false">
      <div class="px-4 pt-2">
        <AppTabs v-model="tab" :tabs="tabs" label="Payment status" />
      </div>
      <div class="grid gap-3 p-4 sm:grid-cols-3">
        <SearchInput v-model="search" placeholder="Customer or reference" />
        <AppSelect
          v-model="method"
          label="Method"
          hide-label
          placeholder="All methods"
          :options="
            store.tenant!.bookingRules.paymentMethods.map((m) => ({
              value: m,
              label: paymentMethodLabels[m],
            }))
          "
        />
        <AppSelect
          v-model="locationId"
          label="Location"
          hide-label
          placeholder="All locations"
          :options="store.locations.map((l) => ({ value: l.id, label: l.name }))"
        />
      </div>
      <DataTable
        label="Payments"
        :columns="columns"
        :rows="rows"
        :row-key="(p) => p.id"
        :loading="payments.loading.value && !payments.data.value"
        :page-size="15"
        :default-sort="{ key: 'createdAt', dir: 'desc' }"
        :empty-title="tab === 'pending' ? 'Nothing to review' : 'No payments match'"
        :empty-description="
          tab === 'pending' ? 'New GCash and transfer proofs will show up here.' : ''
        "
      >
        <template #cell-createdAt="{ row }">
          <p class="text-charcoal-700 whitespace-nowrap">{{ formatShortDate(row.createdAt) }}</p>
          <p class="text-charcoal-400 text-xs">{{ formatRelative(row.createdAt) }}</p>
        </template>
        <template #cell-customerName="{ row }">
          <span class="text-charcoal-700">{{ row.customerName }}</span>
        </template>
        <template #cell-bookingReference="{ row }">
          <button
            type="button"
            class="text-brand-700 font-mono text-xs font-semibold hover:underline"
            @click="bookingId = row.bookingId"
          >
            {{ row.bookingReference }}
          </button>
        </template>
        <template #cell-method="{ row }">
          {{ paymentMethodLabels[row.method] }}
          <span class="text-charcoal-400 block font-mono text-[11px]">{{ row.reference }}</span>
        </template>
        <template #cell-status="{ row }"
          ><StatusBadge kind="paymentRecord" :value="row.status"
        /></template>
        <template #cell-amount="{ row }">
          <span class="tabular text-charcoal-700 font-medium">{{ formatPHP(row.amount) }}</span>
        </template>
        <template #cell-actions="{ row }">
          <div v-if="row.status === 'pending'" class="flex items-center justify-end gap-1.5">
            <span v-if="!row.proofPath" class="text-charcoal-400 text-xs">No screenshot</span>
            <AppButton
              size="sm"
              :variant="row.proofPath ? 'primary' : 'outline'"
              @click="viewing = row"
            >
              <template #icon-left><ImageIcon class="size-3.5" aria-hidden="true" /></template>
              {{ row.proofPath ? 'View proof' : 'Review' }}
            </AppButton>
          </div>
          <div v-else class="flex justify-end gap-1">
            <AppButton v-if="row.proofPath" size="sm" variant="ghost" @click="viewing = row">
              Proof
            </AppButton>
            <AppButton
              v-if="row.status === 'paid'"
              size="sm"
              variant="ghost"
              @click="refunding = row"
              >Refund</AppButton
            >
          </div>
        </template>
      </DataTable>
    </AppCard>

    <ConfirmDialog
      :open="refunding !== null"
      title="Refund this payment?"
      :message="`${formatPHP(refunding?.amount ?? 0)} goes back to ${refunding?.customerName} via ${refunding ? paymentMethodLabels[refunding.method] : ''}. The booking stays on the calendar unless you cancel it.`"
      confirm-label="Refund"
      danger
      :loading="busyId === refunding?.id"
      @cancel="refunding = null"
      @confirm="refunding && act(refunding, 'refund')"
    />
    <ProofModal
      :payment="viewing"
      :busy="busyId === viewing?.id"
      @close="viewing = null"
      @approve="viewing && act(viewing, 'approve')"
      @reject="viewing && act(viewing, 'reject')"
    />
    <BookingDetailModal
      :booking-id="bookingId"
      @close="bookingId = null"
      @changed="payments.refresh()"
    />
  </div>
</template>
