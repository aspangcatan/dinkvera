<script setup lang="ts">
import { Mail, MapPin, Phone } from '@lucide/vue'
import { computed, ref } from 'vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppBadge from '@/components/ui/AppBadge.vue'
import { useNewTrialRequests } from '@/composables/useNewTrialRequests'
import { useQuery } from '@/composables/useQuery'
import { listTrialRequests, setTrialRequestStatus } from '@/services/trialRequestService'
import { useToastStore } from '@/stores/toast'
import type { Plan, TrialRequest, TrialRequestStatus } from '@/types/billing'
import { formatRelative } from '@/utils/dates'
import { trialRequestStatus } from '@/utils/labels'

/**
 * Free-trial requests from the marketing site. Trials aren't self-serve:
 * the admin follows up, adds the business (which starts its trial) and the
 * request is marked converted.
 */
/** For the plan names ("Wants: Growth"). */
const props = defineProps<{ plans: Plan[] }>()
const emit = defineEmits<{ addBusiness: [request: TrialRequest] }>()
const planName = (id: string) => props.plans.find((p) => p.id === id)?.name ?? id
const toast = useToastStore()
const badge = useNewTrialRequests()

const requests = useQuery(listTrialRequests)
const showHandled = ref(false)
const open = computed(() =>
  (requests.data.value ?? []).filter((r) => r.status === 'new' || r.status === 'contacted'),
)
const handled = computed(() =>
  (requests.data.value ?? []).filter((r) => r.status === 'converted' || r.status === 'declined'),
)
const busyId = ref<string | null>(null)

async function setStatus(request: TrialRequest, status: TrialRequestStatus): Promise<void> {
  busyId.value = request.id
  try {
    await setTrialRequestStatus(request.id, status)
    toast.show(`${request.businessName}: ${trialRequestStatus[status].label.toLowerCase()}`)
    await Promise.all([requests.refresh(), badge.refresh()])
  } catch (e) {
    toast.error(e)
  } finally {
    busyId.value = null
  }
}

/** Called by the page after the business was created from this request. */
async function markConverted(id: string): Promise<void> {
  const request = requests.data.value?.find((r) => r.id === id)
  if (request) await setStatus(request, 'converted')
}
defineExpose({ markConverted })
</script>

<template>
  <AppCard
    v-if="requests.data.value?.length"
    title="Free-trial requests"
    description="Sent from the Contact page. Follow up, then add the business to start its trial."
    :padded="false"
  >
    <ul v-if="open.length" class="divide-charcoal-100 divide-y">
      <li v-for="r in open" :key="r.id" class="flex flex-wrap items-start gap-4 px-5 py-4">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-charcoal-700 font-semibold">{{ r.businessName }}</p>
            <AppBadge :tone="trialRequestStatus[r.status].tone">{{
              trialRequestStatus[r.status].label
            }}</AppBadge>
            <AppBadge v-if="r.planId" tone="brand" :dot="false"
              >Wants: {{ planName(r.planId) }}</AppBadge
            >
            <span class="text-charcoal-400 text-xs">{{ formatRelative(r.createdAt) }}</span>
          </div>
          <p class="text-charcoal-500 mt-0.5 text-sm">
            {{ r.contactName
            }}<template v-if="r.courts">
              · {{ r.courts }} {{ r.courts === 1 ? 'court' : 'courts' }}</template
            >
          </p>
          <div class="text-charcoal-500 mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            <a
              :href="`mailto:${r.email}`"
              class="hover:text-brand-700 inline-flex items-center gap-1"
            >
              <Mail class="size-3.5" aria-hidden="true" />{{ r.email }}
            </a>
            <a
              v-if="r.phone"
              :href="`tel:${r.phone.replace(/\s/g, '')}`"
              class="hover:text-brand-700 inline-flex items-center gap-1"
            >
              <Phone class="size-3.5" aria-hidden="true" />{{ r.phone }}
            </a>
            <span v-if="r.city" class="inline-flex items-center gap-1">
              <MapPin class="size-3.5" aria-hidden="true" />{{ r.city }}
            </span>
          </div>
          <p
            v-if="r.message"
            class="bg-charcoal-50 text-charcoal-600 mt-2 rounded-lg px-3 py-2 text-sm"
          >
            “{{ r.message }}”
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <AppButton size="sm" @click="emit('addBusiness', r)">Add business</AppButton>
          <AppButton
            v-if="r.status === 'new'"
            size="sm"
            variant="outline"
            :loading="busyId === r.id"
            @click="setStatus(r, 'contacted')"
            >Mark contacted</AppButton
          >
          <AppButton
            size="sm"
            variant="ghost"
            :disabled="busyId === r.id"
            @click="setStatus(r, 'declined')"
            >Decline</AppButton
          >
        </div>
      </li>
    </ul>
    <p v-else class="text-charcoal-400 px-5 py-6 text-sm">No open requests.</p>

    <div v-if="handled.length" class="border-charcoal-100 border-t px-5 py-3">
      <button
        type="button"
        class="text-charcoal-500 hover:text-charcoal-700 text-xs font-semibold"
        :aria-expanded="showHandled"
        @click="showHandled = !showHandled"
      >
        {{ showHandled ? 'Hide' : 'Show' }} {{ handled.length }} handled
      </button>
      <ul v-if="showHandled" class="mt-2 space-y-1.5">
        <li v-for="r in handled" :key="r.id" class="flex items-center gap-2 text-sm">
          <span class="text-charcoal-600">{{ r.businessName }}</span>
          <span class="text-charcoal-400 text-xs">{{ r.email }}</span>
          <AppBadge :tone="trialRequestStatus[r.status].tone" class="ml-auto">{{
            trialRequestStatus[r.status].label
          }}</AppBadge>
          <button
            type="button"
            class="text-charcoal-400 hover:text-charcoal-700 text-xs underline"
            @click="setStatus(r, 'new')"
          >
            Reopen
          </button>
        </li>
      </ul>
    </div>
  </AppCard>
</template>
