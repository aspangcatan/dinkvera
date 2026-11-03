<script setup lang="ts">
/** Eyebrow + headline + lead paragraph that opens a landing-page section. */
withDefaults(
  defineProps<{
    eyebrow: string
    title: string
    lead?: string
    dark?: boolean
    center?: boolean
  }>(),
  { lead: '', dark: false, center: false },
)
</script>

<template>
  <div data-reveal :class="center ? 'mx-auto max-w-3xl text-center' : 'max-w-3xl'">
    <p
      class="inline-flex items-center gap-2 text-xs font-semibold tracking-[0.16em] uppercase"
      :class="dark ? 'text-ball' : 'text-court-2'"
    >
      <span class="h-px w-6" :class="dark ? 'bg-ball/60' : 'bg-court-2/50'" />
      {{ eyebrow }}
    </p>
    <h2
      class="mt-4 font-sans text-3xl leading-[1.1] font-extrabold tracking-tight text-balance sm:text-4xl lg:text-[2.75rem]"
      :class="dark ? 'text-white' : 'text-court'"
    >
      {{ title }}
    </h2>
    <p
      v-if="lead"
      class="mt-4 text-lg leading-relaxed text-pretty"
      :class="dark ? 'text-white/70' : 'text-ink/70'"
    >
      {{ lead }}
    </p>
  </div>
</template>
