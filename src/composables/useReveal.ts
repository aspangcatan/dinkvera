import { onBeforeUnmount, onMounted, type Ref } from 'vue'

/**
 * Fades `[data-reveal]` elements inside `root` in as they scroll into view,
 * including ones rendered later (e.g. after data loads). The hidden state
 * only applies without reduced motion (see main.css), and anything already
 * on screen is revealed straight away.
 */
export function useReveal(root: Ref<HTMLElement | null>): void {
  let io: IntersectionObserver | null = null
  let mo: MutationObserver | null = null

  function watchNew(): void {
    root.value
      ?.querySelectorAll<HTMLElement>('[data-reveal]:not(.is-revealed)')
      .forEach((el) => (io ? io.observe(el) : el.classList.add('is-revealed')))
  }

  onMounted(() => {
    if ('IntersectionObserver' in window) {
      io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue
            entry.target.classList.add('is-revealed')
            io?.unobserve(entry.target)
          }
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
      )
    }
    watchNew()
    if (root.value) {
      // Observing an element twice is a no-op, so re-scanning is safe.
      mo = new MutationObserver(watchNew)
      mo.observe(root.value, { childList: true, subtree: true })
    }
  })

  onBeforeUnmount(() => {
    io?.disconnect()
    mo?.disconnect()
  })
}
