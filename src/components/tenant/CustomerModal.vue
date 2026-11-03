<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppModal from '@/components/ui/AppModal.vue'
import StatusBadge from '@/components/ui/StatusBadge.vue'
import UserAvatar from '@/components/ui/UserAvatar.vue'
import { useNewBooking } from '@/composables/useNewBooking'
import { listBookings, type BookingRow } from '@/services/bookingService'
import { BUILT_IN_TAG, saveCustomer, type CustomerSummary } from '@/services/customerService'
import { useTenantStore } from '@/stores/tenant'
import { useToastStore } from '@/stores/toast'
import { formatPHP } from '@/utils/currency'
import { formatLongDate, formatShortDate, formatTimeRange } from '@/utils/dates'

/** Create (customer = null, open) or view/edit an existing customer. */
const props = defineProps<{
  open: boolean
  customer: CustomerSummary | null
  /** The business's own tags (Customers → Manage tags). */
  tags: string[]
}>()
const emit = defineEmits<{ close: []; saved: [] }>()

const store = useTenantStore()
const toast = useToastStore()
const { openNewBooking } = useNewBooking()

const form = reactive({ name: '', email: '', phone: '', tags: [] as string[] })
const errors = reactive<Record<string, string>>({})
const history = ref<BookingRow[]>([])
const saving = ref(false)
const isNew = computed(() => props.customer === null)

watch(
  () => [props.open, props.customer] as const,
  async ([open, customer]) => {
    if (!open) return
    Object.keys(errors).forEach((k) => delete errors[k])
    Object.assign(form, {
      name: customer?.name ?? '',
      email: customer?.email ?? '',
      phone: customer?.phone ?? '',
      tags: [...(customer?.tags ?? [])],
    })
    history.value = customer
      ? await listBookings(store.tenant!.id, { customerId: customer.id })
      : []
  },
)

/** The business's tags, "New", and any this customer has that were since removed from the list. */
const tagOptions = computed(() => {
  const options = [...props.tags, BUILT_IN_TAG]
  const known = new Set(options.map((t) => t.toLowerCase()))
  return [...options, ...(props.customer?.tags ?? []).filter((t) => !known.has(t.toLowerCase()))]
})

function toggleTag(tag: string): void {
  form.tags = form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag]
}

async function save(): Promise<void> {
  Object.keys(errors).forEach((k) => delete errors[k])
  if (!form.name.trim()) errors.name = 'Enter a name'
  if (form.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a valid mobile number'
  if (Object.keys(errors).length) return
  saving.value = true
  try {
    await saveCustomer(store.tenant!.id, { ...form, name: form.name.trim() }, props.customer?.id)
    toast.show(isNew.value ? 'Customer added' : 'Customer saved')
    emit('saved')
  } catch (e) {
    toast.error(e)
  } finally {
    saving.value = false
  }
}

function book(): void {
  emit('close')
  openNewBooking({ customer: { name: form.name, email: form.email, phone: form.phone } })
}
</script>

<template>
  <AppModal
    :open="open"
    :title="isNew ? 'Add customer' : (customer?.name ?? '')"
    size="lg"
    @close="emit('close')"
  >
    <div v-if="customer" class="mb-5 flex flex-wrap items-center gap-4">
      <UserAvatar :name="customer.name" size="lg" />
      <dl class="grid flex-1 grid-cols-3 gap-3 text-sm">
        <div>
          <dt class="text-charcoal-400 text-xs">Bookings</dt>
          <dd class="tabular text-charcoal-700 font-semibold">{{ customer.bookings }}</dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Total spent</dt>
          <dd class="tabular text-charcoal-700 font-semibold">
            {{ formatPHP(customer.totalSpent) }}
          </dd>
        </div>
        <div>
          <dt class="text-charcoal-400 text-xs">Customer since</dt>
          <dd class="text-charcoal-700 font-semibold">{{ formatShortDate(customer.createdAt) }}</dd>
        </div>
      </dl>
    </div>

    <form id="customer-form" class="grid gap-4 sm:grid-cols-2" novalidate @submit.prevent="save">
      <div class="sm:col-span-2">
        <AppInput v-model="form.name" label="Full name" required :error="errors.name" />
      </div>
      <AppInput
        v-model="form.phone"
        type="tel"
        label="Mobile number"
        required
        :error="errors.phone"
      />
      <AppInput v-model="form.email" type="email" label="Email" />
      <fieldset class="sm:col-span-2">
        <legend class="text-charcoal-600 mb-2 text-sm font-medium">Tags</legend>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="tag in tagOptions"
            :key="tag"
            type="button"
            class="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
            :class="
              form.tags.includes(tag)
                ? 'border-brand-600 bg-brand-50 text-brand-700'
                : 'border-charcoal-200 text-charcoal-500 hover:border-charcoal-300'
            "
            :aria-pressed="form.tags.includes(tag)"
            @click="toggleTag(tag)"
          >
            {{ tag }}
          </button>
        </div>
      </fieldset>
    </form>

    <div v-if="customer" class="mt-6">
      <p class="text-charcoal-700 mb-2 text-sm font-semibold">Booking history</p>
      <ul
        v-if="history.length"
        class="divide-charcoal-100 border-charcoal-100 max-h-64 divide-y overflow-y-auto rounded-xl border"
      >
        <li
          v-for="b in history"
          :key="b.id"
          class="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
        >
          <div class="min-w-0">
            <p class="text-charcoal-700">
              {{ formatLongDate(b.date) }} · {{ formatTimeRange(b.startHour, b.durationHours) }}
            </p>
            <p class="text-charcoal-400 text-xs">
              {{ b.locationName }} · {{ b.courtName }} · {{ b.reference }}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span class="tabular text-charcoal-600 hidden sm:inline">{{
              formatPHP(b.amount)
            }}</span>
            <StatusBadge kind="booking" :value="b.status" />
          </div>
        </li>
      </ul>
      <p v-else class="text-charcoal-400 text-sm">No bookings yet.</p>
    </div>

    <template #actions>
      <AppButton
        v-if="customer && store.can('bookings')"
        variant="outline"
        class="mr-auto"
        @click="book"
      >
        New booking for {{ customer.name.split(' ')[0] }}
      </AppButton>
      <AppButton variant="outline" @click="emit('close')">Close</AppButton>
      <AppButton type="submit" form="customer-form" :loading="saving">
        {{ isNew ? 'Add customer' : 'Save changes' }}
      </AppButton>
    </template>
  </AppModal>
</template>
