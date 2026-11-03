<script setup lang="ts">
import BrandLogo from '@/components/layout/BrandLogo.vue'
import AppButton from '@/components/ui/AppButton.vue'
</script>

<template>
  <div
    class="bg-warm-white flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center"
  >
    <BrandLogo />
    <p class="font-display text-forest-800 mt-6 text-6xl">404</p>
    <p class="text-charcoal-500">That page is out of bounds.</p>
    <AppButton to="/">Back to start</AppButton>
  </div>
</template>
