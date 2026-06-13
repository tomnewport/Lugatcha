<script setup lang="ts">
import { computed } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import ErrorToasts from '@/components/ErrorToasts.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const route = useRoute()

const showFooter = computed(() =>
  ['home', 'settings', 'school', 'travel'].includes(String(route.name)),
)
</script>

<template>
  <RouterView />
  <ErrorToasts />
  <LanguagePicker v-if="!settings.languageChosen" />
  <AppFooter v-if="showFooter" />
</template>
