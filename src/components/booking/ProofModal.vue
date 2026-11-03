<script setup lang="ts">
import { Check, ExternalLink, FileText, X } from '@lucide/vue'
import { computed, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppModal from '@/components/ui/AppModal.vue'
import LoadingState from '@/components/ui/LoadingState.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import { getProofUrl } from '@/services/paymentService'
import type { Payment } from '@/types/booking'
import { formatPHP } from '@/utils/currency'
import { formatRelative } from '@/utils/dates'
import { paymentMethodLabels } from '@/utils/labels'

/**
 * Shows a customer's proof of payment (screenshot or PDF) next to the
 * amount, with Approve / Reject for pending payments. Proofs are private:
 * the URL is a short-lived signed link.
 */
const props = defineProps<{
  payment: (Payment & { customerName?: string; bookingReference?: string }) | null
  busy?: boolean
}>()
const emit = defineEmits<{ close: []; approve: []; reject: [] }>()

const url = ref<string | null>(null)
const loading = ref(false)
const error = ref('')

watch(
  () => props.payment?.proofPath,
  async (path) => {
    url.value = null
    error.value = ''
    if (!path) return
    loading.value = true
    try {
      url.value = await getProofUrl(path)
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not open the proof.'
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

const isPdf = computed(
  () =>
    !!props.payment?.proofPath && /\.pdf$|^data:application\/pdf/i.test(props.payment.proofPath),
)
</script>

<template>
  <AppModal :open="payment !== null" title="Proof of payment" size="lg" @close="emit('close')">
    <div v-if="payment" class="grid gap-5 md:grid-cols-[minmax(0,1fr)_220px]">
      <div
        class="bg-charcoal-50 border-charcoal-100 flex min-h-64 items-center justify-center overflow-hidden rounded-xl border"
      >
        <LoadingState v-if="loading" class="w-full" :rows="5" />
        <p v-else-if="error" class="px-6 text-center text-sm text-red-700">{{ error }}</p>
        <p v-else-if="!payment.proofPath" class="text-charcoal-400 px-6 text-center text-sm">
          The customer hasn't uploaded a screenshot. Check your
          {{ paymentMethodLabels[payment.method] }} account for this amount.
        </p>
        <a
          v-else-if="isPdf && url"
          :href="url"
          target="_blank"
          rel="noopener"
          class="text-brand-700 flex flex-col items-center gap-2 p-8 text-sm font-semibold hover:underline"
        >
          <FileText class="size-10" aria-hidden="true" />
          Open the PDF receipt
        </a>
        <a v-else-if="url" :href="url" target="_blank" rel="noopener" class="block w-full">
          <img
            :src="url"
            alt="Customer's payment screenshot"
            class="max-h-[60vh] w-full bg-white object-contain"
          />
        </a>
      </div>

      <dl class="space-y-3 text-sm">
        <div>
          <dt class="text-charcoal-400 text-xs">Amount</dt>
          <dd class="tabular text-charcoal-700 text-xl font-semibold">
            {{ formatPHP(payment.amount) }}
          </dd>
        </div>
        <div v-if="payment.customerName">
          <dt class="text-charcoal-400 text-xs">Customer</dt>
          <dd class="text-charcoal-700">{{ payment.customerName }}</dd>
        </div>
        <div v-if="payment.bookingReference">
          <dt class="text-charcoal-400 text-xs">Booking</dt>
          <dd class="text-charcoal-700 font-mono">{{ payment.bookingReference }}</dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Method</dt>
          <dd class="text-charcoal-700">{{ paymentMethodLabels[payment.method] }}</dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Reference number (from customer)</dt>
          <dd class="text-charcoal-700 font-mono">{{ payment.transactionReference || '—' }}</dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Sent</dt>
          <dd class="text-charcoal-700">{{ formatRelative(payment.createdAt) }}</dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Status</dt>
          <dd><StatusBadge kind="paymentRecord" :value="payment.status" /></dd>
        </div>
        <a
          v-if="url && !isPdf"
          :href="url"
          target="_blank"
          rel="noopener"
          class="text-brand-700 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
        >
          <ExternalLink class="size-3.5" aria-hidden="true" /> Open full size
        </a>
      </dl>
    </div>

    <template v-if="payment?.status === 'pending'" #actions>
      <p class="text-charcoal-400 mr-auto self-center text-xs">
        Check the amount arrived in your account before approving.
      </p>
      <AppButton variant="outline" :disabled="busy" @click="emit('reject')">
        <template #icon-left><X class="size-4" aria-hidden="true" /></template>
        Reject
      </AppButton>
      <AppButton :loading="busy" @click="emit('approve')">
        <template #icon-left><Check class="size-4" aria-hidden="true" /></template>
        Approve
      </AppButton>
    </template>
  </AppModal>
</template>
