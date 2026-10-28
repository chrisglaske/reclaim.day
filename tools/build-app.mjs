// Builds the app as one static page: app/Index.html with every include inlined, no server needed.
//   node tools/build-app.mjs   → dist/app/index.html (+ js, css, icons, fonts, manifest, 404.html, robots.txt, _headers), served at app.reclaim.day by app-host/
// The page signs in with Google and keeps data in Drive (scripts/signin.html). The OAuth Client ID
// is public by design: Google only accepts it from app.reclaim.day (and http://localhost:8765).
// Each inline <script> becomes its own file in js/ (named by content hash, same order, still classic blocking
// scripts), so the CSP needs no 'unsafe-inline' or long hash list: _headers allows only this origin plus Google
// sign-in and the Drive API. It is report-only for now (violations show in the console) until it has run clean.
// Fonts get content-hashed names too, so js/ and fonts/ can be cached for a year. The app is noindex: it is a
// sign-in screen, and the site at reclaim.day is what search should find.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertResolved, inlineIncludes, readIndex, repoRoot } from './lib/inline-app.mjs';

const CLIENT_ID = '128748275972-iecg6igvb8t32neo8iabj42vgrrb4vu7.apps.googleusercontent.com';
const ICONS = ['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];
const FONTS = ['inter-latin.woff2', 'bricolage-grotesque-latin.woff2'];
const LICENSES = ['inter-OFL.txt', 'bricolage-grotesque-OFL.txt'];
const hash = body => createHash('sha256').update(body).digest('hex').slice(0, 10);

// app/fonts holds the font files and their licenses, app/icons the icons (the site's Vite build uses both too).
const fonts = FONTS.map(name => {
  const body = readFileSync(join(repoRoot, 'app/fonts', name));
  return [name, name.replace('.woff2', `.${hash(body)}.woff2`), body];
});
const hashFonts = text => fonts.reduce((out, [name, hashed]) => {
  if (!out.includes(`/fonts/${name}`)) throw new Error(`/fonts/${name} is not referenced; did the font change?`);
  return out.replaceAll(`/fonts/${name}`, `/fonts/${hashed}`);
}, text);

const config = `<script>window.reclaimGoogle = { clientId: '${CLIENT_ID}' };</script>`;
const head = `${config}
  <meta name="robots" content="noindex">
  <link rel="preload" href="https://accounts.google.com/gsi/client" as="script">
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png">
  <link rel="manifest" href="/manifest.webmanifest">`;
const html = hashFonts(inlineIncludes(readIndex()).replace('<title>', head + '\n  <title>'));
assertResolved(html, 'the app build');

// Every <style> block goes, in order, into one hashed stylesheet linked where the first one was, so the
// ~125 KB of CSS is cached between visits instead of downloaded with every page load.
const styles = [];
const styled = html.replace(/<style>([\s\S]*?)<\/style>\n?/g, (_, body) => (styles.push(body.trim()), styles.length === 1 ? '<!--css-->\n' : ''));
const css = styles.join('\n');
const cssName = `css/app-${hash(css)}.css`;

const scripts = [];
const page = styled.replace('<!--css-->', `<link rel="stylesheet" href="/${cssName}">`).replace(/<script>([\s\S]*?)<\/script>/g, (_, body) => {
  const name = `js/${String(scripts.length + 1).padStart(2, '0')}-${hash(body)}.js`;
  scripts.push([name, body]);
  return `<script src="/${name}"></script>`;
});
if (/<script>/.test(page)) throw new Error('An inline <script> was left in the page');
if (/<style>/.test(page)) throw new Error('An inline <style> was left in the page');
if (/\son[a-z]+="/.test(page)) throw new Error('Inline event handler attributes are blocked by the CSP; use a listener');

// The GIS token client loads its script and stylesheet from accounts.google.com/gsi/ and talks to it from there.
const csp = [
  "default-src 'none'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "font-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://www.googleapis.com https://accounts.google.com/gsi/",
  'frame-src https://accounts.google.com/gsi/',
  "manifest-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'"
].join('; ');

const headers = `/*
  Content-Security-Policy-Report-Only: ${csp}
  X-Robots-Tag: noindex
  X-Frame-Options: DENY
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Strict-Transport-Security: max-age=31536000; includeSubDomains
  Cross-Origin-Opener-Policy: same-origin-allow-popups
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()

/js/*
  Cache-Control: public, max-age=31536000, immutable

/css/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;

// Installable (no service worker: opening needs Google sign-in anyway, and nothing can go stale).
// Zine colors (new users' look) match the startup screen, so the splash doesn't flash; the page sets theme-color per look.
const manifest = JSON.stringify({
  id: '/',
  name: 'Reclaim',
  short_name: 'Reclaim',
  description: 'A free, calm companion for quitting, cutting back or just keeping track of smoking, vaping, drinking and medication.',
  lang: 'en',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  background_color: '#FFF4D9',
  theme_color: '#FFF4D9',
  icons: [
    { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
  ],
  // Points at itself, so a browser tab can ask whether this app is installed (signin.html, getInstalledRelatedApps).
  related_applications: [{ platform: 'webapp', url: 'https://app.reclaim.day/manifest.webmanifest', id: 'https://app.reclaim.day/' }]
}, null, 2) + '\n';

// Unknown paths get this page with a 404 (app-host: notFoundHandling 404-page) instead of the app.
const notFound = hashFonts(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="theme-color" content="#FFF4D9">
  <title>Page not found · Reclaim</title>
  <link rel="icon" href="/favicon.ico" sizes="32x32">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <style>
    @font-face { font-family:'Bricolage Grotesque'; font-weight:400 800; font-display:swap; src:url(/fonts/bricolage-grotesque-latin.woff2) format('woff2'); }
    @font-face { font-family:'Inter'; font-weight:400 800; font-display:swap; src:url(/fonts/inter-latin.woff2) format('woff2'); }
    body { margin:0; min-height:100vh; display:grid; place-items:center; padding:24px; box-sizing:border-box; background:#FFF4D9; color:#0A1F5C; font:16px/1.6 'Inter',system-ui,sans-serif; text-align:center; }
    h1 { margin:0 0 8px; font:700 24px/1.3 'Bricolage Grotesque','Inter',system-ui,sans-serif; }
    p { margin:0 0 24px; color:#46507A; }
    a { display:inline-block; min-height:44px; box-sizing:border-box; padding:10px 24px; border-radius:14px; background:#2A51B8; color:#FFE9A8; font-weight:600; text-decoration:none; }
    a:focus-visible { outline:3px solid #2A51B8; outline-offset:4px; }
    @media (prefers-color-scheme:dark) { body { background:#0F1512; color:#ECEFEE; } p { color:#A6ADA9; } a { background:#88D7B9; color:#0B2A20; } a:focus-visible { outline-color:#88D7B9; } }
  </style>
</head>
<body>
  <main>
    <h1>Page not found</h1>
    <p>There’s nothing at this address.</p>
    <a href="/">Open Reclaim</a>
  </main>
</body>
</html>
`);

// The page itself says noindex, so crawlers are allowed to fetch it and see that.
const robots = 'User-agent: *\nAllow: /\n';

const out = join(repoRoot, 'dist/app');
['js', 'css', 'fonts'].forEach(dir => rmSync(join(out, dir), { recursive: true, force: true }));
['js', 'css', 'fonts'].forEach(dir => mkdirSync(join(out, dir), { recursive: true }));
writeFileSync(join(out, 'index.html'), page);
writeFileSync(join(out, cssName), css);
writeFileSync(join(out, 'manifest.webmanifest'), manifest);
scripts.forEach(([name, body]) => writeFileSync(join(out, name), body));
writeFileSync(join(out, '_headers'), headers);
writeFileSync(join(out, '404.html'), notFound);
writeFileSync(join(out, 'robots.txt'), robots);
ICONS.forEach(name => copyFileSync(join(repoRoot, 'app/icons', name), join(out, name)));
fonts.forEach(([, hashed, body]) => writeFileSync(join(out, 'fonts', hashed), body));
LICENSES.forEach(name => copyFileSync(join(repoRoot, 'app/fonts', name), join(out, 'fonts', name)));
console.log('app built:', (page.length / 1024).toFixed(0) + ' KB → dist/app/index.html +', scripts.length, 'scripts in js/ +', (css.length / 1024).toFixed(0) + ' KB in', cssName);
