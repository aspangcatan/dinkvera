<script setup lang="ts">
import { X } from '@lucide/vue'
import { onMounted, useId, useTemplateRef, watch } from 'vue'

type Size = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    size?: Size
  }>(),
  { description: '', size: 'md' },
)

const emit = defineEmits<{
  close: []
}>()

const dialogRef = useTemplateRef<HTMLDialogElement>('dialog')
const titleId = useId()

watch(
  () => props.open,
  (isOpen) => {
    const dialog = dialogRef.value
    if (!dialog) return
    if (isOpen && !dialog.open) dialog.showModal()
    else if (!isOpen && dialog.open) dialog.close()
  },
  { flush: 'post' },
)

onMounted(() => {
  if (props.open) dialogRef.value?.showModal()
})

const sizeClasses: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

/** Escape asks the parent to close, so `open` stays the single source of truth. */
function onCancel(): void {
  emit('close')
}

/** If the browser closed the dialog anyway, reopen it while it should be open. */
function onNativeClose(): void {
  if (props.open) dialogRef.value?.showModal()
}

function onBackdrop(event: MouseEvent): void {
  if (event.target === dialogRef.value) emit('close')
}
</script>

<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      :aria-labelledby="titleId"
      class="border-charcoal-100 backdrop:bg-charcoal-700/50 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-hidden rounded-2xl border bg-white p-0 shadow-2xl backdrop:backdrop-blur-[2px] open:flex open:flex-col"
      :class="sizeClasses[size]"
      @close="onNativeClose"
      @cancel.prevent="onCancel"
      @mousedown="onBackdrop"
    >
      <div class="border-charcoal-100 flex items-start justify-between gap-4 border-b px-5 py-4">
        <div class="min-w-0">
          <h2 :id="titleId" class="text-charcoal-700 font-sans text-base font-semibold">
            {{ title }}
          </h2>
          <p v-if="description" class="text-charcoal-400 mt-0.5 text-sm">{{ description }}</p>
        </div>
        <button
          type="button"
          class="text-charcoal-400 hover:bg-charcoal-50 hover:text-charcoal-600 -mr-1 rounded-md p-1"
          aria-label="Close dialog"
          @click="emit('close')"
        >
          <X class="size-5" aria-hidden="true" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <slot v-if="open" />
      </div>
      <div
        v-if="$slots.actions"
        class="border-charcoal-100 bg-charcoal-50/60 flex flex-wrap justify-end gap-2 border-t px-5 py-3.5"
      >
        <slot name="actions" />
      </div>
    </dialog>
  </Teleport>
</template>
