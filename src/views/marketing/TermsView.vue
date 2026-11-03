<script setup lang="ts">
import LegalPage from '@/components/marketing/LegalPage.vue'

import { legalUpdated, termsSections } from './legalContent'
</script>

<template>
  <LegalPage title="Terms and Conditions" :updated="legalUpdated" :sections="termsSections" />
</template>
