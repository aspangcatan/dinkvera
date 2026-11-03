<script setup lang="ts">
/** A product screenshot in a light browser window frame. */
withDefaults(
  defineProps<{
    src: string
    alt: string
    width: number
    height: number
    url?: string
    eager?: boolean
  }>(),
  { url: 'courtdesk.app', eager: false },
)
</script>

<template>
  <figure
    class="ring-court/10 overflow-hidden rounded-xl bg-white shadow-[0_30px_80px_-20px_rgba(18,62,53,0.45)] ring-1"
  >
    <div class="bg-mist border-court/10 flex items-center gap-1.5 border-b px-3 py-2">
      <span class="size-2.5 rounded-full bg-[#ff6b5f]" />
      <span class="size-2.5 rounded-full bg-[#ffbd2e]" />
      <span class="size-2.5 rounded-full bg-[#28c840]" />
      <span
        class="text-ink/60 mx-auto hidden max-w-[60%] truncate rounded-md bg-white px-3 py-0.5 text-[11px] sm:block"
        >{{ url }}</span
      >
    </div>
    <img
      :src="src"
      :alt="alt"
      :width="width"
      :height="height"
      :loading="eager ? 'eager' : 'lazy'"
      :fetchpriority="eager ? 'high' : 'auto'"
      decoding="async"
      class="block h-auto w-full"
    />
  </figure>
</template>
