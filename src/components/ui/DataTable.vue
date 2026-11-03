<script setup lang="ts" generic="T">
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import type { Column } from '@/types/ui'

import EmptyState from './EmptyState.vue'
import LoadingState from './LoadingState.vue'

const props = withDefaults(
  defineProps<{
    columns: Column<T>[]
    rows: T[]
    rowKey: (row: T) => string
    loading?: boolean
    pageSize?: number
    emptyTitle?: string
    emptyDescription?: string
    /** Rows emit `row-click` and look interactive. */
    clickable?: boolean
    /** Initial sort. */
    defaultSort?: { key: string; dir: 'asc' | 'desc' }
    label: string
  }>(),
  {
    loading: false,
    pageSize: 10,
    emptyTitle: 'Nothing here yet',
    emptyDescription: '',
    clickable: false,
    defaultSort: undefined,
  },
)

const emit = defineEmits<{ 'row-click': [row: T] }>()

/** Default cell content: the row's own field named by the column key. */
function cellValue(row: T, key: string): unknown {
  return (row as Record<string, unknown>)[key]
}

const sortKey = ref(props.defaultSort?.key ?? '')
const sortDir = ref<'asc' | 'desc'>(props.defaultSort?.dir ?? 'asc')
const page = ref(1)

// A new filter/search result starts from the first page.
watch(
  () => props.rows,
  () => {
    page.value = 1
  },
)

function toggleSort(column: Column<T>): void {
  if (!column.sortable) return
  if (sortKey.value === column.key) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = column.key
    sortDir.value = 'asc'
  }
}

const sorted = computed(() => {
  const column = props.columns.find((c) => c.key === sortKey.value)
  if (!column) return props.rows
  const value = column.sortBy ?? ((row: T) => cellValue(row, column.key) as string | number)
  const dir = sortDir.value === 'asc' ? 1 : -1
  return [...props.rows].sort((a, b) => {
    const va = value(a)
    const vb = value(b)
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
    return String(va).localeCompare(String(vb)) * dir
  })
})

const pageCount = computed(() => Math.max(1, Math.ceil(sorted.value.length / props.pageSize)))
const visible = computed(() =>
  sorted.value.slice((page.value - 1) * props.pageSize, page.value * props.pageSize),
)
const rangeLabel = computed(() => {
  const total = sorted.value.length
  if (!total) return '0 results'
  const start = (page.value - 1) * props.pageSize + 1
  const end = Math.min(total, page.value * props.pageSize)
  return `${start}–${end} of ${total.toLocaleString('en-PH')}`
})

const hideClass = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
}
const alignClass = { left: 'text-left', right: 'text-right', center: 'text-center' }

function cellClass(column: Column<T>): string[] {
  return [
    alignClass[column.align ?? 'left'],
    column.hideBelow ? hideClass[column.hideBelow] : '',
    column.class ?? '',
  ]
}

function ariaSort(column: Column<T>) {
  if (!column.sortable || sortKey.value !== column.key) return undefined
  return sortDir.value === 'asc' ? 'ascending' : 'descending'
}

function onRowKey(event: KeyboardEvent, row: T): void {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('row-click', row)
  }
}
</script>

<template>
  <div>
    <div class="overflow-x-auto">
      <table class="w-full text-sm" :aria-label="label">
        <thead>
          <tr class="border-charcoal-100 border-b">
            <th
              v-for="column in columns"
              :key="column.key"
              scope="col"
              class="text-charcoal-400 px-4 py-2.5 text-xs font-medium whitespace-nowrap first:pl-5 last:pr-5"
              :class="cellClass(column)"
              :aria-sort="ariaSort(column)"
            >
              <button
                v-if="column.sortable"
                type="button"
                class="hover:text-charcoal-600 inline-flex items-center gap-1"
                :class="sortKey === column.key ? 'text-charcoal-600' : ''"
                @click="toggleSort(column)"
              >
                {{ column.label }}
                <ArrowUp
                  v-if="sortKey === column.key && sortDir === 'asc'"
                  class="size-3"
                  aria-hidden="true"
                />
                <ArrowDown v-else-if="sortKey === column.key" class="size-3" aria-hidden="true" />
                <ChevronsUpDown v-else class="size-3 opacity-50" aria-hidden="true" />
              </button>
              <template v-else>{{ column.label }}</template>
            </th>
          </tr>
        </thead>
        <tbody v-if="!loading">
          <tr
            v-for="row in visible"
            :key="rowKey(row)"
            class="border-charcoal-100/70 border-b last:border-0"
            :class="
              clickable
                ? 'hover:bg-charcoal-50/70 focus-visible:bg-charcoal-50 cursor-pointer focus-visible:outline-none'
                : ''
            "
            :tabindex="clickable ? 0 : undefined"
            @click="clickable && emit('row-click', row)"
            @keydown="clickable && onRowKey($event, row)"
          >
            <td
              v-for="column in columns"
              :key="column.key"
              class="text-charcoal-600 px-4 py-3 align-middle first:pl-5 last:pr-5"
              :class="cellClass(column)"
            >
              <slot :name="`cell-${column.key}`" :row="row">
                {{ cellValue(row, column.key) }}
              </slot>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <LoadingState v-if="loading" :rows="5" />
    <EmptyState v-else-if="!rows.length" :title="emptyTitle" :description="emptyDescription">
      <template v-if="$slots.empty" #action><slot name="empty" /></template>
    </EmptyState>

    <div
      v-if="!loading && rows.length > pageSize"
      class="border-charcoal-100 flex items-center justify-between gap-3 border-t px-5 py-3"
    >
      <p class="text-charcoal-400 tabular text-xs">{{ rangeLabel }}</p>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="text-charcoal-500 hover:bg-charcoal-100 rounded-md p-1.5 disabled:opacity-40"
          :disabled="page === 1"
          aria-label="Previous page"
          @click="page--"
        >
          <ChevronLeft class="size-4" aria-hidden="true" />
        </button>
        <span class="text-charcoal-500 tabular px-2 text-xs">{{ page }} / {{ pageCount }}</span>
        <button
          type="button"
          class="text-charcoal-500 hover:bg-charcoal-100 rounded-md p-1.5 disabled:opacity-40"
          :disabled="page === pageCount"
          aria-label="Next page"
          @click="page++"
        >
          <ChevronRight class="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
</template>
