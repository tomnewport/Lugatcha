/**
 * Offline navigation smoke test.
 *
 * Serves the production build, lets the service worker install, then wipes
 * IndexedDB and goes offline before reloading — proving the app shell, the
 * precached content data, and a full re-seed all work with no network.
 *
 * Usage:
 *   npm run build
 *   node scripts/offline-smoke.mjs
 *
 * Needs a Chrome/Chromium binary: set CHROME_PATH, or it tries common
 * locations (macOS Chrome, puppeteer cache).
 */
import puppeteer from 'puppeteer-core'
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'

const PORT = 4399
const URL_BASE = `http://localhost:${PORT}/Lugatcha/`

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ]
  const cacheRoot = `${process.env.HOME}/.cache/puppeteer/chrome-headless-shell`
  if (existsSync(cacheRoot)) {
    for (const dir of readdirSync(cacheRoot)) {
      candidates.push(`${cacheRoot}/${dir}/chrome-headless-shell-linux64/chrome-headless-shell`)
    }
  }
  const found = candidates.find((c) => existsSync(c))
  if (!found) {
    console.error('No Chrome binary found — set CHROME_PATH')
    process.exit(2)
  }
  return found
}

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT)], { stdio: 'ignore' })
const fail = (msg) => {
  console.error(`OFFLINE SMOKE FAIL: ${msg}`)
  server.kill()
  process.exit(1)
}

// Wait for the server
for (let i = 0; ; i++) {
  try {
    const res = await fetch(URL_BASE)
    if (res.ok) break
  } catch {
    if (i > 40) fail('preview server did not start')
    await new Promise((r) => setTimeout(r, 250))
  }
}

const browser = await puppeteer.launch({ executablePath: findChrome(), args: ['--no-sandbox'] })
try {
  const page = await browser.newPage()
  await page.setViewport({ width: 390, height: 844 })

  // 1. Online visit: install the service worker, wait until it controls the page
  await page.goto(URL_BASE, { waitUntil: 'networkidle0' })
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 30000 })
    .catch(async () => {
      await page.reload({ waitUntil: 'networkidle0' })
      await page.waitForFunction(() => navigator.serviceWorker?.controller != null, { timeout: 30000 })
    })
  console.log('service worker controlling the page')

  // 2. Wipe IndexedDB so the offline run has to re-seed from precached data
  await page.evaluate(() => new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('lugatcha')
    req.onsuccess = req.onerror = req.onblocked = () => resolve(null)
  }))

  // 3. Warm a couple of clips the way the Settings download does, so the
  //    offline pass can prove the audio path end to end: the manifest that maps
  //    spoken text to a filename, and the clips themselves. Without the
  //    manifest every word is invisible however much audio was downloaded, and
  //    the app reads Uzbek out in the device's default voice.
  const clips = await page.evaluate(async (baseUrl) => {
    const res = await fetch(`${baseUrl}audio/yandex/manifest.json`)
    if (!res.ok) return null
    const manifest = await res.json()
    const files = Object.values(manifest)
      .map((e) => (typeof e === 'string' ? e : e.file))
      .slice(0, 3)
    for (const file of files) {
      const clip = await fetch(`${baseUrl}audio/yandex/${file}`)
      if (!clip.ok) return null
      await clip.blob()
    }
    return files
  }, URL_BASE)
  if (!clips) fail('could not warm the audio cache online')
  console.log(`warmed ${clips.length} audio clips`)

  // 4. Go offline and reload
  await page.setOfflineMode(true)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.tile', { timeout: 15000 }).catch(() => fail('home grid did not render offline'))
  console.log('home grid renders offline')

  // 5. The audio lookup and the warmed clips both survive the network going
  //    away. A miss here is the difference between hearing the recordings you
  //    downloaded and hearing an English voice mispronounce them.
  const audio = await page.evaluate(async (baseUrl, files) => {
    const res = await fetch(`${baseUrl}audio/yandex/manifest.json`).catch(() => null)
    if (!res?.ok) return 'manifest'
    for (const file of files) {
      const clip = await fetch(`${baseUrl}audio/yandex/${file}`).catch(() => null)
      if (!clip?.ok) return file
    }
    return null
  }, URL_BASE, clips)
  if (audio) fail(`audio unavailable offline: ${audio}`)
  console.log('audio manifest and cached clips available offline')

  // 6. Pick a language. The wiped database means this is a first run, so the
  //    picker is up; dismissing it the way a learner does keeps the rest of the
  //    walk honest rather than reaching past a modal.
  await page.waitForSelector('.lp-option', { timeout: 15000 }).catch(() => fail('language picker did not render offline'))
  await page.evaluate(() => document.querySelector('.lp-option').click())
  await page.waitForFunction(() => document.querySelector('.lp-overlay') == null, { timeout: 15000 })
    .catch(() => fail('language picker did not close'))
  console.log('language picker renders and closes offline')

  // 7. Open a location and start the intro — requires the offline re-seed to have
  //    worked. With no progress the only unlocked tile is the Welcome Center,
  //    which opens on its induction checklist rather than the location menu.
  await page.evaluate(() => [...document.querySelectorAll('.tile')].find((t) => !t.disabled).click())
  await page.waitForSelector('.welcome .continue', { timeout: 15000 })
    .catch(() => fail('welcome centre induction did not render offline'))
  await page.evaluate(() => document.querySelector('.welcome .continue').click())
  await page.waitForSelector('.word-card', { timeout: 15000 }).catch(() => fail('intro words did not load offline (seed failed)'))
  const word = await page.$eval('.word-card__uzbek', (e) => e.textContent.trim())
  console.log(`intro exercise loads offline (first word: ${word})`)

  // 8. Settings page offline
  await page.goto(`${URL_BASE}#/settings`, { waitUntil: 'networkidle0' }).catch(() => {})
  await page.waitForSelector('.settings-card', { timeout: 15000 }).catch(() => fail('settings did not render offline'))
  console.log('settings renders offline')

  console.log('OFFLINE SMOKE PASS')
} finally {
  await browser.close()
  server.kill()
}
