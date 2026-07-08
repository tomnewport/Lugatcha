<script setup lang="ts">
import { computed } from 'vue'
import { cropImageStyle } from '@/map/cityMap'
import homeCityMap from '@/assets/home-city-map.webp'

/**
 * A close-up of one building, cropped live from the shared city-map
 * illustration (home-city-map.webp) so every location gets a distinct, hand-
 * drawn visual for free. The whole image is laid out magnified inside a square
 * frame and offset so the location's marker sits dead centre; the frame clips
 * the rest. Locations with no place on the art fall back to a plain panel.
 */
const props = withDefaults(
  defineProps<{
    locationId: string
    /** Magnification of the source image; higher zooms tighter on the building. */
    zoom?: number
    /** Optional label letter shown when the location has no map crop. */
    fallbackLabel?: string
  }>(),
  { zoom: 2.6, fallbackLabel: '' },
)

const imageStyle = computed(() => cropImageStyle(props.locationId, props.zoom))
</script>

<template>
  <div class="crop" :class="{ 'crop--fallback': !imageStyle }" aria-hidden="true">
    <img v-if="imageStyle" class="crop__img" :src="homeCityMap" :style="imageStyle" alt="" />
    <span v-else-if="fallbackLabel" class="crop__letter">{{ fallbackLabel }}</span>
  </div>
</template>

<style scoped>
.crop {
  position: relative;
  overflow: hidden;
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: var(--radius-md);
  background: var(--home-map-bg, #dccba9);
  isolation: isolate;
}

.crop__img {
  position: absolute;
  height: auto;
  /* The crop magnifies the map past container width; the global img max-width
     rule would otherwise clamp it back to 100% and show the whole map. */
  max-width: none;
  user-select: none;
  pointer-events: none;
}

.crop--fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
}

.crop__letter {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-primary);
}
</style>
