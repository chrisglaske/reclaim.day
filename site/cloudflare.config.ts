import { defineConfig } from 'cf/config';

export default defineConfig({
  worker: {
    name: 'reclaim-day',
    compatibilityDate: '2026-10-01',
    domains: [
      'reclaim.day'
    ],
    assets: {
      htmlHandling: 'auto-trailing-slash',
      notFoundHandling: '404-page'
    }
  }
});
