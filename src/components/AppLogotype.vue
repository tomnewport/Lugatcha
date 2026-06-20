<template>
  <!--
    SVG wordmark — Russo One bold-geometric display, gradient lapis→gold.
    The <h1> wrapper keeps heading semantics; shadows applied via CSS.
    Font is bundled at /fonts/russo-one-latin.woff2 for offline PWA use.
  -->
  <svg
    viewBox="0 0 540 92"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    style="display:block;width:100%;height:auto;overflow:visible"
  >
    <defs>
      <!-- Deep lapis → lapis → lighter lapis, spanning the text width -->
      <linearGradient id="lt-fill" gradientUnits="userSpaceOnUse" x1="80" y1="0" x2="460" y2="0">
        <stop offset="0%"   stop-color="#163d6e"/>
        <stop offset="50%"  stop-color="#1b4f8a"/>
        <stop offset="100%" stop-color="#2e6db4"/>
      </linearGradient>

      <!-- Same range for rule / ornaments -->
      <linearGradient id="lt-rule" gradientUnits="userSpaceOnUse" x1="64" y1="0" x2="476" y2="0">
        <stop offset="0%"   stop-color="#163d6e"/>
        <stop offset="50%"  stop-color="#1b4f8a"/>
        <stop offset="100%" stop-color="#2e6db4"/>
      </linearGradient>
    </defs>

    <!-- ── Main logotype text ── -->
    <text
      x="270"
      y="62"
      text-anchor="middle"
      font-family="'Russo One', Impact, 'Arial Black', sans-serif"
      font-size="58"
      font-weight="400"
      letter-spacing="3"
      fill="url(#lt-fill)"
    >Lugʻatcha</text>

    <!-- ── Decorative baseline rule ── -->

    <!-- Left arm -->
    <line x1="70"  y1="81" x2="232" y2="81"
      stroke="url(#lt-rule)" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>
    <!-- Left outer diamond -->
    <g transform="translate(64,81)">
      <rect x="-5" y="-5" width="10" height="10" fill="#1b4f8a" transform="rotate(45)"/>
    </g>

    <!-- Right arm -->
    <line x1="308" y1="81" x2="470" y2="81"
      stroke="url(#lt-rule)" stroke-width="1.5" stroke-linecap="round" opacity="0.9"/>
    <!-- Right outer diamond -->
    <g transform="translate(476,81)">
      <rect x="-5" y="-5" width="10" height="10" fill="#2e6db4" transform="rotate(45)"/>
    </g>

    <!-- Centre rub el hizb — ties the wordmark to the AppLogo emblem -->
    <g transform="translate(270,81)">
      <rect x="-9"   y="-9"   width="18" height="18" fill="#1b4f8a"/>
      <rect x="-9"   y="-9"   width="18" height="18" fill="#1b4f8a" transform="rotate(45)"/>
      <rect x="-6"   y="-6"   width="12" height="12" fill="#d6e6f5"/>
      <rect x="-6"   y="-6"   width="12" height="12" fill="#d6e6f5" transform="rotate(45)"/>
      <circle r="4.2" fill="#163d6e"/>
    </g>
  </svg>
</template>
