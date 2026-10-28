# Security

Reclaim handles sign-in and people's health data in their own Google Drive, so security problems matter a lot. Thank you for reporting one.

## How to report

Please **don't open a public issue**. Email [contact@reclaim.day](mailto:contact@reclaim.day) with "Security" in the subject, what you found, and how to reproduce it. I'll reply within a week and keep you posted until it's fixed. If you'd like credit, say how you'd like to be named.

Please don't access anyone else's data, and only test with your own Google account.

## What's in scope

- The app at app.reclaim.day and the code in [`app/`](app), especially sign-in ([`signin.html`](app/scripts/signin.html)) and every call to Google Drive ([`storage-drive.html`](app/scripts/storage-drive.html))
- The build ([`tools/build-app.mjs`](tools/build-app.mjs)) and the security headers it writes
- The website at reclaim.day ([`site/`](site))

Problems in Google Drive, Google sign-in or Cloudflare themselves belong with those companies. [How Reclaim works](ARCHITECTURE.md) explains what runs where.
