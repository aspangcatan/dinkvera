<script setup lang="ts">
import { Plus, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import {
  BUILT_IN_TAG,
  MAX_CUSTOMER_TAGS,
  MAX_TAG_LENGTH,
  saveCustomerTags,
} from '@/services/customerService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'

/**
 * The business's own customer tags. Removing one only takes it off the
 * list; customers who already have it keep it until it's unticked.
 */
const props = defineProps<{ open: boolean; tags: string[] }>()
const emit = defineEmits<{ close: []; saved: [tags: string[]] }>()

const store = useTenantStore()
const toast = useToastStore()

const list = ref<string[]>([])
const draft = ref('')
const error = ref('')
const saving = ref(false)

watch(
  () => props.open,
  (open) => {
    if (!open) return
    list.value = [...props.tags]
    draft.value = ''
    error.value = ''
  },
)

const full = computed(() => list.value.length >= MAX_CUSTOMER_TAGS)

function add(): void {
  const tag = draft.value.trim().replace(/\s+/g, ' ')
  error.value = ''
  if (!tag) return
  if (tag.length > MAX_TAG_LENGTH) {
    error.value = `Keep tags to ${MAX_TAG_LENGTH} characters.`
    return
  }
  const taken = [BUILT_IN_TAG, ...list.value].some((t) => t.toLowerCase() === tag.toLowerCase())
  if (taken) {
    error.value = `"${tag}" is already a tag.`
    return
  }
  list.value = [...list.value, tag]
  draft.value = ''
}

function remove(tag: string): void {
  list.value = list.value.filter((t) => t !== tag)
}

async function save(): Promise<void> {
  saving.value = true
  error.value = ''
  try {
    const saved = await saveCustomerTags(store.tenant!.id, list.value)
    toast.show('Tags saved')
    emit('saved', saved)
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not save the tags. Try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    title="Customer tags"
    description="Labels you can put on customers, e.g. Member, Coach or VIP. Only you see them."
    @close="emit('close')"
  >
    <div class="space-y-4">
      <ul class="flex flex-wrap gap-2" aria-label="Your tags">
        <li
          class="border-charcoal-100 bg-charcoal-50 text-charcoal-500 rounded-full border px-3 py-1 text-xs font-medium"
          title="Added automatically to first-time bookers"
        >
          {{ BUILT_IN_TAG }} · automatic
        </li>
        <li
          v-for="tag in list"
          :key="tag"
          class="border-charcoal-200 text-charcoal-700 flex items-center gap-1 rounded-full border py-1 pr-1.5 pl-3 text-xs font-medium"
        >
          {{ tag }}
          <button
            type="button"
            class="text-charcoal-400 rounded-full p-0.5 hover:bg-red-50 hover:text-red-600"
            :aria-label="`Remove ${tag}`"
            @click="remove(tag)"
          >
            <X class="size-3.5" aria-hidden="true" />
          </button>
        </li>
      </ul>

      <form class="flex items-end gap-2" @submit.prevent="add">
        <div class="min-w-0 flex-1">
          <AppInput
            v-model="draft"
            label="New tag"
            placeholder="e.g. VIP"
            :disabled="full"
            :hint="full ? `That's the most tags (${MAX_CUSTOMER_TAGS}).` : ''"
          />
        </div>
        <AppButton type="submit" variant="outline" :disabled="full || !draft.trim()">
          <template #icon-left><Plus class="size-4" aria-hidden="true" /></template>
          Add
        </AppButton>
      </form>

      <p class="text-charcoal-400 text-xs">
        Removing a tag takes it off this list only. Customers who already have it keep it until you
        untick it on their profile.
      </p>
      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </div>

    <template #actions>
      <AppButton variant="ghost" @click="emit('close')">Cancel</AppButton>
      <AppButton :loading="saving" @click="save">Save tags</AppButton>
    </template>
  </AppModal>
</template>
