import type { Component } from 'vue'

/** Column definition for DataTable. */
export interface Column<Row> {
  key: string
  label: string
  sortable?: boolean
  align?: 'left' | 'right' | 'center'
  /** Value used for sorting; defaults to `row[key]`. */
  sortBy?: (row: Row) => string | number
  /** Hide on narrow screens so phone tables stay readable. */
  hideBelow?: 'sm' | 'md' | 'lg'
  /** Extra classes for the cells. */
  class?: string
}

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'brand'

/** Sidebar navigation for the dashboard shells. */
export interface NavItem {
  to: string
  label: string
  icon: Component
  /** Only active on an exact match (dashboard home links). */
  exact?: boolean
  badge?: string | number | null
}

export interface NavGroup {
  label: string
  items: NavItem[]
}
