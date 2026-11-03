import { onBeforeUnmount, watchEffect } from 'vue'

import type { TenantBranding } from '@/types/tenant'

/**
 * Applies a tenant's brand colors to the whole document while the calling
 * layout is mounted. Set on <html> (not the layout root) so teleported
 * modals pick them up too. Unmounting restores the platform defaults.
 */
export function useBrandTheme(
  branding: () => Pick<TenantBranding, 'primary' | 'accent'> | null | undefined,
) {
  const root = document.documentElement

  watchEffect(() => {
    const b = branding()
    if (!b) return
    root.style.setProperty('--tenant-primary', b.primary)
    root.style.setProperty('--tenant-accent', b.accent)
  })

  onBeforeUnmount(() => {
    root.style.removeProperty('--tenant-primary')
    root.style.removeProperty('--tenant-accent')
  })
}
