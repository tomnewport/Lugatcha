<template>
  <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <!-- Lapis lazuli background -->
    <circle cx="100" cy="100" r="98" fill="#1B4F8A"/>

    <!-- Gold outer ring -->
    <circle cx="100" cy="100" r="96" fill="none" stroke="#C9A84C" stroke-width="2.5"/>

    <!-- Slowly rotating dashed inner ring (animation via CSS) -->
    <circle
      class="logo-ring"
      cx="100" cy="100" r="83"
      fill="none"
      stroke="#C9A84C"
      stroke-width="1.2"
      stroke-dasharray="5.8 3.8"
      opacity="0.65"
    />

    <!-- 8-pointed gold star (rub el hizb — Uzbek tilework motif):
         two overlapping squares (0° and 45°) create the star shape -->
    <g transform="translate(100,100)">
      <rect x="-50" y="-50" width="100" height="100" fill="#C9A84C"/>
      <rect x="-50" y="-50" width="100" height="100" fill="#C9A84C" transform="rotate(45)"/>
      <!-- Cream inner star (cuts out the center of the gold star) -->
      <rect x="-35" y="-35" width="70" height="70" fill="#F5F0E8"/>
      <rect x="-35" y="-35" width="70" height="70" fill="#F5F0E8" transform="rotate(45)"/>
    </g>

    <!-- Open book (lugʻatcha = little dictionary) -->
    <g transform="translate(100,100)">
      <!-- Left page — slight perspective taper toward the spine -->
      <path
        d="M-26,-20 L-5,-16 L-5,21 L-26,20 Z"
        fill="#FFFCF5"
        stroke="#C9A84C" stroke-width="1.5" stroke-linejoin="round"
      />
      <!-- Right page — mirror taper -->
      <path
        d="M26,-20 L5,-16 L5,21 L26,20 Z"
        fill="#FFFCF5"
        stroke="#C9A84C" stroke-width="1.5" stroke-linejoin="round"
      />
      <!-- Spine binding -->
      <line x1="-4.5" y1="-16" x2="-4.5" y2="21" stroke="#C9A84C" stroke-width="2" stroke-linecap="round"/>
      <line x1="4.5"  y1="-16" x2="4.5"  y2="21" stroke="#C9A84C" stroke-width="2" stroke-linecap="round"/>
      <!-- Bottom bow — suggests the pages curve around the binding -->
      <path d="M-5,21 Q0,25.5 5,21" fill="none" stroke="#C9A84C" stroke-width="1.5" stroke-linecap="round"/>

      <!-- Text lines on left page (lapis blue — source language) -->
      <line x1="-21" y1="-8"   x2="-8" y2="-7"   stroke="#1B4F8A" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
      <line x1="-21" y1="0"    x2="-8" y2="0.5"   stroke="#1B4F8A" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
      <line x1="-21" y1="8"    x2="-8" y2="8.5"   stroke="#1B4F8A" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
      <line x1="-21" y1="15"   x2="-12" y2="15.3" stroke="#1B4F8A" stroke-width="1.4" opacity="0.3" stroke-linecap="round"/>

      <!-- Tiny rub el hizb on right page (Uzbek side) -->
      <g transform="translate(15,-3) scale(0.32)">
        <rect x="-17" y="-17" width="34" height="34" fill="#C9A84C"/>
        <rect x="-17" y="-17" width="34" height="34" fill="#C9A84C" transform="rotate(45)"/>
        <rect x="-11" y="-11" width="22" height="22" fill="#F5F0E8"/>
        <rect x="-11" y="-11" width="22" height="22" fill="#F5F0E8" transform="rotate(45)"/>
        <circle r="7" fill="#1A5E52"/>
      </g>

      <!-- Text lines on right page (teal — Uzbek language) -->
      <line x1="8" y1="8"  x2="22" y2="8.5"  stroke="#1A5E52" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
      <line x1="8" y1="15" x2="22" y2="15.5" stroke="#1A5E52" stroke-width="1.4" opacity="0.5" stroke-linecap="round"/>
    </g>

    <!-- 8 gold accent dots at compass + intercardinal positions (r ≈ 93 from centre) -->
    <circle cx="100" cy="7"   r="3.5" fill="#C9A84C"/>
    <circle cx="100" cy="193" r="3.5" fill="#C9A84C"/>
    <circle cx="7"   cy="100" r="3.5" fill="#C9A84C"/>
    <circle cx="193" cy="100" r="3.5" fill="#C9A84C"/>
    <circle cx="34"  cy="34"  r="2.8" fill="#C9A84C"/>
    <circle cx="166" cy="34"  r="2.8" fill="#C9A84C"/>
    <circle cx="34"  cy="166" r="2.8" fill="#C9A84C"/>
    <circle cx="166" cy="166" r="2.8" fill="#C9A84C"/>
  </svg>
</template>

<style scoped>
.logo-ring {
  transform-box: fill-box;
  transform-origin: center;
  animation: logo-ring-spin 24s linear infinite;
}

@media (prefers-reduced-motion: reduce) {
  .logo-ring {
    animation: none;
  }
}

@keyframes logo-ring-spin {
  to { transform: rotate(360deg); }
}
</style>
