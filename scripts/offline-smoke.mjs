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

  // 3. Go offline and reload
  await page.setOfflineMode(true)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.waitForSelector('.tile', { timeout: 15000 }).catch(() => fail('home grid did not render offline'))
  console.log('home grid renders offline')

  // 4. Open a location and start the intro — requires the offline re-seed to have worked
  await page.evaluate(() => [...document.querySelectorAll('.tile')].find((t) => !t.disabled).click())
  await page.waitForSelector('.activity-card', { timeout: 15000 }).catch(() => fail('location potluck did not render offline'))
  await page.evaluate(() => [...document.querySelectorAll('.activity-card')].find((b) => !b.disabled).click())
  await page.waitForSelector('.word-card', { timeout: 15000 }).catch(() => fail('intro words did not load offline (seed failed)'))
  const word = await page.$eval('.word-card__uzbek', (e) => e.textContent.trim())
  console.log(`intro exercise loads offline (first word: ${word})`)

  // 5. Settings page offline
  await page.goto(`${URL_BASE}#/settings`, { waitUntil: 'networkidle0' }).catch(() => {})
  await page.waitForSelector('.settings-card', { timeout: 15000 }).catch(() => fail('settings did not render offline'))
  console.log('settings renders offline')

  console.log('OFFLINE SMOKE PASS')
} finally {
  await browser.close()
  server.kill()
}
