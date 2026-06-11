<script setup lang="ts">
import { RouterView } from 'vue-router'
import ErrorToasts from '@/components/ErrorToasts.vue'
</script>

<template>
  <RouterView />
  <ErrorToasts />
</template>
