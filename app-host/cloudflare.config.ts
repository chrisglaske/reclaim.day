import { defineConfig } from 'cf/config';

// The app at app.reclaim.day: an assets-only Worker serving the static build from tools/build-app.mjs.
export default defineConfig({
  worker: {
    name: 'reclaim-app',
    compatibilityDate: '2026-10-01',
    domains: [
      'app.reclaim.day'
    ],
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page'
    }
  }
});
