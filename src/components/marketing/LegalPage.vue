<script setup lang="ts">
import type { LegalSection } from '@/views/marketing/legalContent'
import { formatLongDate } from '@/utils/dates'

/** Privacy Policy / Terms layout on the marketing site. */
defineProps<{ title: string; updated: string; sections: LegalSection[] }>()
</script>

<template>
  <div>
    <section class="bg-court text-white">
      <div class="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:py-20">
        <p class="text-ball text-xs font-semibold tracking-[0.16em] uppercase">Legal</p>
        <h1 class="mt-3 font-sans text-4xl font-extrabold tracking-tight sm:text-5xl">
          {{ title }}
        </h1>
        <p class="mt-4 text-sm text-white/60">Last updated {{ formatLongDate(updated) }}</p>
      </div>
    </section>
    <article class="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:py-20">
      <nav
        class="border-court/10 mb-12 rounded-2xl border bg-white p-5 text-sm"
        aria-label="On this page"
      >
        <p class="text-court font-semibold">On this page</p>
        <ol class="text-ink/70 mt-3 grid gap-1.5 sm:grid-cols-2">
          <li v-for="(s, i) in sections" :key="s.heading">
            <a :href="`#section-${i + 1}`" class="hover:text-court-2 hover:underline"
              >{{ i + 1 }}. {{ s.heading }}</a
            >
          </li>
        </ol>
      </nav>
      <section
        v-for="(s, i) in sections"
        :id="`section-${i + 1}`"
        :key="s.heading"
        class="mb-10 scroll-mt-24"
      >
        <h2 class="text-court font-sans text-xl font-bold tracking-tight">
          {{ i + 1 }}. {{ s.heading }}
        </h2>
        <p v-for="(p, j) in s.paragraphs" :key="j" class="text-ink/75 mt-3 leading-relaxed">
          {{ p }}
        </p>
      </section>
    </article>
  </div>
</template>
