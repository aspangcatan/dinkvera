<script setup lang="ts">
import { Download, Tags, UserPlus } from '@lucide/vue'
import { computed, ref } from 'vue'

import CustomerModal from '@/components/tenant/CustomerModal.vue'
import CustomerTagsModal from '@/components/tenant/CustomerTagsModal.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppTabs from '@/components/ui/AppTabs.vue'
import DataTable from '@/components/ui/DataTable.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import SearchInput from '@/components/ui/SearchInput.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { useQuery } from '@/composables/useQuery'
import { listCustomers, listCustomerTags, type CustomerSummary } from '@/services/customerService'
import { useTenantStore } from '@/stores/tenant'
import type { Column } from '@/types/ui'
import { formatPHP } from '@/utils/currency'
import { downloadCsv } from '@/utils/csv'
import { addDays, formatShortDate, todayISO } from '@/utils/dates'

const store = useTenantStore()
const { bookingsVersion } = useNewBooking()
const customers = useQuery(() => listCustomers(store.tenant!.id), [bookingsVersion])
/** The business's own tags (the built-in "New" is added where they're shown). */
const tags = useQuery(() => listCustomerTags(store.tenant!.id))
const tagsOpen = ref(false)

function onTagsSaved(saved: string[]): void {
  tags.data.value = saved
  tagsOpen.value = false
}

type Segment = 'all' | 'regulars' | 'new' | 'lapsed' | 'no_shows'
const segment = ref<Segment>('all')
const search = ref('')

const segments: Record<Segment, (c: CustomerSummary) => boolean> = {
  all: () => true,
  regulars: (c) => c.bookings >= 5,
  new: (c) => c.createdAt >= addDays(todayISO(), -30),
  lapsed: (c) => c.bookings > 0 && (!c.lastVisit || c.lastVisit < addDays(todayISO(), -45)),
  no_shows: (c) => c.noShows > 0,
}
const tabs = computed(() =>
  (Object.keys(segments) as Segment[]).map((value) => ({
    value,
    label: {
      all: 'All',
      regulars: 'Regulars (5+)',
      new: 'New this month',
      lapsed: 'Lapsed',
      no_shows: 'Had no-shows',
    }[value],
    count: (customers.data.value ?? []).filter(segments[value]).length,
  })),
)

const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (customers.data.value ?? [])
    .filter(segments[segment.value])
    .filter(
      (c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q) ||
        c.phone.replace(/\s/g, '').includes(q.replace(/\s/g, '')),
    )
})

const columns: Column<CustomerSummary>[] = [
  { key: 'name', label: 'Customer', sortable: true },
  { key: 'phone', label: 'Mobile', hideBelow: 'md' },
  { key: 'tags', label: 'Tags', hideBelow: 'lg' },
  { key: 'bookings', label: 'Bookings', align: 'right', sortable: true },
  { key: 'totalSpent', label: 'Spent', align: 'right', sortable: true, hideBelow: 'sm' },
  {
    key: 'lastVisit',
    label: 'Last visit',
    sortable: true,
    sortBy: (c) => c.lastVisit ?? '',
    hideBelow: 'sm',
  },
]

const selected = ref<CustomerSummary | null>(null)
const modalOpen = ref(false)
function open(c: CustomerSummary | null): void {
  selected.value = c
  modalOpen.value = true
}
async function onSaved(): Promise<void> {
  modalOpen.value = false
  await customers.refresh()
}

function exportCsv(): void {
  downloadCsv(
    `${store.tenant!.slug}-customers-${todayISO()}.csv`,
    ['Name', 'Email', 'Mobile', 'Tags', 'Bookings', 'Total spent (PHP)', 'Last visit', 'No-shows'],
    rows.value.map((c) => [
      c.name,
      c.email,
      c.phone,
      c.tags.join('; '),
      c.bookings,
      c.totalSpent / 100,
      c.lastVisit ?? '',
      c.noShows,
    ]),
  )
}
</script>

<template>
  <div>
    <PageHeader
      title="Customers"
      description="Players who have booked with you, and how often they come back."
    >
      <template #actions>
        <AppButton variant="outline" @click="tagsOpen = true">
          <template #icon-left><Tags class="size-4" aria-hidden="true" /></template>
          Manage tags
        </AppButton>
        <AppButton variant="outline" @click="exportCsv">
          <template #icon-left><Download class="size-4" aria-hidden="true" /></template>
          Export
        </AppButton>
        <AppButton @click="open(null)">
          <template #icon-left><UserPlus class="size-4" aria-hidden="true" /></template>
          Add customer
        </AppButton>
      </template>
    </PageHeader>

    <AppCard :padded="false">
      <div class="px-4 pt-2">
        <AppTabs v-model="segment" :tabs="tabs" label="Customer segments" />
      </div>
      <div class="p-4">
        <SearchInput v-model="search" class="sm:max-w-sm" placeholder="Name, email or mobile" />
      </div>
      <DataTable
        label="Customers"
        :columns="columns"
        :rows="rows"
        :row-key="(c) => c.id"
        :loading="customers.loading.value && !customers.data.value"
        :page-size="15"
        clickable
        :default-sort="{ key: 'bookings', dir: 'desc' }"
        empty-title="No customers here"
        @row-click="open"
      >
        <template #cell-name="{ row }">
          <div class="flex items-center gap-3">
            <UserAvatar :name="row.name" size="sm" />
            <div class="min-w-0">
              <p class="text-charcoal-700 truncate font-medium">{{ row.name }}</p>
              <p class="text-charcoal-400 truncate text-xs">{{ row.email }}</p>
            </div>
          </div>
        </template>
        <template #cell-tags="{ row }">
          <div class="flex flex-wrap gap-1">
            <AppBadge v-for="t in row.tags" :key="t" :dot="false">{{ t }}</AppBadge>
          </div>
        </template>
        <template #cell-bookings="{ row }">
          <span class="tabular">{{ row.bookings }}</span>
          <span v-if="row.noShows" class="ml-1 text-xs text-red-600"
            >({{ row.noShows }} no-show)</span
          >
        </template>
        <template #cell-totalSpent="{ row }">
          <span class="tabular">{{ formatPHP(row.totalSpent) }}</span>
        </template>
        <template #cell-lastVisit="{ row }">
          <span class="text-charcoal-500">{{
            row.lastVisit ? formatShortDate(row.lastVisit) : '—'
          }}</span>
        </template>
      </DataTable>
    </AppCard>

    <CustomerModal
      :open="modalOpen"
      :customer="selected"
      :tags="tags.data.value ?? []"
      @close="modalOpen = false"
      @saved="onSaved"
    />
    <CustomerTagsModal
      :open="tagsOpen"
      :tags="tags.data.value ?? []"
      @close="tagsOpen = false"
      @saved="onTagsSaved"
    />
  </div>
</template>
