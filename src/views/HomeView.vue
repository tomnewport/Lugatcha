<script setup lang="ts">
// Step 4 will replace this with the full 4×8 location grid
</script>

<template>
  <main class="home">
    <div class="hero">
      <div class="ornament" aria-hidden="true">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <!-- Simplified Suzani-inspired geometric motif -->
          <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="60" cy="60" r="8" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.5" fill="none">
            <line x1="60" y1="5" x2="60" y2="20" />
            <line x1="60" y1="100" x2="60" y2="115" />
            <line x1="5" y1="60" x2="20" y2="60" />
            <line x1="100" y1="60" x2="115" y2="60" />
            <line x1="21" y1="21" x2="31" y2="31" />
            <line x1="89" y1="89" x2="99" y2="99" />
            <line x1="99" y1="21" x2="89" y2="31" />
            <line x1="21" y1="99" x2="31" y2="89" />
          </g>
          <g fill="currentColor">
            <circle cx="60" cy="5"   r="3" />
            <circle cx="60" cy="115" r="3" />
            <circle cx="5"  cy="60"  r="3" />
            <circle cx="115" cy="60" r="3" />
            <circle cx="21" cy="21"  r="3" />
            <circle cx="99" cy="99"  r="3" />
            <circle cx="99" cy="21"  r="3" />
            <circle cx="21" cy="99"  r="3" />
          </g>
        </svg>
      </div>

      <h1 class="title">Lugʻatcha</h1>
      <p class="subtitle">A little dictionary</p>
      <p class="tagline">O'zbekcha o'rganamiz</p>
      <p class="tagline-en">Let's learn Uzbek</p>
    </div>

    <p class="coming-soon">The city is being built…</p>
  </main>
</template>

<style scoped>
.home {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2rem;
  padding: 2rem;
  background: var(--color-bg);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}

.ornament {
  width: 80px;
  height: 80px;
  color: var(--color-gold);
  margin-bottom: 1rem;
}

.title {
  font-size: clamp(2.5rem, 8vw, 4rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.subtitle {
  font-size: 1.1rem;
  color: var(--color-text-muted);
  margin: 0;
  font-style: italic;
}

.tagline {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--color-primary);
  margin: 0.75rem 0 0;
}

.tagline-en {
  font-size: 0.95rem;
  color: var(--color-text-muted);
  margin: 0;
}

.coming-soon {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: 0;
  opacity: 0.6;
}
</style>
