# How Reclaim works

Reclaim has no server. The page at app.reclaim.day is a set of static files. Once you sign in, your browser talks to Google Drive directly, and everything you log stays in one file in your own Drive. This page explains how that works, what's stored where, and the format of your data, so you can check it against the code or use your data elsewhere.

## The pieces

```
Your browser ──── app.reclaim.day        static files only (HTML, JS, CSS, fonts, icons)
     │
     ├──────────── accounts.google.com    Google sign-in: a one-hour access token
     │
     └──────────── www.googleapis.com     Google Drive API: your Reclaim folder
```

- **app.reclaim.day** is a Cloudflare Worker that only serves the built files ([`app-host/`](app-host)). It runs no code of its own per request and has no database. Like any web host, Cloudflare may keep standard request logs (such as IP address and page requested), but your tracking data never passes through it. The [live check](https://github.com/chrisglaske/reclaim.day/actions/workflows/live.yml) confirms those files are exactly what this repository builds.
- **Sign-in** ([`signin.html`](app/scripts/signin.html)) uses Google Identity Services. It asks for only the `drive.file` scope, which lets Reclaim see the files it created and nothing else in your Drive. The access token lasts an hour and is kept in memory only, never saved. A browser-only app gets no refresh token, so every visit starts with "Continue with Google". Near the end of the hour, your next click renews the token.
- **Storage** ([`storage-drive.html`](app/scripts/storage-drive.html)) holds every call the app makes to Drive. The Content Security Policy that [`build-app.mjs`](tools/build-app.mjs) writes lists only these destinations for connections: the app itself, `www.googleapis.com` and Google's sign-in script (report-only for now, while it's tested).

## What's in your Drive

```
My Drive
└── Reclaim
    ├── Live Data
    │   └── Reclaim Live Data.json                     everything you've logged
    └── Backups
        └── Reclaim Backup 2026-10-28 09-40-00.json    one per backup you make
```

- **The live file** is saved after each change. It is plain JSON, so you can open, download or copy it like any other file.
- **Backups** are full copies you make from Settings › Your data › Create backup (to Drive, as a download, or both), also offered before Erase. The name uses your local time. Restore from file reads one back (from version 3 on); to use a backup in Drive, download it first.
- **Finding the files again:** the folders and the live file carry a private Drive tag (`appProperties`, key `reclaim`) so the app still finds them after you move or rename them. If a tag is missing, the app finds the file by name and adds the tag.
- **Several devices:** the app remembers the live file's checksum from its last load or save. Before saving it checks the checksum again. If another device or tab changed the file in the meantime, it doesn't overwrite it and offers Load latest instead. When you come back to the tab, it checks the same way and picks up changes quietly.
- **Offline or busy:** if Drive can't be reached, the save is retried and your change is kept on the page as unsaved. The page warns you before you leave with unsaved changes.
- **Erase** deletes the live file. Backups stay in your Drive until you delete them.

## What stays in your browser

Only these small `localStorage` entries, none with health data:

| Key | What it holds |
|---|---|
| `reclaim-theme` | Your color look, so the loading screen uses it before your data arrives |
| `reclaim-signed-in` | `1` after you've signed in, so the screen says "Welcome back" (no account details; cleared on Sign out) |
| `reclaim-today-min` | Which Today sections you've collapsed |
| `reclaim-catchup-hidden` | The day you hid the line about recent doses |

Without sign-in (the local preview and the website's demo), the app keeps its data in `localStorage` under `reclaim-state-dev` instead of Drive.

## The data format

`Reclaim Live Data.json` and every backup have the same shape. The current format is version 5. Files from versions 2, 3 and 4 still load and are upgraded by adding defaults; nothing is renamed or dropped. The code that reads and upgrades the file is [`state.html`](app/scripts/state.html) (`migrate` and `normalizeState`).

Dates and times are ISO 8601 strings in UTC. Day keys are `YYYY-MM-DD` in your local time.

```jsonc
{
  "version": 5,
  "onboarded": true,
  "setupVersion": 3,
  "createdAt": "2026-01-01T00:00:00.000Z",
  "profile": {
    "name": "Alex",
    "currency": "USD",
    "reasons": ["Wake up clear-headed"],
    "goal": { "name": "New road bike", "amount": 1200 },
    "companion": { "theme": "zine", "toolkit": ["Go for a 10-minute walk"], "trackMedications": true }
  },
  "vices": {
    "smoking":  { "enabled": true, "perDay": 15, "costPerDay": 12.5, "unit": "cigarettes",
                  "phases": [{ "mode": "quit", "at": "2026-03-01T08:00:00.000Z", "target": 0 }] },
    "vaping":   { "enabled": false, "perDay": 0, "costPerDay": 0, "phases": [] },
    "drinking": { "enabled": true, "perDay": 4, "costPerDay": 16, "usual": { "amount": 28, "per": "week" },
                  "phases": [{ "mode": "reduce", "at": "2026-04-15T00:00:00.000Z", "target": 1 }] }
  },
  "meds": [{ "id": "bupropion-1740000000000", "name": "Bupropion XL", "dose": 150, "unit": "mg",
             "freq": 1, "slots": ["Morning"], "startDate": "2026-02-10T08:00:00.000Z", "active": true }],
  "slips":    [{ "id": "…", "vice": "smoking", "at": "2026-05-10T21:30:00.000Z", "amount": 1, "cost": 1.25,
                 "triggers": ["Stress"], "why": "", "action": "log", "kind": "slip" }],
  "cravings": [{ "id": "…", "vice": "smoking", "at": "2026-05-11T14:15:00.000Z" }],
  "doses":    { "2026-10-20": { "bupropion-1740000000000": [{ "slot": 0, "at": "2026-10-20T08:15:00.000Z" }] } },
  "journal":  { "2026-10-20": { "mood": 4, "text": "Felt grounded today.",
                                "checkins": { "morning": { "mood": 4, "sleepHours": 7.5 } } } }
}
```

| Key | What it holds |
|---|---|
| `version` | The format version, `5` |
| `onboarded`, `setupVersion` | Whether you've finished Guided setup, and for which release of it |
| `profile` | Your name, currency (`USD`, `CAD`, `EUR`, `GBP`, `AUD`, `NZD`), reasons, savings goal and optional country for support resources |
| `profile.companion` | Your toolkit, daily intentions, weekly reflections, questions for your doctor, dose times, look and display choices |
| `vices` | One entry each for `smoking`, `vaping` and `drinking`: on or off, your usual amount and spend, the count unit, and `phases` |
| `vices.*.phases` | Your goals over time, oldest first. `mode` is `quit`, `reduce` (with a `target` per day, per week, or on chosen weekdays) or `track` (no limit). A phase can start in the future, like a planned quit day |
| `meds` | Your medications: name, dose and unit, how often (`1` to `4` a day, or `prn` for as needed), dose times, start date, and whether it's active or archived |
| `slips` | Each cigarette, vape, drink or slip you logged: when, how much, what it cost, what was going on and your note |
| `cravings` | Each urge you rode out: which habit and when |
| `doses` | Doses by day, then by medication: which dose time (`slot`, `-1` for as needed) and when you took it, or that you skipped it and why |
| `journal` | Entries by day: mood (1 to 5), craving (0 to 10), sleep, intention, tags, your text, and the morning, afternoon and evening check-ins |

When the app loads a file, it fills in missing fields with defaults and drops values it can't use, so a hand-edited file may change on the next save. Keep a backup before editing the file yourself.
