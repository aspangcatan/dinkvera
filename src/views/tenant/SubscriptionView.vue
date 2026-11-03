<script setup lang="ts">
import { CircleX, Clock, QrCode } from '@lucide/vue'
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import ChangePlanModal from '@/components/platform/ChangePlanModal.vue'
import PayInvoiceModal from '@/components/tenant/PayInvoiceModal.vue'
import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
import PageHeader from '@/components/ui/PageHeader.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UsageMeter from '@/components/ui/UsageMeter.vue'
import { useQuery } from '@/composables/useQuery'
import { useRefreshOnReturn } from '@/composables/useRefreshOnReturn'
import { listPlatformPaymentAccounts } from '@/services/paymentAccountService'
import {
  cancelPlanRequest,
  listInvoices,
  listPlanRequests,
  listPlans,
  setCancelAtPeriodEnd,
  syncInvoiceCheckout,
} from '@/services/subscriptionService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import type { Invoice } from '@/types/billing'
import { formatPHP } from '@/utils/currency'
import { formatLongDate, formatRelative, formatShortDate } from '@/utils/dates'
import { invoiceDisplayStatus, platformMethodLabels } from '@/utils/labels'

const store = useTenantStore()
const toast = useToastStore()
const tenantId = store.tenant!.id

const { data: plans } = useQuery(listPlans)
const invoices = useQuery(() => listInvoices({ tenantId }))
const requests = useQuery(() => listPlanRequests({ tenantId }))
// Where to send money: Sideline's own accounts (ones without a number are hidden).
const platformAccounts = useQuery(listPlatformPaymentAccounts)
const payTo = computed(() =>
  (platformAccounts.data.value ?? []).filter(
    (a) => a.accountNumber.trim() || (a.method === 'qrph' && a.qrUrl),
  ),
)
// Sideline may have approved a plan change since the dashboard loaded.
void store.refresh()

/** The open request, if any; otherwise Sideline's latest answer. */
const pending = computed(() => requests.data.value?.find((r) => r.status === 'pending') ?? null)
const lastAnswer = computed(() => {
  const latest = requests.data.value?.find((r) => r.status !== 'cancelled')
  return latest && latest.status !== 'pending' ? latest : null
})
const planName = (id: string) => plans.value?.find((p) => p.id === id)?.name ?? id

const sub = computed(() => store.subscription)
const plan = computed(() => store.plan)
const price = computed(() =>
  plan.value && sub.value
    ? sub.value.billingCycle === 'annual'
      ? plan.value.annualPrice
      : plan.value.monthlyPrice
    : 0,
)
/** Unpaid and not yet sent for review: these still need paying. */
const toPay = computed(() =>
  (invoices.data.value ?? []).filter(
    (i) => (i.status === 'open' || i.status === 'overdue') && !i.proofSubmittedAt,
  ),
)
const overdue = computed(() => toPay.value.filter((i) => i.status === 'overdue'))
const inReview = computed(() =>
  (invoices.data.value ?? []).filter((i) => invoiceDisplayStatus(i) === 'review'),
)
const paying = ref<Invoice | null>(null)

const changing = ref(false)
const confirmCancel = ref(false)
const busy = ref(false)

async function reload(): Promise<void> {
  // A paid invoice can change the tenant's status, so re-read it all.
  await Promise.all([store.reload(), invoices.refresh()])
}

// Coming back from GCash / another tab: pick up payments confirmed meanwhile.
useRefreshOnReturn(() =>
  Promise.all([
    store.reload(),
    invoices.refresh({ silent: true }),
    requests.refresh({ silent: true }),
  ]),
)

async function onProofSent(): Promise<void> {
  paying.value = null
  await reload()
}

// Back from PayMongo checkout: ?paid=<invoice id> or ?cancelled=<invoice id>.
const route = useRoute()
const router = useRouter()
const confirming = ref(false)

/** Shown after a checkout attempt that failed or expired (stays until dismissed). */
const failedCheckout = ref<{ invoiceId: string; reason: string } | null>(null)

async function handleCheckoutReturn(): Promise<void> {
  const paidId = typeof route.query.paid === 'string' ? route.query.paid : null
  const cancelledId = typeof route.query.cancelled === 'string' ? route.query.cancelled : null
  const invoiceId = paidId ?? cancelledId
  if (!invoiceId) return
  void router.replace({ query: {} })
  confirming.value = true
  try {
    let result = await syncInvoiceCheckout(invoiceId)
    // After a successful checkout PayMongo usually confirms within seconds.
    for (let i = 0; paidId && i < 3 && result.status === 'pending'; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      result = await syncInvoiceCheckout(invoiceId)
    }
    if (result.status === 'paid') {
      toast.show('Payment received — thank you!')
    } else if (result.status === 'failed') {
      failedCheckout.value = { invoiceId, reason: result.reason ?? '' }
    } else if (cancelledId) {
      toast.show('Payment cancelled — your invoice is still unpaid', 'info')
    } else {
      toast.show(
        "We haven't received PayMongo's confirmation yet. Your invoice will update once it arrives.",
        'info',
      )
    }
    await reload()
  } catch (e) {
    toast.error(e)
  } finally {
    confirming.value = false
  }
}

function retryFailed(): void {
  const invoice = invoices.data.value?.find((i) => i.id === failedCheckout.value?.invoiceId)
  failedCheckout.value = null
  if (invoice && toPay.value.includes(invoice)) paying.value = invoice
}
void handleCheckoutReturn()

/**
 * An earlier online payment may have gone through without CourtDesk hearing
 * about it (connection lost before coming back, webhook delayed). Ask
 * PayMongo once about every unpaid invoice that had a checkout started.
 */
let checkedStarted = false
watch(invoices.data, async (list) => {
  if (checkedStarted || !list || route.query.paid || route.query.cancelled) return
  checkedStarted = true
  const started = list.filter(
    (i) => i.checkoutStarted && (i.status === 'open' || i.status === 'overdue'),
  )
  const results = await Promise.all(started.map((i) => syncInvoiceCheckout(i.id).catch(() => null)))
  if (results.some((r) => r?.status === 'paid')) {
    toast.show('Payment received — thank you!')
    await reload()
  }
})

async function withdrawRequest(): Promise<void> {
  if (!pending.value) return
  busy.value = true
  try {
    await cancelPlanRequest(pending.value.id)
    toast.show('Request cancelled')
    await requests.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}

async function setCancel(cancel: boolean): Promise<void> {
  busy.value = true
  try {
    await setCancelAtPeriodEnd(tenantId, cancel)
    toast.show(
      cancel ? 'Your plan will end at the close of this period' : 'Your plan will renew as usual',
    )
    confirmCancel.value = false
    await store.refresh()
  } catch (e) {
    toast.error(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div>
    <PageHeader title="Subscription" description="Your CourtDesk plan, usage and invoices." />

    <div
      v-if="confirming"
      class="border-charcoal-100 text-charcoal-600 mb-6 flex items-center gap-3 rounded-2xl border bg-white p-4 text-sm"
      role="status"
    >
      <Clock class="size-4 shrink-0 animate-pulse" aria-hidden="true" />
      Confirming your payment with PayMongo…
    </div>
    <div
      v-else-if="failedCheckout"
      class="mb-6 flex flex-wrap items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
      role="alert"
    >
      <CircleX class="mt-0.5 size-5 shrink-0 text-red-600" aria-hidden="true" />
      <div class="min-w-0 flex-1 text-sm">
        <p class="font-semibold text-red-800">Your payment didn't go through</p>
        <p class="text-red-700">
          <template v-if="failedCheckout.reason">PayMongo: {{ failedCheckout.reason }}. </template>
          No money was taken. You can try again or use another payment method.
        </p>
      </div>
      <div class="flex gap-2">
        <AppButton size="sm" variant="ghost" @click="failedCheckout = null">Dismiss</AppButton>
        <AppButton size="sm" variant="danger" @click="retryFailed">Try again</AppButton>
      </div>
    </div>
    <div
      v-else-if="overdue.length"
      class="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4"
    >
      <div class="flex-1">
        <p class="text-sm font-semibold text-red-800">
          {{ overdue.length }} overdue {{ overdue.length === 1 ? 'invoice' : 'invoices' }} ·
          {{ formatPHP(overdue.reduce((s, i) => s + i.amount, 0)) }}
        </p>
        <p class="text-xs text-red-700">Pay now to avoid your booking site being paused.</p>
      </div>
      <AppButton variant="danger" @click="paying = overdue[0]!">Pay now</AppButton>
    </div>
    <div
      v-else-if="inReview.length"
      class="mb-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
      role="status"
    >
      <Clock class="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
      <p>
        <span class="font-semibold">Payment proof sent.</span>
        Sideline is checking it — the invoice is marked paid once confirmed.
      </p>
    </div>

    <div class="grid gap-6 lg:grid-cols-3">
      <AppCard class="lg:col-span-2" title="Current plan">
        <template #actions>
          <AppButton size="sm" :disabled="!!pending" @click="changing = true">
            Request plan change
          </AppButton>
        </template>
        <div v-if="plan && sub" class="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div class="flex items-center gap-2">
              <p class="text-charcoal-700 text-2xl font-semibold">{{ plan.name }}</p>
              <StatusBadge kind="subscription" :value="sub.status" />
            </div>
            <p class="text-charcoal-400 mt-1 text-sm">{{ plan.description }}</p>
          </div>
          <div class="text-right">
            <p class="tabular text-charcoal-700 text-xl font-semibold">{{ formatPHP(price) }}</p>
            <p class="text-charcoal-400 text-xs">
              per {{ sub.billingCycle === 'annual' ? 'year' : 'month' }}
            </p>
          </div>
        </div>
        <div
          v-if="pending"
          class="mt-5 flex flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm"
          role="status"
        >
          <Clock class="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
          <div class="min-w-0 flex-1 text-amber-900">
            <p class="font-semibold">
              Waiting for Sideline: switch to {{ planName(pending.planId) }} ({{
                pending.billingCycle
              }})
            </p>
            <p class="text-amber-800">
              Sent {{ formatRelative(pending.createdAt) }}. Once approved, your new plan starts and
              its invoice appears below. Your current plan stays until then.
            </p>
          </div>
          <AppButton size="sm" variant="outline" :loading="busy" @click="withdrawRequest">
            Cancel request
          </AppButton>
        </div>
        <div
          v-else-if="lastAnswer"
          class="mt-5 rounded-xl border px-4 py-3 text-sm"
          :class="
            lastAnswer.status === 'approved'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-red-200 bg-red-50 text-red-900'
          "
        >
          <p class="font-semibold">
            Your request to switch to {{ planName(lastAnswer.planId) }} was
            {{ lastAnswer.status === 'approved' ? 'approved' : 'declined' }}
            {{ lastAnswer.decidedAt ? formatRelative(lastAnswer.decidedAt) : '' }}.
          </p>
          <p v-if="lastAnswer.status === 'approved' && sub?.status === 'trialing'">
            It starts when your free trial ends — you keep the trial until then.
          </p>
          <p v-if="lastAnswer.decisionNote">Sideline: “{{ lastAnswer.decisionNote }}”</p>
        </div>
        <div v-if="sub" class="bg-charcoal-50 text-charcoal-600 mt-5 rounded-xl px-4 py-3 text-sm">
          <template v-if="sub.status === 'trialing'">
            <!-- When the trial ends, billing moves the business onto this plan by itself. -->
            Your free trial ends on <strong>{{ formatLongDate(sub.trialEndsAt!) }}</strong
            >. After that you're on <strong>{{ plan?.name }}</strong> at {{ formatPHP(price) }}/{{
              sub.billingCycle === 'annual' ? 'year' : 'month'
            }}; your first invoice arrives then. Nothing is charged before.
          </template>
          <template v-else-if="sub.cancelAtPeriodEnd">
            Your plan ends on <strong>{{ formatLongDate(sub.currentPeriodEnd) }}</strong> and won't
            renew.
            <button
              type="button"
              class="text-brand-700 ml-1 font-semibold underline"
              @click="setCancel(false)"
            >
              Keep my plan
            </button>
          </template>
          <template v-else>
            Renews on <strong>{{ formatLongDate(sub.currentPeriodEnd) }}</strong
            >.
          </template>
        </div>
        <div class="mt-6 grid gap-5 sm:grid-cols-2">
          <UsageMeter v-for="u in store.usage" :key="u.key" :item="u" />
        </div>
      </AppCard>

      <div class="space-y-6">
        <AppCard
          title="How to pay Sideline"
          description="Send payment to one of these, then upload proof on the invoice."
        >
          <p v-if="platformAccounts.loading.value" class="text-charcoal-400 text-sm">Loading…</p>
          <p v-else-if="!payTo.length" class="text-charcoal-500 text-sm">
            Sideline will send you payment details with your invoice.
          </p>
          <ul v-else class="divide-charcoal-100 -my-2 divide-y">
            <li v-for="a in payTo" :key="a.method" class="flex items-center gap-3 py-3">
              <img
                v-if="a.qrUrl"
                :src="a.qrUrl"
                :alt="`Sideline ${platformMethodLabels[a.method]} QR code`"
                class="border-charcoal-100 size-12 shrink-0 rounded-lg border bg-white object-contain"
              />
              <span
                v-else
                class="bg-charcoal-50 text-charcoal-400 flex size-12 shrink-0 items-center justify-center rounded-lg"
              >
                <QrCode class="size-5" aria-hidden="true" />
              </span>
              <div class="min-w-0 text-sm">
                <p class="text-charcoal-700 font-medium">
                  {{
                    a.method === 'bank_transfer' && a.bankName
                      ? a.bankName
                      : a.method === 'qrph'
                        ? 'QR Ph — any bank or e-wallet'
                        : platformMethodLabels[a.method]
                  }}
                </p>
                <p v-if="a.accountNumber" class="tabular text-charcoal-600">
                  {{ a.accountNumber }}
                </p>
                <p class="text-charcoal-400 truncate text-xs">{{ a.accountName }}</p>
              </div>
            </li>
          </ul>
          <p class="text-charcoal-400 mt-4 text-xs">
            The Sideline team checks each payment, then marks the invoice paid.
          </p>
        </AppCard>
        <AppCard
          v-if="sub && !sub.cancelAtPeriodEnd && sub.status !== 'trialing'"
          title="Cancel plan"
        >
          <p class="text-charcoal-400 text-sm">
            Your booking site stays live until the end of the current period.
          </p>
          <AppButton
            size="sm"
            variant="ghost"
            class="mt-3 !text-red-600"
            @click="confirmCancel = true"
          >
            Cancel at period end
          </AppButton>
        </AppCard>
      </div>
    </div>

    <AppCard class="mt-6" title="Invoices" :padded="false">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-charcoal-400 border-charcoal-100 border-b text-xs">
              <th class="px-5 py-2.5 text-left font-medium">Invoice</th>
              <th class="px-4 py-2.5 text-left font-medium">Date</th>
              <th class="px-4 py-2.5 text-left font-medium">Status</th>
              <th class="px-4 py-2.5 text-right font-medium">Amount</th>
              <th class="px-5 py-2.5"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="inv in invoices.data.value ?? []"
              :key="inv.id"
              class="border-charcoal-100/70 border-b last:border-0"
            >
              <td class="text-charcoal-700 px-5 py-3 font-medium">{{ inv.number }}</td>
              <td class="text-charcoal-500 px-4 py-3">{{ formatShortDate(inv.issuedAt) }}</td>
              <td class="px-4 py-3">
                <StatusBadge kind="invoice" :value="invoiceDisplayStatus(inv)" />
                <p v-if="inv.paidOnline" class="text-charcoal-400 mt-1 text-xs">
                  Paid online (PayMongo)
                </p>
                <p
                  v-else-if="inv.reviewNote && toPay.includes(inv)"
                  class="mt-1 max-w-xs text-xs text-red-700"
                >
                  Proof declined: {{ inv.reviewNote }}
                </p>
              </td>
              <td class="tabular text-charcoal-700 px-4 py-3 text-right">
                {{ formatPHP(inv.amount) }}
              </td>
              <td class="px-5 py-3 text-right">
                <AppButton v-if="toPay.includes(inv)" size="sm" @click="paying = inv">
                  Pay
                </AppButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p
          v-if="!invoices.data.value?.length"
          class="text-charcoal-400 px-5 py-8 text-center text-sm"
        >
          No invoices yet.
        </p>
      </div>
    </AppCard>

    <PayInvoiceModal
      :open="!!paying"
      :invoice="paying"
      :accounts="platformAccounts.data.value ?? []"
      @close="paying = null"
      @sent="onProofSent"
    />
    <ChangePlanModal
      v-if="sub"
      :open="changing"
      :tenant-id="tenantId"
      :current-plan-id="sub.planId"
      :current-cycle="sub.billingCycle"
      :plans="plans ?? []"
      :usage="store.usage"
      mode="request"
      :allow-current="sub.status === 'trialing'"
      @close="changing = false"
      @changed="((changing = false), requests.refresh())"
    />
    <ConfirmDialog
      :open="confirmCancel"
      title="Cancel your plan?"
      :message="`You can keep using CourtDesk until ${sub ? formatLongDate(sub.currentPeriodEnd) : ''}. After that your booking site goes offline.`"
      confirm-label="Cancel plan"
      danger
      :loading="busy"
      @cancel="confirmCancel = false"
      @confirm="setCancel(true)"
    />
  </div>
</template>
