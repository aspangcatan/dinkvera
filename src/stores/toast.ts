import { defineStore } from 'pinia'

export type ToastTone = 'success' | 'error' | 'info'

export interface Toast {
  id: number
  tone: ToastTone
  message: string
}

let nextId = 1

/** Short confirmations after saves ("Court saved"), shown by ToastHost. */
export const useToastStore = defineStore('toast', {
  state: () => ({ toasts: [] as Toast[] }),
  actions: {
    show(message: string, tone: ToastTone = 'success'): void {
      const id = nextId++
      this.toasts.push({ id, tone, message })
      setTimeout(() => this.dismiss(id), tone === 'error' ? 6000 : 3500)
    },
    error(error: unknown): void {
      this.show(error instanceof Error ? error.message : 'Something went wrong.', 'error')
    },
    dismiss(id: number): void {
      this.toasts = this.toasts.filter((t) => t.id !== id)
    },
  },
})
