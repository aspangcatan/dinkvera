import { useRoute, useRouter } from 'vue-router'

/**
 * Links to sections of the home page ("/#pricing"). On the home page they
 * scroll smoothly, even when the hash is already in the URL; elsewhere
 * they navigate home and the router scrolls to the section.
 */
export function useSectionLink() {
  const route = useRoute()
  const router = useRouter()

  function goToSection(event: MouseEvent, id: string): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
    event.preventDefault()
    if (route.path !== '/') {
      void router.push({ path: '/', hash: `#${id}` })
      return
    }
    const el = document.getElementById(id)
    if (!el) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    // Update the URL without a router navigation, which would scroll again.
    history.replaceState(history.state, '', id === 'top' ? '/' : `/#${id}`)
  }

  return { goToSection }
}
