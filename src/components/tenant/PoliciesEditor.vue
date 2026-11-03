<script setup lang="ts">
import { ArrowDown, ArrowUp, FileText, Plus, Trash2 } from '@lucide/vue'

import AppButton from '@/components/ui/AppButton.vue'
import AppCard from '@/components/ui/AppCard.vue'
import AppInput from '@/components/ui/AppInput.vue'
import AppTextarea from '@/components/ui/AppTextarea.vue'
import type { TenantPolicy } from '@/types/tenant'
import { POLICY_BODY_MAX, POLICY_MAX_SECTIONS, policyTemplate } from '@/utils/policies'

/** Edits the list of rules & policies sections; saved by the page's Save button. */
const sections = defineModel<TenantPolicy[]>({ required: true })

function add(): void {
  sections.value = [...sections.value, { title: '', body: '' }]
}

function useTemplate(): void {
  sections.value = policyTemplate.map((p) => ({ ...p }))
}

function remove(index: number): void {
  sections.value = sections.value.filter((_, i) => i !== index)
}

function move(index: number, direction: -1 | 1): void {
  const list = [...sections.value]
  const to = index + direction
  if (to < 0 || to >= list.length) return
  ;[list[index], list[to]] = [list[to]!, list[index]!]
  sections.value = list
}
</script>

<template>
  <AppCard
    title="Rules & policies"
    description="Shown on your booking site. Customers agree to them before they book."
  >
    <div
      v-if="!sections.length"
      class="border-charcoal-200 rounded-xl border-2 border-dashed px-6 py-10 text-center"
    >
      <FileText class="text-charcoal-300 mx-auto size-8" aria-hidden="true" />
      <p class="text-charcoal-600 mt-3 font-medium">No rules or policies yet</p>
      <p class="text-charcoal-400 mx-auto mt-1 max-w-sm text-sm">
        Your booking site still shows your booking basics (cancellation window, payment hold). Add
        your house rules, refunds or dress code here.
      </p>
      <div class="mt-5 flex flex-wrap justify-center gap-2">
        <AppButton @click="useTemplate">Start from a template</AppButton>
        <AppButton variant="outline" @click="add">
          <Plus class="size-4" aria-hidden="true" /> Blank section
        </AppButton>
      </div>
    </div>

    <ol v-else class="space-y-4">
      <li
        v-for="(section, index) in sections"
        :key="index"
        class="border-charcoal-100 rounded-xl border p-4"
      >
        <div class="flex items-start gap-3">
          <span
            class="bg-brand-50 text-brand-700 mt-7 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            aria-hidden="true"
            >{{ index + 1 }}</span
          >
          <div class="min-w-0 flex-1 space-y-3">
            <AppInput
              v-model="section.title"
              :label="`Section ${index + 1} title`"
              placeholder="e.g. House rules"
            />
            <AppTextarea
              v-model="section.body"
              label="Details"
              :rows="5"
              :hint="`Start a line with “- ” for a bullet. Leave a blank line between paragraphs. ${section.body.length}/${POLICY_BODY_MAX}`"
            />
          </div>
          <div class="mt-6 flex shrink-0 flex-col gap-1">
            <button
              type="button"
              class="text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700 rounded-md p-1.5 disabled:opacity-30"
              :disabled="index === 0"
              :aria-label="`Move section ${index + 1} up`"
              @click="move(index, -1)"
            >
              <ArrowUp class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="text-charcoal-400 hover:bg-charcoal-100 hover:text-charcoal-700 rounded-md p-1.5 disabled:opacity-30"
              :disabled="index === sections.length - 1"
              :aria-label="`Move section ${index + 1} down`"
              @click="move(index, 1)"
            >
              <ArrowDown class="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              class="text-charcoal-400 rounded-md p-1.5 hover:bg-red-50 hover:text-red-600"
              :aria-label="`Remove section ${index + 1}`"
              @click="remove(index)"
            >
              <Trash2 class="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </li>
    </ol>

    <div v-if="sections.length" class="mt-4 flex flex-wrap items-center justify-between gap-3">
      <AppButton variant="outline" :disabled="sections.length >= POLICY_MAX_SECTIONS" @click="add">
        <Plus class="size-4" aria-hidden="true" /> Add section
      </AppButton>
      <p class="text-charcoal-400 text-xs">
        {{ sections.length }} of {{ POLICY_MAX_SECTIONS }} sections
      </p>
    </div>
  </AppCard>
</template>
