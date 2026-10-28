import { defineConfig, type Plugin } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, relative } from 'node:path';

// Public pages for sitemap.xml (404 and the hashed assets stay out). lastmod is the page's last commit date,
// or today while it has uncommitted changes, so it moves when the page's own text does.
const PAGES = { '/': 'index.html', '/guides/': 'guides/index.html', '/guides/track-your-smoking/': 'guides/track-your-smoking/index.html', '/faq/': 'faq/index.html', '/whats-new/': 'whats-new/index.html', '/privacy/': 'privacy/index.html', '/terms/': 'terms/index.html', '/imprint/': 'imprint/index.html' };
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const lastmod = (file: string) => {
  const today = new Date().toISOString().slice(0, 10);
  try { return git('status', '--porcelain', '--', file) ? today : git('log', '-1', '--format=%cs', '--', file) || today; }
  catch { return today; }
};
const sitemap = (): Plugin => ({
  name: 'reclaim-sitemap',
  apply: 'build',
  generateBundle() {
    const urls = Object.entries(PAGES).map(([path, file]) => `  <url><loc>https://reclaim.day${path}</loc><lastmod>${lastmod(file)}</lastmod></url>`);
    const source = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
    this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source });
  }
});

// The icons and fonts belong to the app (app/icons, app/fonts) and are shared with the site: /fonts/… in the pages
// and CSS resolves there (Vite hashes the font files into /assets/), and the icons and font licenses are published
// at the same paths as before (/icon.svg, /fonts/inter-OFL.txt, …), in dev as in the build.
const APP = fileURLToPath(new URL('../app/', import.meta.url));
const SHARED: Record<string, string> = Object.fromEntries([
  ...['favicon.ico', 'apple-touch-icon.png', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'].map(name => [name, 'icons/' + name]),
  ...['inter-OFL.txt', 'bricolage-grotesque-OFL.txt'].map(name => ['fonts/' + name, 'fonts/' + name])
]);
const TYPES: Record<string, string> = { ico: 'image/x-icon', png: 'image/png', svg: 'image/svg+xml', txt: 'text/plain; charset=utf-8' };
const shared = (): Plugin => ({
  name: 'reclaim-shared-app-files',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const from = SHARED[(req.url || '').split('?')[0].slice(1)];
      if (!from) return next();
      res.setHeader('Content-Type', TYPES[from.split('.').pop()!]);
      res.end(readFileSync(APP + from));
    });
  },
  // A page's preload of /fonts/x.woff2 becomes a path relative to the page, so Vite hashes it like the CSS's.
  transformIndexHtml: {
    order: 'pre',
    handler: (html, ctx) => html.replace(/href="\/fonts\/([^"]+\.woff2)"/g, (_, name) => `href="${relative(dirname(ctx.filename), APP + 'fonts/' + name)}"`)
  },
  generateBundle() {
    Object.entries(SHARED).forEach(([fileName, from]) => this.emitFile({ type: 'asset', fileName, source: readFileSync(APP + from) }));
  }
});

export default defineConfig({
  plugins: [cloudflare(), sitemap(), shared()],
  resolve: { alias: [{ find: /^\/fonts\/(.*\.woff2)$/, replacement: APP + 'fonts/$1' }] },
  server: { fs: { allow: ['..'] } },
  build: {
    rollupOptions: {
      input: { main: 'index.html', privacy: 'privacy/index.html', faq: 'faq/index.html', guides: 'guides/index.html', trackSmoking: 'guides/track-your-smoking/index.html', whatsnew: 'whats-new/index.html', terms: 'terms/index.html', imprint: 'imprint/index.html', notfound: '404.html' }
    }
  }
});
