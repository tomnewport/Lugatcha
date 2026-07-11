---
name: verify
description: Build, launch, and drive Lugʻatcha in a headless browser to verify changes end-to-end
---

# Verifying Lugʻatcha

- `npm ci`, then `npm run dev` → serves at `http://localhost:5173/Lugatcha/`. Hash routing: routes look like `#/location/<id>`, `#/practice`, `#/school`.
- Drive with Playwright and the preinstalled Chromium: `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.
- First run shows a language-picker modal — click "English" / «Русский» before anything else works.
- App state lives in IndexedDB `lugatcha` (Dexie). Useful stores to seed via `page.evaluate` + raw indexedDB, then reload:
  - `wordProgress`: `{ wordId, seenAt, lastResults: [], testPassed?: [] }` — a `seenAt` timestamp marks a word "met".
  - `locationProgress`: `{ locationId, completedExercises: [], visits, graduatedAt? }`.
- Welcome-center word ids (13, `welcome-center.*`) are in `public/data/words/welcome-center.json`.

Gotchas:

- The city is locked until the welcome-center gate passes; once it passes, the router redirects `#/` to `#/practice?required=1` unless `localStorage['lugatcha.lastPracticeAt']` is recent — set it before navigating home.
- Playwright uses a fresh browser profile per run, so reseed IndexedDB every run.
- Navigating directly between two `#/location/:id` URLs reuses LocationView without re-running `onMounted` (stale location header); go via `#/` like a real user.
- Choice-question options are `.option`; the typing question needs the "Tip" button clicked until "Show answer" appears.
