import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * Tracks an element's width so charts draw in real pixels (text and 2px
 * lines stay crisp instead of scaling with a viewBox).
 */
export function useElementWidth(target: Ref<HTMLElement | null>, fallback = 600) {
  const width = ref(fallback)
  let observer: ResizeObserver | null = null

  onMounted(() => {
    if (!target.value) return
    width.value = target.value.clientWidth || fallback
    observer = new ResizeObserver(([entry]) => {
      if (entry) width.value = Math.max(entry.contentRect.width, 120)
    })
    observer.observe(target.value)
  })

  onBeforeUnmount(() => observer?.disconnect())

  return width
}
