# Contributing

Thanks for wanting to help. Bug reports and ideas are just as welcome as code: [open an issue](../../issues/new/choose) or write to [contact@reclaim.day](mailto:contact@reclaim.day).

For anything bigger than a small fix, please open an issue first, so we can agree on it before you put in the work. Reclaim is a small, opinionated project, and some good ideas won't fit it.

## Run it

You need Node.js.

```sh
node tools/build-app.mjs                    # builds the app into dist/app
python3 -m http.server 8765 -d dist/app     # or any static server on port 8765
```

Open http://localhost:8765/ and sign in with Google. Port 8765 matters: the app's Google sign-in only accepts app.reclaim.day and localhost:8765. The app creates a `Reclaim` folder in that account's Drive, so a spare Google account is a good idea.

The website:

```sh
cd site && npm install && npm run dev       # http://localhost:5173/
```

[How Reclaim works](ARCHITECTURE.md) explains the pieces and the data format, and the [README](README.md) shows where things are.

## How Reclaim is built

- **Plain HTML, CSS and JavaScript.** No frameworks, no third-party scripts or CDNs, no new dependencies in the app.
- **One page.** `app/Index.html` includes the files in `app/styles/` and `app/scripts/`, and the order matters: the data layer, then the screens, then `start`. A new script file needs its own include line there.
- **No inline handlers.** Use `addEventListener`, not `onclick=` attributes. The build fails on them, so the Content Security Policy can block all inline scripts.
- **Your data stays compatible.** Files saved by older versions must keep loading, and nothing a person saved may be dropped. A format change needs a new `version` and a step in `migrate` in [`state.html`](app/scripts/state.html).
- **No server, no tracking.** The app talks only to Google sign-in and the Drive API, with the `drive.file` scope. No analytics, ads or other network calls.

## How Reclaim sounds

- **Calm and kind.** No guilt, grades or pressure. A slip is a note, not a failure. In "just track" mode, never use over/under language.
- **No medical claims.** Keep the existing medical warnings, and don't add advice about medication or health.
- **No notifications.** The app only shows what's due while it's open.
- **Accessible.** Labels on every control, enough contrast, everything usable by keyboard, and respect for reduced motion.
- **American English** spelling.

## Before you open a pull request

- `node tools/build-app.mjs` finishes without errors (the `checks` workflow builds the app and the site on every pull request).
- You've tried your change in the browser at phone and desktop width, and with the keyboard.
- If it changes how the app looks, include before and after screenshots with made-up data.
- If it changes saved data, describe how older files still load.

## License

By contributing, you agree that your contribution is licensed under the [GNU Affero General Public License v3.0](LICENSE), like the rest of Reclaim.
