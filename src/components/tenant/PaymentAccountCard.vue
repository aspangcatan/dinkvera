<script setup lang="ts">
import { ImageUp, QrCode, Trash2 } from '@lucide/vue'
import { computed, reactive, ref, useTemplateRef, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import {
  removePaymentQr,
  removePlatformPaymentQr,
  savePaymentAccount,
  savePlatformPaymentAccount,
  uploadPaymentQr,
  uploadPlatformPaymentQr,
  type PaymentAccountInput,
} from '@/services/paymentAccountService'
import { useToastStore } from '@/stores/toast'
import type { AccountMethod, PaymentAccount, PlatformAccountMethod } from '@/types/tenant'
import { platformMethodLabels } from '@/utils/labels'

/**
 * One payment method's details (name, number, QR code) that customers see
 * at checkout. Saves on its own, separately from the Settings page button.
 * With `platform`, edits Sideline's own account that businesses pay
 * invoices to (Super Admin → Settings) instead.
 */
const props = withDefaults(
  defineProps<{
    tenantId?: string
    /** 'qrph' only with `platform` (Sideline's own accounts). */
    method: PlatformAccountMethod
    account: PaymentAccount<PlatformAccountMethod> | null
    /** Whether customers can currently pick this method. */
    enabled?: boolean
    platform?: boolean
  }>(),
  { tenantId: '', enabled: true, platform: false },
)
const emit = defineEmits<{ saved: [account: PaymentAccount<PlatformAccountMethod>] }>()
const toast = useToastStore()

const payer = computed(() => (props.platform ? 'businesses' : 'customers'))
const api = {
  save: (input: PaymentAccountInput) =>
    props.platform
      ? savePlatformPaymentAccount(props.method, input)
      : savePaymentAccount(props.tenantId, props.method as AccountMethod, input),
  upload: (file: File) =>
    props.platform
      ? uploadPlatformPaymentQr(props.method, file)
      : uploadPaymentQr(props.tenantId, props.method as AccountMethod, file),
  remove: () =>
    props.platform
      ? removePlatformPaymentQr(props.method)
      : removePaymentQr(props.tenantId, props.method as AccountMethod),
}

const form = reactive({ accountName: '', accountNumber: '', bankName: '', instructions: '' })
const qrUrl = ref<string | null>(null)
const saving = ref(false)
const uploading = ref(false)
const fileInput = useTemplateRef<HTMLInputElement>('file')

watch(
  () => props.account,
  (a) => {
    Object.assign(form, {
      accountName: a?.accountName ?? '',
      accountNumber: a?.accountNumber ?? '',
      bankName: a?.bankName ?? '',
      instructions: a?.instructions ?? '',
    })
    qrUrl.value = a?.qrUrl ?? null
  },
  { immediate: true },
)

const isBank = computed(() => props.method === 'bank_transfer')
/** QR Ph: one code any bank or e-wallet app scans; the QR image matters, not a number. */
const isQrPh = computed(() => props.method === 'qrph')
const numberLabel = computed(() =>
  isBank.value
    ? 'Account number'
    : isQrPh.value
      ? 'Merchant / reference ID (optional)'
      : 'Mobile number',
)
const incomplete = computed(() =>
  isQrPh.value
    ? !form.accountName.trim() || !qrUrl.value
    : !form.accountName.trim() || !form.accountNumber.trim(),
)

async function save(): Promise<void> {
  saving.value = true
  try {
    const account = await api.save({
      accountName: form.accountName.trim(),
      accountNumber: form.accountNumber.trim(),
      bankName: isBank.value ? form.bankName.trim() : '',
      instructions: form.instructions.trim(),
    })
    toast.show(`${platformMethodLabels[props.method]} details saved`)
    emit('saved', account)
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

async function onFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  uploading.value = true
  try {
    const account = await api.upload(file)
    qrUrl.value = account.qrUrl
    toast.show('QR code uploaded')
    emit('saved', account)
  } catch (e) {
    toast.error(e)
  } finally {
    uploading.value = false
  }
}

async function removeQr(): Promise<void> {
  uploading.value = true
  try {
    const account = await api.remove()
    qrUrl.value = null
    toast.show('QR code removed')
    emit('saved', account)
  } catch (e) {
    toast.error(e)
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="border-charcoal-100 rounded-xl border p-4" :class="enabled ? '' : 'opacity-60'">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-charcoal-700 text-sm font-semibold">
        {{ platformMethodLabels[method] }} details
      </p>
      <span v-if="!enabled" class="text-charcoal-400 text-xs"
        >Turned off — {{ payer }} can't pick it</span
      >
      <span v-else-if="incomplete" class="text-xs text-amber-700">{{
        isQrPh ? 'Add the account name and QR image' : 'Add the account name and number'
      }}</span>
    </div>

    <div class="mt-3 grid gap-4 md:grid-cols-[1fr_160px]">
      <form class="grid gap-3 sm:grid-cols-2" novalidate @submit.prevent="save">
        <div v-if="isBank" class="sm:col-span-2">
          <AppInput v-model="form.bankName" label="Bank" placeholder="e.g. BDO, BPI, GoTyme" />
        </div>
        <AppInput
          v-model="form.accountName"
          label="Account name"
          placeholder="Name on the account"
        />
        <AppInput
          v-model="form.accountNumber"
          :label="numberLabel"
          :placeholder="isBank ? '0012 3456 7890' : isQrPh ? 'Optional' : '0917 123 4567'"
        />
        <div class="sm:col-span-2">
          <AppTextarea
            v-model="form.instructions"
            :label="`Note for ${payer}`"
            :rows="2"
            placeholder="e.g. Use your full name as the message."
          />
        </div>
        <div class="sm:col-span-2">
          <AppButton type="submit" size="sm" variant="outline" :loading="saving"
            >Save details</AppButton
          >
        </div>
      </form>

      <!-- QR code -->
      <div>
        <p class="text-charcoal-600 mb-1.5 text-sm font-medium">QR code</p>
        <div
          class="border-charcoal-200 bg-charcoal-50 flex aspect-square items-center justify-center overflow-hidden rounded-lg border border-dashed"
        >
          <img
            v-if="qrUrl"
            :src="qrUrl"
            :alt="`${platformMethodLabels[method]} QR code`"
            class="h-full w-full bg-white object-contain"
          />
          <QrCode v-else class="text-charcoal-300 size-10" aria-hidden="true" />
        </div>
        <input
          ref="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="sr-only"
          :aria-label="`Upload ${platformMethodLabels[method]} QR code`"
          @change="onFile"
        />
        <div class="mt-2 flex gap-1.5">
          <AppButton size="sm" variant="outline" :loading="uploading" @click="fileInput?.click()">
            <template #icon-left><ImageUp class="size-3.5" aria-hidden="true" /></template>
            {{ qrUrl ? 'Replace' : 'Upload' }}
          </AppButton>
          <button
            v-if="qrUrl"
            type="button"
            class="text-charcoal-400 rounded-lg p-2 hover:bg-red-50 hover:text-red-600"
            :disabled="uploading"
            aria-label="Remove QR code"
            @click="removeQr"
          >
            <Trash2 class="size-4" aria-hidden="true" />
          </button>
        </div>
        <p class="text-charcoal-400 mt-1 text-[11px]">PNG, JPG or WebP, up to 2 MB.</p>
      </div>
    </div>
  </div>
</template>
