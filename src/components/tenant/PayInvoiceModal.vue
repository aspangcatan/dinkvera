<script setup lang="ts">
import { FileCheck2, ImageUp, ShieldCheck, Upload, Zap } from '@lucide/vue'
import { computed, ref, useTemplateRef, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import SegmentedControl from '@/components/ui/SegmentedControl.vue'
import { brand } from '@/config/brand'
import { useRoute } from 'vue-router'

import {
  PROOF_TYPES,
  startInvoiceCheckout,
  submitInvoicePayment,
  uploadInvoiceProof,
} from '@/services/subscriptionService'
import { useToastStore } from '@/stores/toast'
import type { Invoice } from '@/types/billing'
import type { PlatformAccountMethod, PlatformPaymentAccount } from '@/types/tenant'
import { formatPHP } from '@/utils/currency'
import { formatLongDate } from '@/utils/dates'
import { platformMethodLabels } from '@/utils/labels'

/**
 * Pay a Sideline invoice, two ways:
 * - online: PayMongo checkout; the invoice is marked paid automatically;
 * - proof: send the amount to one of Sideline's accounts, then upload
 *   proof. The invoice is marked paid once Sideline approves it.
 */
const props = defineProps<{
  open: boolean
  invoice: Invoice | null
  /** Sideline's accounts; ones without a number are hidden. */
  accounts: PlatformPaymentAccount[]
}>()
const emit = defineEmits<{ close: []; sent: [] }>()
const toast = useToastStore()
const route = useRoute()

type Mode = 'online' | 'proof'
const mode = ref<Mode>('online')
const modes: { value: Mode; title: string; body: string; icon: typeof Zap }[] = [
  {
    value: 'online',
    title: 'Pay online',
    body: 'Scan with GCash, Maya or your bank app (QR Ph). Confirmed automatically.',
    icon: Zap,
  },
  {
    value: 'proof',
    title: 'Upload proof',
    body: 'Already paid by transfer? Send your receipt for review.',
    icon: Upload,
  },
]

/** Set-up accounts: a number, or (QR Ph) just the QR image. */
const usable = computed(() =>
  props.accounts.filter((a) => a.accountNumber.trim() || (a.method === 'qrph' && a.qrUrl)),
)
const method = ref<PlatformAccountMethod>('qrph')
const account = computed(() => usable.value.find((a) => a.method === method.value) ?? null)
const file = ref<File | null>(null)
const reference = ref('')
const error = ref('')
const sending = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('file')

watch(
  () => props.open,
  (open) => {
    if (!open) return
    mode.value = 'online'
    method.value = usable.value[0]?.method ?? 'qrph'
    file.value = null
    reference.value = ''
    error.value = ''
  },
)

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  input.value = ''
  error.value = ''
}

/** Opens PayMongo's checkout page; it sends the business back to this page. */
async function payOnline(): Promise<void> {
  if (!props.invoice) return
  sending.value = true
  error.value = ''
  try {
    const { checkoutUrl } = await startInvoiceCheckout(props.invoice, route.path)
    if (checkoutUrl) {
      window.location.assign(checkoutUrl)
      return // keep the button busy while the browser leaves
    }
    // Already paid on an earlier checkout (or demo data, where it succeeds straight away).
    toast.show('Payment received — thank you!')
    emit('sent')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not start the payment. Try again.'
  }
  sending.value = false
}

async function send(): Promise<void> {
  if (!props.invoice) return
  if (!file.value) {
    error.value = 'Attach a screenshot or receipt of your payment.'
    return
  }
  sending.value = true
  try {
    const path = await uploadInvoiceProof(props.invoice, file.value)
    await submitInvoicePayment(props.invoice.id, method.value, path, reference.value)
    toast.show('Proof sent — Sideline will confirm your payment soon')
    emit('sent')
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not send your proof. Try again.'
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <AppModal
    :open="open"
    :title="invoice ? `Pay invoice ${invoice.number}` : 'Pay invoice'"
    description="Pay online, or upload proof if you already paid by transfer."
    size="lg"
    @close="emit('close')"
  >
    <div v-if="invoice" class="space-y-5">
      <div class="bg-charcoal-50 flex flex-wrap items-end justify-between gap-3 rounded-xl p-4">
        <div>
          <p class="text-charcoal-400 text-xs">Amount due</p>
          <p class="tabular text-charcoal-700 text-2xl font-semibold">
            {{ formatPHP(invoice.amount) }}
          </p>
        </div>
        <p class="text-charcoal-500 text-sm">
          {{ invoice.status === 'overdue' ? 'Was due' : 'Due' }}
          {{ formatLongDate(invoice.dueAt) }}
        </p>
      </div>

      <div class="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="How to pay">
        <button
          v-for="m in modes"
          :key="m.value"
          type="button"
          role="radio"
          :aria-checked="mode === m.value"
          class="flex gap-3 rounded-xl border p-4 text-left transition-colors"
          :class="
            mode === m.value
              ? 'border-brand-600 bg-brand-50 ring-brand-600 ring-1'
              : 'border-charcoal-200 hover:bg-charcoal-50'
          "
          @click="((mode = m.value), (error = ''))"
        >
          <span
            class="flex size-9 shrink-0 items-center justify-center rounded-lg"
            :class="
              mode === m.value ? 'bg-brand-600 text-white' : 'bg-charcoal-50 text-charcoal-400'
            "
          >
            <component :is="m.icon" class="size-4.5" aria-hidden="true" />
          </span>
          <span class="text-sm">
            <span class="text-charcoal-700 block font-semibold">{{ m.title }}</span>
            <span class="text-charcoal-500 block text-xs">{{ m.body }}</span>
          </span>
        </button>
      </div>

      <!-- Online: PayMongo checkout -->
      <div
        v-if="mode === 'online'"
        class="border-charcoal-100 flex gap-3 rounded-xl border p-4 text-sm"
      >
        <ShieldCheck class="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
        <div class="text-charcoal-600 space-y-1">
          <p>
            You'll pay <strong class="text-charcoal-700">{{ formatPHP(invoice.amount) }}</strong> on
            PayMongo's secure checkout page, then come back here.
          </p>
          <p class="text-charcoal-400 text-xs">
            Your invoice is marked paid as soon as PayMongo confirms it — no screenshot needed.
          </p>
          <p class="text-charcoal-400 text-xs">
            Paying on your phone? Tap <strong class="text-charcoal-600">Download QR Code</strong>,
            then in GCash, Maya or your bank app choose to scan or upload a QR from your photos.
          </p>
          <p class="text-charcoal-400 text-xs">
            The checkout page shows <strong class="text-charcoal-600">{{ brand.payee }}</strong
            >, who receives payments for {{ brand.product }}.
          </p>
        </div>
      </div>

      <!-- Proof: pay to Sideline's account, then upload -->
      <template v-else>
        <p
          v-if="!usable.length"
          class="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
          role="status"
        >
          Sideline hasn't added its payment details yet. Contact Sideline for where to send payment,
          then upload your proof here.
        </p>
        <template v-else>
          <SegmentedControl
            v-if="usable.length > 1"
            v-model="method"
            label="Payment method"
            :options="
              usable.map((a) => ({ value: a.method, label: platformMethodLabels[a.method] }))
            "
          />
          <div
            v-if="account"
            class="border-charcoal-100 grid gap-4 rounded-xl border p-4 sm:grid-cols-[1fr_140px]"
          >
            <dl class="space-y-2 text-sm">
              <div v-if="account.bankName">
                <dt class="text-charcoal-400 text-xs">Bank</dt>
                <dd class="text-charcoal-700 font-medium">{{ account.bankName }}</dd>
              </div>
              <div>
                <dt class="text-charcoal-400 text-xs">Account name</dt>
                <dd class="text-charcoal-700 font-medium">{{ account.accountName }}</dd>
              </div>
              <p v-if="account.method === 'qrph'" class="text-charcoal-500 text-xs">
                Scan with GCash, Maya or any bank app, and type the amount due.
              </p>
              <div v-if="account.accountNumber">
                <dt class="text-charcoal-400 text-xs">
                  {{
                    account.method === 'bank_transfer'
                      ? 'Account number'
                      : account.method === 'qrph'
                        ? 'Reference ID'
                        : 'Number'
                  }}
                </dt>
                <dd class="tabular text-charcoal-700 font-semibold">{{ account.accountNumber }}</dd>
              </div>
              <p v-if="account.instructions" class="text-charcoal-500 pt-1 text-xs">
                {{ account.instructions }}
              </p>
            </dl>
            <img
              v-if="account.qrUrl"
              :src="account.qrUrl"
              :alt="`Sideline ${platformMethodLabels[account.method]} QR code`"
              class="border-charcoal-100 aspect-square w-full rounded-lg border bg-white object-contain"
            />
          </div>
        </template>

        <div>
          <p class="text-charcoal-600 mb-1.5 text-sm font-medium">Proof of payment</p>
          <input
            ref="file"
            type="file"
            :accept="PROOF_TYPES.join(',')"
            class="sr-only"
            aria-label="Upload proof of payment"
            @change="onFile"
          />
          <button
            type="button"
            class="border-charcoal-200 hover:border-brand-300 hover:bg-brand-50 flex w-full items-center gap-3 rounded-xl border border-dashed p-4 text-left transition-colors"
            @click="fileInput?.click()"
          >
            <span
              class="flex size-10 shrink-0 items-center justify-center rounded-lg"
              :class="file ? 'bg-emerald-50 text-emerald-700' : 'bg-charcoal-50 text-charcoal-400'"
            >
              <FileCheck2 v-if="file" class="size-5" aria-hidden="true" />
              <ImageUp v-else class="size-5" aria-hidden="true" />
            </span>
            <span class="min-w-0 text-sm">
              <span class="text-charcoal-700 block truncate font-medium">{{
                file ? file.name : 'Choose a screenshot or receipt'
              }}</span>
              <span class="text-charcoal-400 block text-xs">JPG, PNG, WebP or PDF, up to 5 MB</span>
            </span>
          </button>
        </div>
        <AppInput
          v-model="reference"
          label="Reference number (optional)"
          placeholder="e.g. GCash ref no. 1234 567 890"
        />
      </template>
      <p v-if="error" class="text-sm text-red-600" role="alert">{{ error }}</p>
    </div>

    <template #actions>
      <AppButton variant="ghost" @click="emit('close')">Cancel</AppButton>
      <AppButton v-if="mode === 'online'" :loading="sending" @click="payOnline">
        Pay {{ invoice ? formatPHP(invoice.amount) : '' }} online
      </AppButton>
      <AppButton v-else :loading="sending" @click="send">Send proof</AppButton>
    </template>
  </AppModal>
</template>
