import { ref, shallowRef, watch, type Ref, type ShallowRef, type WatchSource } from 'vue'

export interface QueryState<T> {
  data: ShallowRef<T | null>
  loading: Ref<boolean>
  error: Ref<string | null>
  /** Re-runs the call. `silent`: keep showing the current data meanwhile (no loading state, errors ignored). */
  refresh: (options?: { silent?: boolean }) => Promise<void>
}

/**
 * Runs an async service call, re-running whenever `sources` change.
 * Responses that arrive after a newer request started are dropped, so
 * fast filter changes can't show stale results.
 */
export function useQuery<T>(fetcher: () => Promise<T>, sources: WatchSource[] = []): QueryState<T> {
  const data = shallowRef<T | null>(null)
  const loading = ref(true)
  const error = ref<string | null>(null)
  let requestId = 0

  async function refresh(options: { silent?: boolean } = {}): Promise<void> {
    const id = ++requestId
    if (!options.silent) {
      loading.value = true
      error.value = null
    }
    try {
      const result = await fetcher()
      if (id === requestId) data.value = result
    } catch (e) {
      if (id === requestId && !options.silent) {
        error.value = e instanceof Error ? e.message : 'Could not load data.'
      }
    } finally {
      if (id === requestId) loading.value = false
    }
  }

  if (sources.length) watch(sources, () => void refresh(), { deep: true })
  void refresh()

  return { data, loading, error, refresh }
}
