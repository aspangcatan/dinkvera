<script setup lang="ts">
import { ExternalLink, FileText } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import { getInvoiceProofUrl, reviewInvoicePayment } from '@/services/subscriptionService'
import { useToastStore } from '@/stores/toast'
import type { Invoice } from '@/types/billing'
import { formatPHP } from '@/utils/currency'
import { formatRelative } from '@/utils/dates'
import { platformMethodLabels } from '@/utils/labels'

/** Platform admin checks a business's proof of payment, then approves or declines. */
const props = defineProps<{ open: boolean; invoice: Invoice | null; businessName: string }>()
const emit = defineEmits<{ close: []; decided: [] }>()
const toast = useToastStore()

const proofUrl = ref<string | null>(null)
const loadingProof = ref(false)
const note = ref('')
const error = ref('')
const busy = ref<'approve' | 'decline' | null>(null)

const isPdf = computed(
  () =>
    !!props.invoice?.proofPath &&
    (props.invoice.proofPath.endsWith('.pdf') ||
      props.invoice.proofPath.startsWith('data:application/pdf')),
)

watch(
  () => [props.open, props.invoice?.id] as const,
  async ([open]) => {
    note.value = ''
    error.value = ''
    proofUrl.value = null
    if (!open || !props.invoice?.proofPath) return
    loadingProof.value = true
    try {
      proofUrl.value = await getInvoiceProofUrl(props.invoice.proofPath)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not open the proof.'
    } finally {
      loadingProof.value = false
    }
  },
  { immediate: true },
)

async function decide(approve: boolean): Promise<void> {
  if (!props.invoice) return
  if (!approve && !note.value.trim()) {
    error.value = 'Tell the business why the proof was declined.'
    return
  }
  busy.value = approve ? 'approve' : 'decline'
  try {
    await reviewInvoicePayment(props.invoice.id, approve, note.value)
    toast.show(
      approve
        ? `${props.invoice.number} marked as paid`
        : `Proof declined — ${props.businessName} can send a new one`,
    )
    emit('decided')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong.'
  } finally {
    busy.value = null
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="invoice ? `Review payment · ${invoice.number}` : 'Review payment'"
    :description="businessName"
    size="lg"
    @close="emit('close')"
  >
    <div v-if="invoice" class="grid gap-5 sm:grid-cols-[1fr_1.1fr]">
      <dl class="space-y-3 text-sm">
        <div>
          <dt class="text-charcoal-400 text-xs">Amount due</dt>
          <dd class="tabular text-charcoal-700 text-xl font-semibold">
            {{ formatPHP(invoice.amount) }}
          </dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Paid with</dt>
          <dd class="text-charcoal-700 font-medium">
            {{ invoice.paymentMethod ? platformMethodLabels[invoice.paymentMethod] : '—' }}
          </dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Reference number</dt>
          <dd class="tabular text-charcoal-700 font-medium">
            {{ invoice.transactionReference || 'None given' }}
          </dd>
        </div>
        <div v-if="invoice.proofSubmittedAt">
          <dt class="text-charcoal-400 text-xs">Sent</dt>
          <dd class="text-charcoal-700">{{ formatRelative(invoice.proofSubmittedAt) }}</dd>
        </div>
        <p class="text-charcoal-400 pt-1 text-xs">
          Check that the amount and reference match what arrived in Sideline's account before
          approving.
        </p>
      </dl>

      <div>
        <p class="text-charcoal-600 mb-1.5 text-sm font-medium">Proof of payment</p>
        <div
          class="border-charcoal-100 bg-charcoal-50 flex min-h-56 items-center justify-center overflow-hidden rounded-xl border"
        >
          <p v-if="loadingProof" class="text-charcoal-400 text-sm">Loading…</p>
          <a
            v-else-if="proofUrl && isPdf"
            :href="proofUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-brand-700 flex flex-col items-center gap-2 p-6 text-sm font-semibold"
          >
            <FileText class="size-8" aria-hidden="true" />
            Open PDF
          </a>
          <a
            v-else-if="proofUrl"
            :href="proofUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="group relative block w-full"
          >
            <img :src="proofUrl" alt="Proof of payment" class="max-h-96 w-full object-contain" />
            <span
              class="text-charcoal-600 absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md bg-white/90 px-2 py-1 text-xs font-medium shadow-sm"
            >
              <ExternalLink class="size-3.5" aria-hidden="true" /> Full size
            </span>
          </a>
          <p v-else class="text-charcoal-400 text-sm">No file</p>
        </div>
      </div>

      <div class="sm:col-span-2">
        <AppTextarea
          v-model="note"
          label="Reason (needed to decline)"
          :rows="2"
          placeholder="e.g. The amount received was ₱1,000 short."
        />
        <p v-if="error" class="mt-2 text-sm text-red-600" role="alert">{{ error }}</p>
      </div>
    </div>

    <template #actions>
      <AppButton variant="ghost" @click="emit('close')">Close</AppButton>
      <AppButton
        variant="outline"
        class="!text-red-600"
        :loading="busy === 'decline'"
        :disabled="busy === 'approve'"
        @click="decide(false)"
        >Decline</AppButton
      >
      <AppButton :loading="busy === 'approve'" :disabled="busy === 'decline'" @click="decide(true)"
        >Approve · mark paid</AppButton
      >
    </template>
  </AppModal>
</template>
