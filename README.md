# Usage Pet 🌱

A little pixel critter ("Sprout") that sits on your Windows desktop and shows your Claude usage limits.
The plant on its head wilts and it gets sleepier as you approach a limit; at 100% it falls asleep until the window resets.

| Mood | When | Look |
|---|---|---|
| happy | under 40% | ^ ^ eyes, perky leaves, bouncing |
| ok | 40–74% | calm, breathing |
| tired | 75–89% | heavy eyelids, sweat drop, leaves sagging |
| exhausted | 90–99% | wilted leaves, grey |
| asleep | 100% | blue, eyes closed, Zzz |
| ? | not signed in / can't read usage | purple, question mark |

The mood follows whichever limit is closest to full (session, weekly, or a per-model weekly limit). Extra usage is shown but doesn't affect the mood.

## Using it

- **Hover** the pet → bubble with every limit, % used, and when it resets.
- **Click** → pin the bubble open (click again to close).
- **Double-click** → open Claude in your browser.
- **Drag** → move it anywhere; position is remembered.
- **Right-click** (or the tray icon) → menu: refresh, sign in/out, check interval, pet size, notifications at 80%/95%, start with Windows, quit.
- The tray dot changes color with the mood; its tooltip lists the numbers.

## First run / sign-in

The pet keeps its **own** small claude.ai login (separate from Chrome and from the Claude app).
On first launch a sign-in window opens. If Google sign-in is blocked there ("this browser may not be secure"), use **Continue with email** and enter the code Claude emails you. You only need to do this once.

Your login stays in the app's data folder (`%APPDATA%\Usage Pet`). "Sign out of Claude (pet only)" in the menu clears it.

## How it gets the numbers

It loads claude.ai in a hidden window using that login and reads the same data the **Settings → Usage** page shows (first the page's JSON endpoint, and if that ever changes, the text on the page itself). Nothing is sent anywhere else.
That endpoint is not an official public API, so a claude.ai update could break it until the parser is adjusted (`src/usage.js`).

## Running from source

Needs Node.js 20+.

```bash
npm install
npm start          # run it
npm test           # parser tests
npm run dist       # build dist/UsagePet-portable-<ver>.exe and an installer
```

## Files

```
src/main.js     tray, pet window, hidden claude.ai fetcher, login window, notifications, settings
src/usage.js    turns Claude's usage JSON / page text into meters, picks the mood (unit-tested)
src/sprite.js   Sprout's pixel art, drawn in code for each mood
src/pet.*       the pet page: animation, bubble, drag/click handling
scripts/        icon + preview generation
test/           parser tests
```

## Ideas for later

- Pet walks along the taskbar when idle
- History sparkline in the bubble
- ESP32 / LED version of Sprout that mirrors the same mood on your desk
