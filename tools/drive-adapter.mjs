// Runs the real driveStorage() from app/scripts/storage-drive.html against an in-memory fake of the
// Drive v3 calls it makes (no network, no browser, no sign-in).
//   node tools/drive-adapter.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = name => readFileSync(join(root, 'app/scripts', name), 'utf8')
  .replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');

// --- fake Drive ---------------------------------------------------------------------------
// drive.inject holds one-off replies for the next requests: { status, reason }, 'offline' (no
// connection) or 'lost' (Drive does the work, but the reply never arrives).
function fakeDrive() {
  const files = new Map();
  let next = 1;
  const calls = [];
  const inject = [];
  const md5 = text => createHash('md5').update(text).digest('hex');
  const reply = (status, body) => ({
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  });
  const fail = (status, reason, message) => reply(status, { error: { message, errors: [{ reason }] } });
  const add = (meta, content = '') => {
    const id = 'f' + next++;
    files.set(id, { id, trashed: false, createdTime: next, parents: [], appProperties: {}, ...meta, content, md5Checksum: md5(content) });
    return files.get(id);
  };
  const update = (file, meta, content) => {
    if (meta.appProperties) file.appProperties = { ...file.appProperties, ...meta.appProperties };
    if (meta.name) file.name = meta.name;
    if (content !== undefined) { file.content = content; file.md5Checksum = md5(content); }
  };
  const parts = body => {
    const [meta, content] = body.split(/--reclaim_[a-z0-9]+/).filter(part => part.includes('Content-Type'))
      .map(part => part.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
    return [JSON.parse(meta), content];
  };
  const query = q => {
    const tag = /appProperties has \{ key='([^']+)' and value='([^']+)' \}/.exec(q);
    const name = /name (=|contains) '((?:[^'\\]|\\.)*)'/.exec(q);
    const mime = /mimeType = '([^']+)'/.exec(q);
    const parent = /'([^']+)' in parents/.exec(q);
    return [...files.values()].filter(f => !f.trashed &&
      (!tag || f.appProperties[tag[1]] === tag[2]) &&
      (!name || (name[1] === '=' ? f.name === name[2].replace(/\\(.)/g, '$1') : f.name.includes(name[2]))) &&
      (!mime || f.mimeType === mime[1]) &&
      (!parent || (parent[1] === 'root' ? f.parents.length === 0 : f.parents.includes(parent[1]))))
      .sort((a, b) => a.createdTime - b.createdTime);
  };
  const meta = f => ({ id: f.id, name: f.name, trashed: f.trashed, parents: f.parents, md5Checksum: f.md5Checksum, appProperties: f.appProperties });
  const handle = (u, method, options) => {
    if (options.headers.Authorization !== 'Bearer token') return fail(401, 'authError', 'Invalid Credentials');
    const upload = u.pathname.startsWith('/upload/drive/v3/files');
    const id = decodeURIComponent(u.pathname.split('/files/')[1] || '');
    if (upload && method === 'POST') {
      const [m, content] = parts(options.body);
      const file = add(m, content);
      return reply(200, { id: file.id, name: file.name });
    }
    const file = id ? files.get(id) : null;
    if (id && !file) return fail(404, 'notFound', 'File not found');
    if (upload && method === 'PATCH') {
      const [m, content] = parts(options.body);
      update(file, m, content);
      return reply(200, { id, md5Checksum: file.md5Checksum });
    }
    if (!id && method === 'GET') return reply(200, { files: query(u.searchParams.get('q')).slice(0, 1).map(f => ({ id: f.id, name: f.name })) });
    if (!id && method === 'POST') { const f = add(JSON.parse(options.body)); return reply(200, { id: f.id }); }
    if (method === 'PATCH') { update(file, JSON.parse(options.body)); return reply(200, { id }); }
    if (method === 'DELETE') { files.delete(id); return reply(204, ''); }
    if (u.searchParams.get('alt') === 'media') return reply(200, file.content);
    return reply(200, meta(file));
  };
  const fetch = async (url, options = {}) => {
    const u = new URL(url);
    const method = options.method || 'GET';
    calls.push(method + ' ' + u.pathname + (u.searchParams.get('alt') ? '?alt=' + u.searchParams.get('alt') : ''));
    const injected = inject.shift();
    if (injected === 'offline') throw new TypeError('Failed to fetch');
    if (injected === 'lost') { handle(u, method, options); throw new TypeError('Failed to fetch'); }
    if (injected) return fail(injected.status, injected.reason || '', 'Injected');
    return handle(u, method, options);
  };
  return { fetch, files, calls, inject };
}

// --- load the real code -------------------------------------------------------------------
function adapter(drive, options = {}) {
  const context = vm.createContext({ navigator: {}, window: {} });
  vm.runInContext(
    "const STATE_STALE_MESSAGE = 'Reclaim was updated on another device or tab. Reload to continue.';" +
    "function backupFileStamp() { return '2026-10-24 09-40-00'; }" +
    script('storage-drive.html') +
    ';globalThis.__make = driveStorage;', context);
  const auth = { token: options.token || 'token', unauthorized: 0 };
  const store = context.__make({
    getToken: async () => auth.token,
    onUnauthorized: options.onUnauthorized === false ? undefined : () => { auth.unauthorized++; auth.token = options.renewTo || auth.token; },
    fetch: drive.fetch,
    locks: null,
    sleep: async () => {}
  });
  store.auth = auth;
  return store;
}

const state = (version, extra = {}) => JSON.stringify({
  version, profile: {}, vices: {}, meds: [], slips: [], cravings: [], doses: {}, journal: {}, ...extra
});
let failed = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failed++;
  console.log((ok ? 'ok   ' : 'FAIL ') + label + (ok || !detail ? '' : ' — ' + detail));
};
const rejects = async (promise, pattern) => {
  try { await promise; return false; } catch (error) { return pattern.test(error.message) || error.message; }
};
const caught = async promise => { try { await promise; return null; } catch (error) { return error; } };
const named = (drive, name) => [...drive.files.values()].filter(f => f.name === name && !f.trashed);
const STALE = /updated on another device or tab/;
const marker = text => JSON.parse(text).marker;

// first run: nothing created by a load
let drive = fakeDrive();
let store = adapter(drive);
let loaded = await store.load();
check('first load is empty and creates nothing', loaded.state === null && drive.files.size === 0);

// save creates Reclaim/Live Data/Reclaim Live Data.json, tagged
await store.save(state(5, { marker: 'a' }));
const live = named(drive, 'Reclaim Live Data.json')[0];
const liveFolder = drive.files.get(live.parents[0]);
const rootFolder = drive.files.get(liveFolder.parents[0]);
check('layout is Reclaim/Live Data/Reclaim Live Data.json',
  liveFolder.name === 'Live Data' && rootFolder.name === 'Reclaim' && rootFolder.parents.length === 0);
check('folders and file carry the app tag',
  rootFolder.appProperties.reclaim === 'root' && liveFolder.appProperties.reclaim === 'live' && live.appProperties.reclaim === 'data');
check('saved content reads back', marker((await store.load()).state) === 'a');

// a second save and a fresh adapter (new tab) reuse the same file and folders
await store.save(state(5, { marker: 'b' }));
store = adapter(drive);
loaded = await store.load();
check('a new session finds the same file', marker(loaded.state) === 'b' && named(drive, 'Reclaim Live Data.json').length === 1);
check('no duplicate folders', named(drive, 'Reclaim').length === 1 && named(drive, 'Live Data').length === 1);
drive.calls.length = 0;
await store.save(state(5, { marker: 'b2' }));
check('a save checks metadata only, no download', !drive.calls.some(c => c.includes('alt=media')), drive.calls.join(', '));

// two devices on the same release
drive = fakeDrive();
const phone = adapter(drive);
await phone.load();
await phone.save(state(5, { marker: 'phone 1' }));
const laptop = adapter(drive);
await laptop.load();
await phone.save(state(5, { marker: 'phone 2' }));
check('the other device sees the change', await laptop.changed() === true);
check('the other device’s save is refused', (await rejects(laptop.save(state(5, { marker: 'laptop' })), STALE)) === true);
check('the refused save left the file alone', marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'phone 2');
check('the saving device sees no change', await phone.changed() === false);
check('after loading the latest it saves again', marker((await laptop.load()).state) === 'phone 2' &&
  (await laptop.save(state(5, { marker: 'laptop' })), marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'laptop'));
check('and now the phone is the stale one', (await rejects(phone.save(state(5)), STALE)) === true);

// a second device that loaded before the first ever save
drive = fakeDrive();
const early = adapter(drive);
await early.load();
store = adapter(drive);
await store.load();
await store.save(state(5, { marker: 'first' }));
check('a file made elsewhere since loading counts as a change', await early.changed() === true &&
  (await rejects(early.save(state(5)), STALE)) === true && named(drive, 'Reclaim Live Data.json').length === 1);

// a second tab doesn't recreate a file another tab erased
drive = fakeDrive();
const tabA = adapter(drive);
await tabA.load();
await tabA.save(state(5, { marker: 'a' }));
const tabB = adapter(drive);
await tabB.load();
await tabA.clear();
check('erased elsewhere: the save is refused', (await rejects(tabB.save(state(5, { marker: 'b' })), STALE)) === true &&
  named(drive, 'Reclaim Live Data.json').length === 0);
check('erased elsewhere: loading the latest is empty', (await tabB.load()).state === null);
await tabA.save(state(5, { marker: 'fresh' }));
check('the erasing tab saves a fresh file', named(drive, 'Reclaim Live Data.json').length === 1);

// a save whose reply got lost isn't mistaken for another device
drive = fakeDrive();
store = adapter(drive);
await store.load();
await store.save(state(5, { marker: 'one' }));
drive.inject.push(null, 'lost', 'lost', 'lost'); // the metadata check answers, the upload's replies get lost
const lost = await caught(store.save(state(5, { marker: 'two' })));
check('a lost reply is retryable', lost && lost.retryable === true && /offline/.test(lost.message), lost && lost.message);
check('the lost save did land', marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'two');
check('the next save goes through', await store.changed() === false &&
  (await store.save(state(5, { marker: 'three' })), marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'three'));

// payload checks
check('an empty payload is refused', (await rejects(store.save(''), /Invalid payload/)) === true);
check('a non-object payload is refused', (await rejects(store.save('[1]'), /Invalid payload/)) === true);

// moved and renamed
drive = fakeDrive();
store = adapter(drive);
await store.load();
await store.save(state(5, { marker: 'home' }));
const elsewhere = [...drive.files.values()].find(f => f.name === 'Reclaim');
drive.files.set('other', { id: 'other', name: 'Archive', mimeType: 'application/vnd.google-apps.folder', trashed: false, parents: [], appProperties: {}, createdTime: 0 });
elsewhere.parents = ['other'];
elsewhere.name = 'Old Reclaim';
named(drive, 'Reclaim Live Data.json')[0].name = 'my log.json';
loaded = await adapter(drive).load();
check('a moved, renamed folder and file are still found', marker(loaded.state) === 'home');
store = adapter(drive);
await store.load();
await store.save(state(5, { marker: 'moved' }));
check('saving uses the moved file, nothing new', drive.files.size === 4 && marker(named(drive, 'my log.json')[0].content) === 'moved');
const moved = await store.saveBackup(state(5), '2026-10-24 09-40-00');
check('a backup goes under the moved folder', drive.files.get(drive.files.get(moved.fileId).parents[0]).parents[0] === elsewhere.id);

// files from before the tags are found by name and tagged
drive = fakeDrive();
const folder = 'application/vnd.google-apps.folder';
drive.files.set('r', { id: 'r', name: 'Reclaim', mimeType: folder, trashed: false, parents: [], appProperties: {}, createdTime: 1 });
drive.files.set('l', { id: 'l', name: 'Live Data', mimeType: folder, trashed: false, parents: ['r'], appProperties: {}, createdTime: 2 });
drive.files.set('d', { id: 'd', name: 'Reclaim Live Data.json', mimeType: 'application/json', trashed: false, parents: ['l'], appProperties: {}, createdTime: 3, content: state(5, { marker: 'old' }), md5Checksum: 'x' });
loaded = await adapter(drive).load();
check('untagged files load by name', marker(loaded.state) === 'old');
check('and get tagged', drive.files.get('r').appProperties.reclaim === 'root' &&
  drive.files.get('l').appProperties.reclaim === 'live' && drive.files.get('d').appProperties.reclaim === 'data');

// backups
drive = fakeDrive();
store = adapter(drive);
await store.load();
const backup = await store.saveBackup(state(5), '2026-10-24 09-40-00');
check('backup lands in Reclaim/Backups with the dated name',
  backup.name === 'Reclaim Backup 2026-10-24 09-40-00.json' &&
  drive.files.get(drive.files.get(backup.fileId).parents[0]).name === 'Backups');
check('backup holds the exact payload', drive.files.get(backup.fileId).content === state(5));
check('a bad stamp falls back to the browser clock', (await store.saveBackup(state(5), 'x')).name === 'Reclaim Backup 2026-10-24 09-40-00.json');
check('a non-backup is refused', (await rejects(store.saveBackup('{"version":5}'), /Expected a Reclaim version/)) === true);
check('a version 2 backup is refused', (await rejects(store.saveBackup(state(2)), /Expected a Reclaim version/)) === true);

const upgrade = await store.saveUpgradeBackup(state(3), '2026-10-24 09-41-00');
const again = await store.saveUpgradeBackup(state(3), '2026-10-24 09-42-00');
check('the upgrade backup is written once', upgrade.name.startsWith('Before Reclaim v4 – ') && again.fileId === upgrade.fileId);
check('upgrade backup only takes version 3', (await rejects(store.saveUpgradeBackup(state(5)), /version 3 backup/)) === true);

// erase keeps backups
await store.save(state(5));
await store.clear();
check('clear deletes the live file', named(drive, 'Reclaim Live Data.json').length === 0);
check('clear keeps backups', !!drive.files.get(backup.fileId));
check('load after clear is empty', (await store.load()).state === null);
await store.save(state(5, { marker: 'd' }));
check('save after clear makes a fresh file', named(drive, 'Reclaim Live Data.json').length === 1);

// a folder deleted from Drive is recreated by a new session rather than trusted from the cache
drive = fakeDrive();
store = adapter(drive);
await store.load();
await store.save(state(5));
drive.files.forEach(f => { f.trashed = true; });
check('the open tab treats a trashed file as erased elsewhere', (await rejects(store.save(state(5)), STALE)) === true);
store = adapter(drive);
await store.load();
await store.save(state(5, { marker: 'e' }));
check('a new session recreates trashed folders and file', named(drive, 'Reclaim Live Data.json').length === 1 &&
  marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'e');

// sign-in ended (401)
drive = fakeDrive();
store = adapter(drive, { token: 'expired', renewTo: 'token' });
loaded = await store.load();
check('a 401 drops the token and tries once more', store.auth.unauthorized === 1 && loaded.state === null);
store = adapter(fakeDrive(), { token: 'expired' });
const ended = await caught(store.load());
check('a 401 that stays says the sign-in has ended', ended && /sign-in has ended/.test(ended.message) &&
  ended.status === 401 && store.auth.unauthorized === 1, ended && ended.message);

// busy, offline, full
drive = fakeDrive();
store = adapter(drive);
await store.load();
drive.inject.push({ status: 503 }, { status: 429 });
await store.save(state(5, { marker: 'busy' }));
check('503 and 429 are retried', marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'busy');
drive.inject.push({ status: 403, reason: 'userRateLimitExceeded' });
await store.save(state(5, { marker: 'rate' }));
check('a rate limit is retried', marker(named(drive, 'Reclaim Live Data.json')[0].content) === 'rate');
drive.inject.push({ status: 500 }, { status: 502 }, { status: 503 });
const busy = await caught(store.save(state(5)));
check('Drive still busy: retryable, in plain words', busy && busy.retryable === true &&
  /Google Drive isn’t responding/.test(busy.message) && !/50\d/.test(busy.message), busy && busy.message);
drive.inject.push('offline', 'offline', 'offline');
const offline = await caught(store.save(state(5)));
check('offline: retryable, says so', offline && offline.retryable === true && /offline/.test(offline.message), offline && offline.message);
drive.inject.push({ status: 403, reason: 'storageQuotaExceeded' });
const full = await caught(store.save(state(5)));
check('Drive full: not retried, its own words', full && full.retryable === false && full.reason === 'storageQuotaExceeded' &&
  /Drive is full/.test(full.message), full && full.message);
drive.inject.push({ status: 403, reason: 'storageQuotaExceeded' });
const fullBackup = await caught(store.saveBackup(state(5), '2026-10-24 09-40-00'));
check('a backup into a full Drive says so', fullBackup && /Drive is full/.test(fullBackup.message), fullBackup && fullBackup.message);
drive.inject.push({ status: 403, reason: 'forbidden' });
const other403 = await caught(store.save(state(5)));
check('other errors stay plain', other403 && other403.retryable === false && /couldn’t do that just now \(403\)/.test(other403.message), other403 && other403.message);

console.log(failed ? failed + ' check(s) failed' : 'All Drive adapter checks passed');
process.exit(failed ? 1 : 0);
