<script setup lang="ts">
import LegalPage from '@/components/marketing/LegalPage.vue'

import { legalUpdated, privacySections } from './legalContent'
</script>

<template>
  <LegalPage title="Privacy Policy" :updated="legalUpdated" :sections="privacySections" />
</template>
