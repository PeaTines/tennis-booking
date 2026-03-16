# Tennis Court Booking Automation

Automated weekly court booking for West Worthing Club (ebookingonline.net).

## What it does

- Runs every Wednesday at 6:55am (Europe/London time)
- Logs into the booking site and navigates to the target court/time slot
- Waits until exactly **07:00:00.5** when the booking window opens
- Books **Court 2 at 17:30** for 3 sessions (90 min)
- Falls back to Courts 1 → 3 → 4 if Court 2 is unavailable
- Adds Tim Walters (required) and Michael/Chris Walters (best-effort) as players
- Sends a WhatsApp notification on success or failure

## Requirements

- Node.js
- [`agent-browser`](https://github.com/vercel-labs/agent-browser) — `npm install -g agent-browser`
- Chromium/Chrome (path configured in script)
- OpenClaw (for cron scheduling and WhatsApp notifications)

## Usage

```bash
node book.js
```

The script handles all timing internally — it will wait until 07:00:00.5 before submitting.

## Files

- `book.js` — main booking script
- `README.md` — this file

## Notes

- See `memory/tennis-booking.md` in the OpenClaw workspace for full project notes including court IDs, error messages, and booking URL patterns.
- Test runs should use Court 7 (ID=15) at a quiet time — it's normally empty.
