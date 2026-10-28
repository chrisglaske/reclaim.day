// Data round-trip test. Runs the real migrate/normalizeState from
// app/scripts/state.html on each fixture, exports it the way Settings → Backup does,
// restores the export, and checks that:
//   1. export → restore gives back exactly the migrated state (stable);
//   2. every value in a version 3, 4 or 5 input survives migration (nothing dropped;
//      an old theme id becoming its new id is allowed);
//   3. migrating twice changes nothing;
//   4. each fixture with a saved .expected.json still matches it (this covers
//      the legacy version 2 upgrade and a not-yet-onboarded profile);
//   5. the version 5 habit plans (weekly caps, chosen days, just track) give the expected limits.
//   node tools/roundtrip.mjs [extra-backup.json ...]
//   node tools/roundtrip.mjs --write-expected   (only after a deliberate schema change)
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(join(root, 'app/scripts/state.html'), 'utf8')
  .replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const context = vm.createContext({});
vm.runInContext(source + '\n;globalThis.__state = { migrate, normalizeState, legacyThemes: STATE_LEGACY_THEMES };', context);
const { migrate, legacyThemes } = context.__state;
// The themes were renamed once; an old id moving to its new id is the one allowed change.
const themeRename = line => Object.entries(legacyThemes).some(([from, to]) =>
  line === `~ /profile/companion/theme: ${JSON.stringify(from)} → ${JSON.stringify(to)}`);
const plain = value => JSON.parse(JSON.stringify(value));
const exportJson = state => JSON.stringify(migrate(plain(state)), null, 2);

function leaves(value, path = '', out = []) {
  if (value !== null && typeof value === 'object') {
    const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
    if (!entries.length) out.push([path, JSON.stringify(value)]);
    entries.forEach(([key, item]) => leaves(item, path + '/' + key, out));
  } else {
    out.push([path, JSON.stringify(value)]);
  }
  return out;
}

function diff(before, after) {
  const left = new Map(leaves(before));
  const right = new Map(leaves(after));
  const lines = [];
  left.forEach((value, path) => {
    if (!right.has(path)) lines.push('- ' + path + ' = ' + value);
    else if (right.get(path) !== value) lines.push('~ ' + path + ': ' + value + ' → ' + right.get(path));
  });
  right.forEach((value, path) => { if (!left.has(path)) lines.push('+ ' + path + ' = ' + value); });
  return lines;
}

const fixtures = [
  ...readdirSync(join(root, 'tools/fixtures'))
    .filter(name => name.endsWith('.json') && !name.endsWith('.expected.json'))
    .sort().map(name => join(root, 'tools/fixtures', name)),
  ...process.argv.slice(2).filter(arg => !arg.startsWith('--'))
].filter(file => existsSync(file));

let failed = 0;
const check = (label, lines) => {
  if (lines.length) {
    failed++;
    console.log('FAIL ' + label);
    lines.slice(0, 40).forEach(line => console.log('    ' + line));
    if (lines.length > 40) console.log('    … ' + (lines.length - 40) + ' more');
  } else {
    console.log('ok   ' + label);
  }
};

for (const file of fixtures) {
  const name = relative(root, file);
  const input = JSON.parse(readFileSync(file, 'utf8'));
  const migrated = plain(migrate(plain(input)));
  const restored = plain(migrate(JSON.parse(exportJson(migrated))));
  check(name + ': export → restore is stable', diff(migrated, restored));
  check(name + ': migrating twice changes nothing', diff(migrated, plain(migrate(plain(migrated)))));
  if ([3, 4, 5].includes(Number(input.version))) {
    check(name + ': no version ' + input.version + ' values dropped or changed',
      diff(input, migrated).filter(line => !line.startsWith('+ ') && !themeRename(line) && !/^~ \/version: [34] → 5$/.test(line)));
  }
  const expectedFile = file.replace(/\.json$/, '.expected.json');
  if (process.argv.includes('--write-expected') && file.includes('/tools/fixtures/')) {
    writeFileSync(expectedFile, JSON.stringify(migrated, null, 2) + '\n');
  }
  if (existsSync(expectedFile)) {
    check(name + ': matches ' + relative(root, expectedFile),
      diff(JSON.parse(readFileSync(expectedFile, 'utf8')), migrated));
  }
}

// Cadence helpers (version 5): run the real core/state/habits scripts with the few browser globals they touch at load.
const strip = name => readFileSync(join(root, 'app/scripts', name), 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const helperContext = vm.createContext({ window: {}, document: {}, requestAnimationFrame: fn => fn(), localStorage: { getItem: () => null, setItem() {} } });
vm.runInContext(['core.html', 'state.html', 'habits.html'].map(strip).join('\n') +
  '\n;globalThis.__h = { S, applyState, limitStatus, reduceStats, habitWeek, cadencePhrase, dayOffset };', helperContext);
const helpers = helperContext.__h;
const load = name => helpers.applyState(JSON.parse(readFileSync(join(root, 'tools/fixtures', name), 'utf8')));
const same = (label, got, want) => check(label, JSON.stringify(got) === JSON.stringify(want)
  ? [] : ['got  ' + JSON.stringify(got), 'want ' + JSON.stringify(want)]);
const pick = (status, keys) => Object.fromEntries(keys.map(key => [key, status[key]]));

// Auto was removed (2026-10-25): a saved "auto" loads as the day look it used, and the rest stays.
{
  const base = plain(migrate(JSON.parse(readFileSync(join(root, 'tools/fixtures/mockup-twin.json'), 'utf8'))));
  const look = (theme, autoLight) => { const s = plain(base); s.profile.companion.theme = theme; s.profile.companion.autoLight = autoLight; return plain(migrate(s)).profile.companion; };
  const a = look('auto', 'ocean'), b = look('auto', 'nonsense');
  same('auto with Ocean by day loads as Ocean', [a.theme, a.autoLight], ['ocean', 'ocean']);
  same('auto with an unknown day look loads as Pine', b.theme, 'pine');
}

// Plans with no new fields: limitStatus agrees with reduceStats on every day in a long range.
for (const name of ['vaping-v4.json', 'minimal-v3.json', 'mockup-twin.json']) {
  load(name);
  const mismatches = [];
  for (const vice of ['smoking', 'vaping', 'drinking']) {
    for (let offset = 0; offset < 300; offset++) {
      const day = helpers.dayOffset('2026-10-23', -offset);
      const old = helpers.reduceStats(vice, day);
      const now = helpers.limitStatus(vice, day);
      if (old.mode === 'reduce' && (now.per !== 'day' || now.target !== old.target || now.used !== old.used ||
          now.within !== old.withinGoal || now.rest !== old.remaining || !now.allowedToday)) {
        mismatches.push(vice + ' ' + day + ' ' + JSON.stringify(now) + ' vs ' + JSON.stringify(pick(old, ['target', 'used', 'withinGoal', 'remaining'])));
      }
      if (old.mode !== now.mode) mismatches.push(vice + ' ' + day + ' mode ' + now.mode + ' vs ' + old.mode);
    }
  }
  check(name + ': limitStatus matches reduceStats for daily plans', mismatches);
}

load('cadence-v5.json');
const fields = ['mode', 'per', 'target', 'used', 'within', 'allowedToday', 'rest'];
const status = (vice, day) => pick(helpers.limitStatus(vice, day), fields);
same('weekly cap: days before the plan began are not counted',
  status('drinking', '2026-10-17'), { mode: 'reduce', per: 'week', target: 3, used: 3, within: true, allowedToday: true, rest: 0 });
same('weekly cap: rolling 7 days ending on the day, over the cap',
  status('drinking', '2026-10-20'), { mode: 'reduce', per: 'week', target: 3, used: 4, within: false, allowedToday: true, rest: 0 });
same('weekly cap: first day of the plan starts at zero',
  status('drinking', '2026-10-12'), { mode: 'reduce', per: 'week', target: 3, used: 0, within: true, allowedToday: true, rest: 3 });
same('weekly cap: old use rolls out of the window',
  status('drinking', '2026-10-23'), { mode: 'reduce', per: 'week', target: 3, used: 2, within: true, allowedToday: true, rest: 1 });
same('chosen days: use within the limit on an allowed day',
  status('smoking', '2026-10-17'), { mode: 'reduce', per: 'day', target: 4, used: 3, within: true, allowedToday: true, rest: 1 });
same('chosen days: use on a rest day is over (limit 0)',
  status('smoking', '2026-10-19'), { mode: 'reduce', per: 'day', target: 0, used: 1, within: false, allowedToday: false, rest: 0 });
same('track: no limit, never over',
  status('vaping', '2026-10-19'), { mode: 'track', per: 'day', target: 0, used: 5, within: true, allowedToday: true, rest: null });
// Readers follow the helper: reduceStats and the week strip use the weekly total and rest days.
const stats = (vice, day) => pick(helpers.reduceStats(vice, day), ['mode', 'target', 'used', 'remaining', 'overBy', 'withinGoal']);
same('reduceStats: weekly cap reads the rolling total',
  stats('drinking', '2026-10-20'), { mode: 'reduce', target: 3, used: 4, remaining: 0, overBy: 1, withinGoal: false });
same('reduceStats: rest day with a slip is over by the slip',
  stats('smoking', '2026-10-19'), { mode: 'reduce', target: 0, used: 1, remaining: 0, overBy: 1, withinGoal: false });
same('reduceStats: track is never within a goal and has no limit',
  stats('vaping', '2026-10-19'), { mode: 'track', target: 0, used: 5, remaining: 0, overBy: 5, withinGoal: false });
same('habitWeek: weekly cap marks days by the rolling total',
  helpers.habitWeek('drinking', '2026-10-23').map(d => d.ok), helpers.habitWeek('drinking', '2026-10-23').map((d, i, a) => helpers.limitStatus('drinking', d.day).within));
same('habitWeek: track days are never marked over',
  helpers.habitWeek('vaping', '2026-10-23').filter(d => d.day >= '2026-10-19').every(d => d.ok), true);
same('cadencePhrase', [
  { mode: 'reduce', target: 3 }, { mode: 'reduce', per: 'week' }, { mode: 'reduce', days: [0, 6] }, { mode: 'reduce', days: [1, 2, 3, 4, 5] },
  { mode: 'reduce', days: [1, 3, 5] }, { mode: 'reduce', days: [2] }, { mode: 'quit' }, { mode: 'track' }, null
].map(helpers.cadencePhrase), ['a day', 'a week', 'on weekends', 'on weekdays', 'on Mon, Wed and Fri', 'on Tue', 'a day', 'a day', 'a day']);
same('usual amount per week keeps perDay as the daily average',
  helpers.S.vices.drinking.perDay, 0.5);

console.log(failed ? failed + ' check(s) failed' : 'All round-trip checks passed');
process.exitCode = failed ? 1 : 0;
