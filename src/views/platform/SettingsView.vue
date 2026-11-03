<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AppBadge from '@/components/ui/AppBadge.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppSelect from '@/components/ui/AppSelect.vue'
import AppToggle from '@/components/ui/AppToggle.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import PaymentAccountCard from '@/components/tenant/PaymentAccountCard.vue'
import { useQuery } from '@/composables/useQuery'
import { platformSettingsSeed } from '@/mocks/platformSettings'
import { listPlatformPaymentAccounts } from '@/services/paymentAccountService'
import { getPlatformSettings, savePlatformSettings } from '@/services/platformSettingsService'
import { useToastStore } from '@/stores/toast'
import type { PlatformAccountMethod, PlatformSettings } from '@/types/tenant'

/**
 * Platform-wide settings, saved in the platform_settings row. Trial length
 * and grace period are used by billing; the rest is stored for features
 * that aren't built yet, so it's shown disabled with a "Coming soon" label.
 */
const toast = useToastStore()
const methods: PlatformAccountMethod[] = ['qrph', 'gcash', 'maya', 'bank_transfer']
const accounts = useQuery(listPlatformPaymentAccounts)
const stored = useQuery(getPlatformSettings)
const saving = ref(false)

const settings = reactive<PlatformSettings>({ ...platformSettingsSeed })
const suspendAfter = computed({
  get: () => String(settings.suspendAfterInvoices),
  set: (v: string) => (settings.suspendAfterInvoices = Number(v)),
})

watch(stored.data, (value) => {
  if (value) Object.assign(settings, value)
})

async function save(): Promise<void> {
  saving.value = true
  try {
    Object.assign(
      settings,
      await savePlatformSettings({
        ...settings,
        trialDays: Number(settings.trialDays),
        graceDays: Number(settings.graceDays),
      }),
    )
    toast.show('Platform settings saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader
      eyebrow="Product"
      title="Platform settings"
      description="Defaults that apply to every business on CourtDesk."
    >
      <template #actions>
        <AppButton :loading="saving" :disabled="stored.loading.value" @click="save"
          >Save changes</AppButton
        >
      </template>
    </PageHeader>

    <AppCard
      class="mb-6"
      title="How businesses pay Sideline"
      description="Shown on each business's Subscription page and when they pay an invoice. They pay here, then upload proof for you to approve under Invoices."
    >
      <div v-if="accounts.loading.value" class="text-charcoal-400 text-sm">Loading…</div>
      <div v-else class="space-y-4">
        <PaymentAccountCard
          v-for="method in methods"
          :key="method"
          platform
          :method="method"
          :account="accounts.data.value?.find((a) => a.method === method) ?? null"
          @saved="accounts.refresh()"
        />
        <p class="text-charcoal-400 text-xs">
          Methods without details are hidden from businesses. QR Ph needs only a name and the QR
          image (e.g. your PayMongo in-store QR), and any bank or e-wallet app can scan it.
        </p>
      </div>
    </AppCard>

    <div class="grid gap-6 lg:grid-cols-2">
      <AppCard title="Company" description="Shown on invoices and system emails.">
        <template #actions>
          <AppBadge tone="warning" :dot="false">Coming soon</AppBadge>
        </template>
        <div class="space-y-4">
          <AppInput v-model="settings.companyName" label="Legal name" disabled />
          <AppInput v-model="settings.supportEmail" type="email" label="Support email" disabled />
          <AppSelect
            v-model="settings.billingCurrency"
            label="Billing currency"
            disabled
            :options="[{ value: 'PHP', label: 'Philippine peso (₱)' }]"
          />
        </div>
      </AppCard>

      <AppCard
        title="Trials & billing"
        description="How trials end and unpaid accounts are handled."
      >
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <AppInput
              v-model="settings.trialDays"
              type="number"
              label="Trial length (days)"
              min="1"
              max="90"
            />
            <AppInput
              v-model="settings.graceDays"
              type="number"
              label="Grace period (days)"
              min="0"
              max="60"
            />
          </div>
          <AppSelect
            v-model="suspendAfter"
            label="Suspend after"
            hint="Coming soon — suspend businesses by hand for now."
            disabled
            :options="[
              { value: '1', label: '1 overdue invoice' },
              { value: '2', label: '2 overdue invoices' },
              { value: '3', label: '3 overdue invoices' },
            ]"
          />
          <AppToggle
            v-model="settings.requireCardForTrial"
            label="Require a card to start a trial"
            description="Coming soon."
            disabled
          />
        </div>
      </AppCard>

      <AppCard title="Sign-ups">
        <template #actions>
          <AppBadge tone="warning" :dot="false">Coming soon</AppBadge>
        </template>
        <div class="space-y-4">
          <AppToggle
            v-model="settings.allowSignups"
            label="Allow self-serve sign-ups"
            description="Off = new businesses are added by an admin only."
            disabled
          />
          <AppToggle
            v-model="settings.maintenanceMode"
            label="Maintenance mode"
            description="Shows a notice on every booking site and pauses new bookings."
            disabled
          />
        </div>
      </AppCard>

      <AppCard title="Emails">
        <template #actions>
          <AppBadge tone="warning" :dot="false">Coming soon</AppBadge>
        </template>
        <div class="space-y-4">
          <AppToggle
            v-model="settings.emailBookingConfirmations"
            label="Booking confirmations"
            description="Sent to players on behalf of each business."
            disabled
          />
          <AppToggle
            v-model="settings.emailInvoiceReminders"
            label="Invoice reminders"
            description="3 days before and on the due date."
            disabled
          />
        </div>
      </AppCard>
    </div>
  </div>
</template>
