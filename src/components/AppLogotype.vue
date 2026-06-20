<template>
  <!--
    SVG wordmark for Lugʻatcha.
    The <h1> wrapper keeps heading semantics; all visual styling is here.
    No internal shadow filter — the parent applies drop-shadow via CSS so
    the landscape/portrait treatments can differ without touching the SVG.
  -->
  <svg
    viewBox="0 0 480 90"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    style="display:block;width:100%;height:auto;overflow:visible"
  >
    <defs>
      <!-- Text fill: lapis lazuli → light blue → gold -->
      <linearGradient id="lt-fill" gradientUnits="userSpaceOnUse" x1="80" y1="0" x2="400" y2="0">
        <stop offset="0%"   stop-color="#1b4f8a"/>
        <stop offset="52%"  stop-color="#2e6db4"/>
        <stop offset="100%" stop-color="#c9a84c"/>
      </linearGradient>

      <!-- Rule / ornament gradient spanning the same horizontal range -->
      <linearGradient id="lt-rule" gradientUnits="userSpaceOnUse" x1="68" y1="0" x2="412" y2="0">
        <stop offset="0%"   stop-color="#1b4f8a"/>
        <stop offset="50%"  stop-color="#2e6db4"/>
        <stop offset="100%" stop-color="#c9a84c"/>
      </linearGradient>
    </defs>

    <!-- ── Main logotype text ── -->
    <text
      x="240"
      y="60"
      text-anchor="middle"
      font-family="Georgia, Cambria, 'Times New Roman', serif"
      font-size="56"
      font-weight="700"
      letter-spacing="1.5"
      fill="url(#lt-fill)"
    >Lugʻatcha</text>

    <!-- ── Decorative baseline rule ── -->

    <!-- Left arm of rule -->
    <line x1="74" y1="76" x2="226" y2="76"
      stroke="url(#lt-rule)" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>

    <!-- Left outer diamond ornament -->
    <g transform="translate(68,76)">
      <rect x="-4.5" y="-4.5" width="9" height="9" fill="#1b4f8a" transform="rotate(45)"/>
    </g>

    <!-- Right arm of rule -->
    <line x1="254" y1="76" x2="406" y2="76"
      stroke="url(#lt-rule)" stroke-width="1.2" stroke-linecap="round" opacity="0.9"/>

    <!-- Right outer diamond ornament -->
    <g transform="translate(412,76)">
      <rect x="-4.5" y="-4.5" width="9" height="9" fill="#c9a84c" transform="rotate(45)"/>
    </g>

    <!-- Centre rub el hizb (8-pointed star) — matches the AppLogo motif -->
    <g transform="translate(240,76)">
      <!-- Gold outer star -->
      <rect x="-8"   y="-8"   width="16" height="16" fill="#C9A84C"/>
      <rect x="-8"   y="-8"   width="16" height="16" fill="#C9A84C" transform="rotate(45)"/>
      <!-- Cream inner star -->
      <rect x="-5.5" y="-5.5" width="11" height="11" fill="#F5F0E8"/>
      <rect x="-5.5" y="-5.5" width="11" height="11" fill="#F5F0E8" transform="rotate(45)"/>
      <!-- Teal centre dot -->
      <circle r="3.8" fill="#1A5E52"/>
    </g>
  </svg>
</template>
