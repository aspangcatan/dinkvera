import { onBeforeUnmount, onMounted } from 'vue'

/**
 * Calls `refresh` when the person comes back to this page — switching back
 * from another app (e.g. GCash) or browser tab, or refocusing the window —
 * so things like a just-paid invoice update without reloading. At most
 * once every few seconds.
 */
export function useRefreshOnReturn(refresh: () => unknown, minIntervalMs = 3000): void {
  let last = Date.now()

  function onReturn(): void {
    if (document.visibilityState !== 'visible') return
    if (Date.now() - last < minIntervalMs) return
    last = Date.now()
    void refresh()
  }

  onMounted(() => {
    document.addEventListener('visibilitychange', onReturn)
    window.addEventListener('focus', onReturn)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onReturn)
    window.removeEventListener('focus', onReturn)
  })
}
