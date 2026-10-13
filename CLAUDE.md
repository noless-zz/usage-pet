# Usage Pet — context for Claude Code

Owner: Noam (teacher, ex-high-tech; comfortable with JS/Electron/ESP32). Target: **Windows** desktop.

## What this is
A desktop pet ("Sprout", an original pixel critter with a plant on its head) that shows Noam's
**Claude plan usage limits** (5-hour session, weekly, per-model weekly, extra usage).
Its mood follows the most-used limit: happy <40%, ok <75%, tired <90%, exhausted <100%, asleep at 100%,
"?" when not signed in or data can't be read. Extra usage is shown but never drives the mood.

Born from wanting (a) a usage-meter widget for all Claude apps on the PC and (b) a desktop pet like
the community ones (Clawd, Claude Pet, Claudlet) — none of those combine pet + usage limits.

## Decisions already made (keep unless Noam says otherwise)
- **Standalone Electron .exe** (option 1), not a Chrome extension, not a Windows 11 Widget, not Rainmeter.
- The app keeps its **own claude.ai login** in session partition `persist:claude` (separate from Chrome
  and the Claude desktop app). Login window opens on first run; Google sign-in may be blocked in
  embedded browsers → README tells the user to use "Continue with email".
- Usage is read in a **hidden BrowserWindow** logged into claude.ai:
  1. `fetch('/api/organizations')` → for each org `fetch('/api/organizations/{uuid}/usage')` (run inside the page via `executeJavaScript`, so it behaves like the real site incl. Cloudflare).
  2. Fallback: load `/settings/usage` and parse `document.body.innerText` for "NN% used".
- Usage JSON shapes handled (see `src/usage.js` + tests): keyed buckets
  `{five_hour:{utilization,resets_at}, seven_day:{…}, seven_day_<model>:{…}, extra_usage:{is_enabled,utilization}}`
  and a `limits:[{kind:'session'|'weekly_all'|'weekly_scoped', percent, resets_at, scope:{model:{display_name}}}]` array.
  `utilization` is 0–100. Past `resets_at` ⇒ treat as 0% (rollover).
- These endpoints are **unofficial**; expect breakage → keep parsing isolated in `src/usage.js` and tested.
- Did **not** use the OAuth-token approach some trackers use (Claude Code's OAuth client) — avoid it.

## Status
- Built and unit-tested on Linux (7 parser tests pass). Smoke-tested under Xvfb: app starts, detects
  logged-out state, opens login window, no main-process errors.
- **Not yet verified against a real logged-in account** — first real run on Noam's PC is the test.
  If the API path fails, check DevTools on the fetcher window (temporarily `show: true`) and adjust
  `API_SCRIPT` / `normalizeApiUsage`.
- Portable .exe built OK from Linux; NSIS installer needs wine there, but `npm run dist` works natively on Windows.

## Layout
- `src/main.js` — tray (colored dot, tooltip, menu), transparent always-on-top click-through pet window,
  hidden fetcher, login window, polling (default 5 min), 80/95% notifications, settings in `%APPDATA%\Usage Pet\settings.json`.
- `src/usage.js` — pure parsing/mood/format helpers (UMD: `require` in main, `window.PetUsage` in page).
- `src/sprite.js` — 24×24 pixel art drawn in code per mood × species (sprout, cat, bunny, bear, robot, ghost;
  UMD: `window.PetSprite`); also used for icon. Adding a species = entry in `SPECIES` + a branch in `decorate()`.
  Custom image pets (`opts.custom`, 576 colors) get mood tint + sweat drop, no face.
- `src/pixelize.js` — image → 24×24 pet (bg removal via alpha/flood-fill, crop, downsample, posterize, outline). Tested in `test/pets.test.js`.
  Tray menu "Choose pet" → species radio + "Make a pet from an image…" (file dialog in main.js `pickImagePet`; stored in settings `species`/`custom`).
- `src/pet.html|css|js` — canvas animation (~12fps), hover bubble with meters, drag/click/dblclick/right-click.
  Click-through: window ignores mouse except over the pet/bubble (IPC `pet:hit`).
- `src/preload.js` — `window.petAPI` bridge (contextIsolation on, no nodeIntegration).
- `scripts/make-assets.js` — writes `build/icon.png` + `build/preview.png`.

## Commands
- `npm install` · `npm start` · `npm test` · `npm run dist` (Windows portable + installer in `dist/`)

## Ideas / next steps Noam liked or was offered
- Pet walks along the taskbar when idle; usage-history sparkline in the bubble.
- ESP32 physical version of Sprout mirroring the same mood (Noam builds ESP/LED projects).
- A Claude "mod" (status line / panel inside Claude's own UI) showing the same meter.
