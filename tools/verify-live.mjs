// Checks that app.reclaim.day serves exactly what this code builds: the page, and every script, stylesheet,
// font, icon and manifest it loads, byte for byte. Anyone can run it; it only reads public URLs.
//   node tools/build-app.mjs && node tools/verify-live.mjs [origin]
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './lib/inline-app.mjs';

const origin = process.argv[2] || 'https://app.reclaim.day';
const dist = join(repoRoot, 'dist/app');
const sha = body => createHash('sha256').update(body).digest('hex');
const local = path => readFileSync(join(dist, path === '/' ? 'index.html' : path));

// Every same-origin file the page and its stylesheet load.
const page = local('/').toString();
const paths = new Set(['/']);
for (const [, path] of page.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) paths.add(path);
for (const css of [...paths].filter(path => path.endsWith('.css'))) {
  for (const [, path] of local(css).toString().matchAll(/url\((\/[^)]+)\)/g)) paths.add(path);
}

let failed = 0;
for (const path of [...paths].sort()) {
  let verdict;
  try {
    const response = await fetch(origin + path, { cache: 'no-store' });
    if (!response.ok) verdict = 'missing (' + response.status + ')';
    else verdict = sha(Buffer.from(await response.arrayBuffer())) === sha(local(path)) ? 'same' : 'DIFFERENT';
  } catch (error) {
    verdict = 'unreachable (' + error.message + ')';
  }
  if (verdict !== 'same') failed += 1;
  console.log(verdict.padEnd(12), path);
}
console.log(failed
  ? `\n${failed} of ${paths.size} files differ from ${origin}.`
  : `\nAll ${paths.size} files ${origin} serves match this build.`);
process.exit(failed ? 1 : 0);
