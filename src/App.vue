<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorToasts from '@/components/ErrorToasts.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <RouterView />
  <ErrorToasts />
  <LanguagePicker v-if="!settings.languageChosen" />
</template>
