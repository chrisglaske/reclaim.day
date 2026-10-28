// Resolves the <?!= include('name'); ?> tags (kept from the Apps Script days): each tag becomes app/<name>.html,
// recursively, in place, so the load order written in Index.html is the load order in the page.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
export const appRoot = join(repoRoot, 'app');
const INCLUDE = /<\?!=\s*include\('([^']+)'\);\s*\?>/g;

export function inlineIncludes(source, root = appRoot, stack = []) {
  return source.replace(INCLUDE, (_, name) => {
    if (stack.includes(name)) throw new Error('Circular include: ' + [...stack, name].join(' -> '));
    return inlineIncludes(readFileSync(join(root, name + '.html'), 'utf8'), root, [...stack, name]);
  });
}

export function readIndex(root = appRoot) {
  return readFileSync(join(root, 'Index.html'), 'utf8');
}

export function assertResolved(html, what) {
  if (/<\?/.test(html)) throw new Error('Unresolved template tag in ' + what);
}
