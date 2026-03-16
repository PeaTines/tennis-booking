#!/usr/bin/env node
/**
 * Test run — uses Court 7 (ID=15) at 08:30 (normally empty)
 * Goes through the full flow but does NOT click "Book now"
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const [key, ...rest] = line.trim().split('=')
    if (key && rest.length) process.env[key] = rest.join('=')
  })
}

const CHROME = '/home/openclaw/.cache/ms-playwright/chromium-1208/chrome-linux/chrome'

function ab(...args) {
  const env = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: CHROME }
  const result = execFileSync('agent-browser', args, { env, encoding: 'utf-8' })
  return result.trim()
}

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`) }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function nextWednesday() {
  const now = new Date()
  const day = now.getDay()
  let daysAhead = 3 - day
  if (daysAhead <= 0) daysAhead += 7
  const weds = new Date(now)
  weds.setDate(now.getDate() + daysAhead)
  return weds
}

async function main() {
  const weds = nextWednesday()
  weds.setHours(8, 30, 0, 0)
  const unixTime = Math.floor(weds.getTime() / 1000)
  const url = `https://ebookingonline.net/mobile/session.php?court_id=15&court_name=Court+7&time=${unixTime}&start=${unixTime}`

  log('=== TEST RUN (no booking will be made) ===')
  log(`Target: Court 7, ${weds.toDateString()} 08:30`)

  // Login
  log('Logging in...')
  ab('open', 'https://ebookingonline.net/mobile/226')
  ab('find', 'role', 'textbox', 'fill', process.env.TENNIS_USER, '--name', 'User ID:')
  ab('find', 'role', 'textbox', 'fill', process.env.TENNIS_PASS, '--name', 'Password:')
  ab('find', 'role', 'button', 'click', '--name', 'Login')
  await sleep(2000)
  log(`After login URL: ${ab('get', 'url')}`)

  // Navigate to booking page
  log('Opening booking page...')
  ab('open', url)
  await sleep(1000)
  log(`Booking URL: ${ab('get', 'url')}`)

  const snap1 = ab('snapshot', '-i')
  log(`Booking page snapshot:\n${snap1}`)

  // Select 3 sessions
  log('Selecting 3 sessions...')
  ab('find', 'role', 'combobox', 'select', 'Three')
  await sleep(500)

  // Add Tim Walters
  log('Adding Tim Walters...')
  ab('find', 'text', 'Add Player', 'click')
  await sleep(500)
  ab('find', 'role', 'textbox', 'fill', 'Tim Walters')
  await sleep(2000)
  ab('press', 'Enter')
  await sleep(1500)

  const snap2 = ab('snapshot', '-C')
  log(`After search snapshot:\n${snap2}`)

  if (snap2.includes('Tim Walters')) {
    ab('find', 'text', 'Tim Walters', 'click')
    await sleep(500)
    log('✓ Tim Walters added')
  } else {
    log('⚠ Tim Walters not found in results')
  }

  const snap3 = ab('snapshot', '-i')
  log(`Final state (before would-be submit):\n${snap3}`)

  log('=== TEST COMPLETE — no booking submitted ===')
  ab('close')
}

main().catch(err => {
  console.error(`Error: ${err.message}`)
  try { execFileSync('agent-browser', ['close'], { env: { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: CHROME } }) } catch {}
  process.exit(1)
})
