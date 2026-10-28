import { defineConfig } from 'vite';
import { cloudflare } from '@cloudflare/vite-plugin';

// tools/build-app.mjs writes the finished page and icons to ../dist/app; Vite copies them as they are.
export default defineConfig({
  publicDir: '../dist/app',
  plugins: [cloudflare()]
});
