#!/usr/bin/env node
/**
 * Tennis Court Booking — West Worthing Club
 * https://ebookingonline.net/mobile/226
 *
 * Runs Wednesday morning, waits until 07:00:00.5 then books:
 *   - Wednesday 17:30, 3 sessions (90 min)
 *   - Court 2 preferred; fallback to Courts 1, 3, 4
 *   - Adds Tim Walters (required), Michael Walters + Chris Walters (best-effort)
 */

const { execFileSync } = require('child_process')

// ─── Config ───────────────────────────────────────────────────────────────────

const CHROME = '/home/openclaw/.cache/ms-playwright/chromium-1208/chrome-linux/chrome'
const BASE_URL = 'https://ebookingonline.net/mobile/226'
const USER = '1550'
const PASS = 'Backhand69'

const COURTS = [
  [10, 'Court+2'],
  [9,  'Court+1'],
  [11, 'Court+3'],
  [12, 'Court+4'],
]

const PLAYERS = [
  { name: 'Tim Walters',     required: true  },
  { name: 'Michael Walters', required: false },
  { name: 'Chris Walters',   required: false },
]

const BOOK_HOUR   = 17
const BOOK_MIN    = 30
const SUBMIT_TIME = { hour: 7, min: 0, sec: 0, ms: 500 }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ENV = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: CHROME }

function ab(...args) {
  return execFileSync('agent-browser', args, { env: ENV, encoding: 'utf-8' }).trim()
}

function log(msg) {
  process.stdout.write(`[${new Date().toISOString()}] ${msg}\n`)
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

// Get ref for an element by its visible text in a fresh snapshot
function findRef(snapshot, text) {
  const lines = snapshot.split('\n')
  for (const line of lines) {
    if (line.includes(text)) {
      const m = line.match(/\[ref=(e\d+)\]/)
      if (m) return m[1]
    }
  }
  return null
}

function nextWednesday() {
  const now = new Date()
  let daysAhead = 3 - now.getDay()
  if (daysAhead <= 0) daysAhead += 7
  const weds = new Date(now)
  weds.setDate(now.getDate() + daysAhead)
  return weds
}

async function waitUntilSubmitTime() {
  const now = new Date()
  const target = new Date(now)
  target.setHours(SUBMIT_TIME.hour, SUBMIT_TIME.min, SUBMIT_TIME.sec, SUBMIT_TIME.ms)
  const ms = target.getTime() - Date.now()
  if (ms > 0) {
    log(`Waiting ${(ms / 1000).toFixed(1)}s until 07:00:00.5…`)
    await sleep(ms)
  }
}

// ─── Booking flow ─────────────────────────────────────────────────────────────

async function addPlayer(playerName, required) {
  log(`Adding ${playerName}…`)

  let snap = ab('snapshot', '-i')
  let addRef = findRef(snap, 'Add Player')
  if (!addRef) throw new Error('Add Player link not found')

  ab('click', `@${addRef}`)
  await sleep(800)

  snap = ab('snapshot', '-i')
  const searchRef = findRef(snap, 'Enter Member')
  if (!searchRef) throw new Error('Search box not found')

  ab('fill', `@${searchRef}`, playerName)
  await sleep(2000)
  ab('press', 'Enter')
  await sleep(1500)

  snap = ab('snapshot', '-i')
  const playerRef = findRef(snap, playerName)
  if (!playerRef) {
    if (required) throw new Error(`Required player "${playerName}" not found in search results`)
    log(`⚠ Optional player ${playerName} not found — skipping`)
    // Close the panel
    const closeRef = findRef(snap, 'Close')
    if (closeRef) ab('click', `@${closeRef}`)
    await sleep(500)
    return false
  }

  ab('click', `@${playerRef}`)
  await sleep(800)
  log(`✓ Added ${playerName}`)
  return true
}

async function tryBook(courtId, courtName, unixTime) {
  const displayName = courtName.replace('+', ' ')
  const url = `https://ebookingonline.net/mobile/session.php?court_id=${courtId}&court_name=${courtName}&time=${unixTime}&start=${unixTime}`
  log(`Trying ${displayName}…`)

  ab('open', url)
  await sleep(1000)

  const currentUrl = ab('get', 'url')
  if (!currentUrl.includes('session.php')) {
    log(`Redirected to ${currentUrl} — court unavailable`)
    return false
  }

  let snap = ab('snapshot', '-i')

  // Check for maintenance/unavailable pre-form
  const pageText = ab('get', 'text', 'body')
  if (/closed for maintenance|not available|no booking/i.test(pageText)) {
    log(`Court ${displayName} unavailable (maintenance/closed)`)
    return false
  }

  // Select 3 sessions
  log('Selecting 3 sessions…')
  const comboRef = findRef(snap, 'combobox') || findRef(snap, 'One')
  const comboMatch = snap.match(/combobox \[ref=(e\d+)\]/)
  if (!comboMatch) throw new Error('Session combobox not found')
  ab('select', `@${comboMatch[1]}`, 'Three')
  await sleep(500)

  // Add players
  for (const player of PLAYERS) {
    try {
      await addPlayer(player.name, player.required)
    } catch (err) {
      if (player.required) throw err
      log(`⚠ Could not add ${player.name}: ${err.message}`)
    }
  }

  // Wait until booking window opens
  await waitUntilSubmitTime()

  // Submit
  log('Submitting booking…')
  snap = ab('snapshot', '-i')
  const bookRef = findRef(snap, 'Book now')
  if (!bookRef) throw new Error('"Book now" button not found')

  ab('click', `@${bookRef}`)
  await sleep(3000)

  const resultUrl = ab('get', 'url')
  const result = ab('get', 'text', 'body')
  log(`Post-submit URL: ${resultUrl}`)
  log(`Post-submit text (first 400): ${result.slice(0, 400)}`)

  // Court taken / maintenance — three known failure messages from testing:
  //   1. "Sorry - Requested court time ... is already booked"  (maintenance or any other block)
  //   2. "Player X is already booked to play during these times on another court" (slot taken)
  //   3. "This sport requires a minimum of 2 unique players" (shouldn't happen; guard anyway)
  if (/sorry.*already booked/i.test(result)) {
    log(`❌ ${displayName} — court unavailable (already booked / maintenance)`)
    return false
  }
  if (/already booked to play during these times/i.test(result)) {
    log(`❌ ${displayName} — slot taken (players double-booked on another court)`)
    return false
  }
  if (/minimum of 2 unique players|not available|failed/i.test(result)) {
    log(`❌ ${displayName} — booking error`)
    return false
  }

  // Success: URL moves away from session.php, or confirmation text
  if (!resultUrl.includes('session.php') || /confirmed|booking ref|thank you/i.test(result)) {
    log(`✅ Booking confirmed for ${displayName}!`)
    return true
  }

  // Still on session.php with no obvious error — take a screenshot for manual review
  ab('screenshot', `/home/openclaw/.openclaw/workspace/tennis-booking/booking-result-${courtId}.png`)
  log(`⚠ Ambiguous result — screenshot saved. Treating as success to avoid double-booking. Check manually.`)
  return true
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Tennis Booking starting ===')

  const weds = nextWednesday()
  weds.setHours(BOOK_HOUR, BOOK_MIN, 0, 0)
  const unixTime = Math.floor(weds.getTime() / 1000)
  log(`Target: ${weds.toDateString()} at ${BOOK_HOUR}:${String(BOOK_MIN).padStart(2, '0')}`)

  // Login
  log('Logging in…')
  ab('open', BASE_URL)
  await sleep(1000)

  let snap = ab('snapshot', '-i')
  const userRef  = findRef(snap, 'User ID')
  const passRef  = findRef(snap, 'Password')
  const loginRef = findRef(snap, 'Login')
  if (!userRef || !passRef || !loginRef) throw new Error('Login form not found')

  ab('fill', `@${userRef}`, USER)
  ab('fill', `@${passRef}`, PASS)
  ab('click', `@${loginRef}`)
  await sleep(2000)

  const afterLogin = ab('get', 'url')
  if (afterLogin.includes('login')) throw new Error('Login failed — still on login page')
  log(`✓ Logged in (${afterLogin})`)

  // Try courts in order
  let booked = false
  for (const [courtId, courtName] of COURTS) {
    try {
      booked = await tryBook(courtId, courtName, unixTime)
      if (booked) break
    } catch (err) {
      log(`Error trying ${courtName}: ${err.message}`)
    }
  }

  try { ab('close') } catch {}

  if (!booked) {
    log('❌ All courts failed — no booking made')
    process.exit(1)
  }

  log('=== Done ===')
}

main().catch(err => {
  log(`Fatal: ${err.message}`)
  try { ab('close') } catch {}
  process.exit(1)
})
