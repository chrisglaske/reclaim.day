// Date, limit, streak, savings and dose logic, run on the real app scripts with a settable clock.
//   node tools/logic-tests.mjs           in this computer's time zone
//   node tools/logic-tests.mjs --zones   once in each of several time zones
// Every expected value is written out here. Days and times are local, so each zone must give the same answers.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import vm from 'node:vm';

const here = fileURLToPath(import.meta.url);
if (process.argv.includes('--zones')) {
  let failed = 0;
  for (const TZ of ['America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Auckland', 'UTC']) {
    const run = spawnSync(process.execPath, [here], { env: { ...process.env, TZ }, encoding: 'utf8' });
    const totals = run.stdout.split('\n').filter(line => /^. (tests|pass|fail|todo) \d+/.test(line)).map(line => line.slice(2)).join(', ');
    console.log(TZ.padEnd(22), run.status === 0 ? 'ok' : 'FAILED', totals);
    if (run.status !== 0) { failed++; console.log(run.stdout.split('\n').filter(line => /✖|expected|actual/.test(line)).slice(0, 30).join('\n')); }
  }
  process.exit(failed ? 1 : 0);
}

const scripts = join(dirname(here), '../app/scripts');
const source = name => readFileSync(join(scripts, name + '.html'), 'utf8').replace(/^\s*<script>/, '').replace(/<\/script>\s*$/, '');
const context = vm.createContext({ window: {}, document: {}, requestAnimationFrame: fn => fn(), localStorage: { getItem: () => null, setItem() {} } });
vm.runInContext(`{ const Real = Date; let current = Real.now();
  globalThis.Date = class extends Real { constructor(...args) { super(...(args.length ? args : [current])); } static now() { return current; } };
  globalThis.__clock = at => { current = new Real(at).getTime(); }; }`, context);
vm.runInContext(['core', 'state', 'habits', 'meds', 'today', 'settings-meds'].map(source).join('\n') + `
;globalThis.__app = { S, applyState, todayUI, localToday, dateKey, dayOffset, dayDistance, dailyUse, limitStatus, streakHistory, nextMilestone, habitWeek,
  totals, dailyEstimatedSavings, makeMoment, trackingDoseSchedule, trackingDoseLate, medDayStatus, medAdherence, missedDoses, addDoseEvent, skipDoseEvent,
  todayActions, saveMedication, firstWeekChecklist, startFirstWeek, returnDay, noteForTomorrow, supplyLeft, runningLow };`, context);
const app = context.__app;
const same = (got, want) => assert.deepEqual(JSON.parse(JSON.stringify(got)), want);
const setNow = at => { context.__clock(at); app.todayUI.now = new context.Date(); };

const medication = (over = {}) => ({ id: 'daily', catalogId: '', name: 'Sample', dose: 10, unit: 'mg', freq: 2, slots: ['Morning', 'Evening'],
  startDate: '2026-01-01T09:00:00', active: true, timeline: null, alcohol: null, whyThisHelps: '', dailyLimit: null, ...over });
const slip = (at, over = {}) => ({ id: 'slip-' + at, vice: 'smoking', at, amount: 1, cost: '', triggers: [], why: '', action: 'log', kind: 'slip', createdAt: at, productType: '', ...over });
const start = (over = {}) => app.applyState(JSON.parse(JSON.stringify({ version: 5, onboarded: true, setupVersion: 3, createdAt: '2026-01-01T09:00:00',
  profile: { name: 'Sam', companion: { trackMedications: true, reminders: {} } }, vices: {}, meds: [], slips: [], cravings: [], doses: {}, journal: {}, ...over })));
const smoking = (phase, over = {}) => ({ smoking: { enabled: true, perDay: 10, costPerDay: 5, phases: [phase], ...over } });
const day = (first, second) => assert.equal(app.dateKey(first), second);

test('a date is a real calendar date', () => {
  day('2028-02-29', '2028-02-29'); day('2027-02-29', ''); day('2026-02-30', ''); day('2026-13-01', ''); day('nonsense', ''); day(null, '');
});
test('moving by days crosses months, years and leap days', () => {
  assert.equal(app.dayOffset('2026-01-31', 1), '2026-02-01');
  assert.equal(app.dayOffset('2026-03-01', -1), '2026-02-28');
  assert.equal(app.dayOffset('2028-03-01', -1), '2028-02-29');
  assert.equal(app.dayOffset('2026-12-31', 1), '2027-01-01');
  assert.equal(app.dayOffset('2027-01-01', -366), '2025-12-31');
});
test('the distance between days stays whole across clock changes', () => {
  assert.equal(app.dayDistance('2026-03-07', '2026-03-09'), 2);
  assert.equal(app.dayDistance('2026-10-31', '2026-11-02'), 2);
  assert.equal(app.dayDistance('2027-03-13', '2027-03-15'), 2);
  assert.equal(app.dayDistance('2027-12-31', '2028-01-01'), 1);
  assert.equal(app.dayDistance('2028-01-01', '2029-01-01'), 366);
  assert.equal(app.dayDistance('2026-11-02', '2026-11-01'), 0);
});

// [local now, today, yesterday, tomorrow, ten days ago]
const AWKWARD = [
  ['2026-11-04T00:05:00', '2026-11-04', '2026-11-03', '2026-11-05', '2026-10-25'],
  ['2026-11-04T23:55:00', '2026-11-04', '2026-11-03', '2026-11-05', '2026-10-25'],
  ['2026-12-01T09:40:00', '2026-12-01', '2026-11-30', '2026-12-02', '2026-11-21'],
  ['2026-12-31T23:55:00', '2026-12-31', '2026-12-30', '2027-01-01', '2026-12-21'],
  ['2027-01-01T00:05:00', '2027-01-01', '2026-12-31', '2027-01-02', '2026-12-22'],
  ['2028-02-29T09:40:00', '2028-02-29', '2028-02-28', '2028-03-01', '2028-02-19'],
  ['2026-11-01T09:40:00', '2026-11-01', '2026-10-31', '2026-11-02', '2026-10-22'],
  ['2027-03-14T09:40:00', '2027-03-14', '2027-03-13', '2027-03-15', '2027-03-04'],
];
for (const [now, today, yesterday, tomorrow, tenAgo] of AWKWARD) {
  test('at ' + now, async t => {
    setNow(now);
    const phase = { mode: 'quit', at: tenAgo + 'T09:00:00', target: 0 };
    start({ vices: smoking(phase), meds: [medication({ startDate: yesterday + 'T09:00:00' })] });
    await t.test('today and its neighbors', () => {
      assert.equal(app.localToday(), today);
      assert.equal(app.dayOffset(today, -1), yesterday);
      assert.equal(app.dayOffset(today, 1), tomorrow);
      assert.equal(app.dayDistance(yesterday, tomorrow), 2);
    });
    await t.test('streak and next milestone', () => {
      const history = app.streakHistory('smoking', new context.Date());
      assert.equal(history.days, 10);
      assert.equal(history.streakDays, 10);
      const next = app.nextMilestone('smoking', new context.Date());
      assert.equal(next.days, 14);
      assert.equal(next.daysRemaining, 4);
    });
    await t.test('the week is seven days in a row, ending today', () => {
      const week = app.habitWeek('smoking', new context.Date());
      assert.equal(week.length, 7);
      assert.equal(new Set(week.map(entry => entry.day)).size, 7);
      assert.equal(week[6].day, today);
      assert.equal(week[5].day, yesterday);
      assert.equal(week[6].today, true);
    });
    await t.test('a moment noted now lands today', () => {
      const moment = app.makeMoment('smoking', { amount: 2 });
      assert.ok(moment);
      assert.equal(app.dateKey(moment.at), today);
      app.S.slips.push(moment);
      assert.equal(app.dailyUse('smoking', today), 2);
      assert.equal(app.dailyUse('smoking', yesterday), 0);
    });
    await t.test('a dose noted now lands today, and yesterday is left to catch up', () => {
      app.addDoseEvent('daily', 0);
      const status = app.medDayStatus('daily', today);
      assert.equal(status.noted, 1);
      assert.equal(status.remaining, 1);
      same(app.missedDoses(3).map(miss => [miss.day, miss.slot]), [[yesterday, 0], [yesterday, 1]]);
    });
    await t.test('days tracked count from the plan through today', () => {
      assert.equal(app.totals(new context.Date()).daysTracked, 11);
    });
  });
}

test('a daily limit counts the day and says what is left', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'reduce', at: '2026-10-01T09:00:00', target: 5 }),
    slips: [slip('2026-10-20T09:00:00', { amount: 3 }), slip('2026-10-19T09:00:00', { amount: 6 })] });
  const fields = ({ used, target, rest, within }) => ({ used, target, rest, within });
  same(fields(app.limitStatus('smoking', '2026-10-20')), { used: 3, target: 5, rest: 2, within: true });
  same(fields(app.limitStatus('smoking', '2026-10-19')), { used: 6, target: 5, rest: 0, within: false });
  same(fields(app.limitStatus('smoking', '2026-10-18')), { used: 0, target: 5, rest: 5, within: true });
});
test('use at the very end of a day belongs to that day', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'reduce', at: '2026-10-01T09:00:00', target: 5 }),
    slips: [slip('2026-10-19T23:59:00'), slip('2026-10-20T00:00:00')] });
  assert.equal(app.dailyUse('smoking', '2026-10-19'), 1);
  assert.equal(app.dailyUse('smoking', '2026-10-20'), 1);
});

test('a logged moment restarts nothing, streak restarts the streak, full restarts both', () => {
  setNow('2026-10-20T15:00:00');
  const phase = { mode: 'quit', at: '2026-10-01T09:00:00', target: 0 };
  start({ vices: smoking(phase), slips: [slip('2026-10-10T09:00:00')] });
  let history = app.streakHistory('smoking', new context.Date());
  same([history.days, history.streakDays], [19, 19]);
  start({ vices: smoking(phase), slips: [slip('2026-10-10T09:00:00', { action: 'streak' })] });
  history = app.streakHistory('smoking', new context.Date());
  same([history.days, history.streakDays], [19, 10]);
  start({ vices: smoking(phase), slips: [slip('2026-10-10T09:00:00', { action: 'streak' }), slip('2026-10-15T09:00:00', { action: 'full' })] });
  history = app.streakHistory('smoking', new context.Date());
  same([history.days, history.streakDays], [5, 5]);
});
test('milestones run out after a year', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'quit', at: '2025-10-01T09:00:00', target: 0 }) });
  assert.equal(app.nextMilestone('smoking', new context.Date()), null);
});
test('no plan means no streak', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'quit', at: '2026-10-25T09:00:00', target: 0 }) });
  same(app.streakHistory('smoking', new context.Date()).days, 0);
  assert.equal(app.nextMilestone('smoking', new context.Date()), null);
});

test('savings price each unit at the usual cost, and a heavy day adds nothing, never less', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'reduce', at: '2026-10-18T09:00:00', target: 5 }),
    slips: [slip('2026-10-18T10:00:00', { amount: 4 }), slip('2026-10-19T10:00:00', { amount: 14 })] });
  assert.equal(app.dailyEstimatedSavings('2026-10-18'), 3);
  assert.equal(app.dailyEstimatedSavings('2026-10-19'), 0);
  assert.equal(app.dailyEstimatedSavings('2026-10-20'), 5);
  const total = app.totals(new context.Date());
  same([total.daysTracked, total.smoking.baselineUnits, total.smoking.loggedUnits, total.unitsAvoided, total.estimatedSavings], [3, 30, 18, 12, 6]);
});
test('a plan begun in the afternoon counts its first day, and one later today does not yet', () => {
  setNow('2026-10-20T16:00:00');
  start({ vices: smoking({ mode: 'quit', at: '2026-10-20T15:00:00', target: 0 }) });
  assert.equal(app.dailyEstimatedSavings('2026-10-20'), 5);
  same([app.totals(new context.Date()).daysTracked, app.totals(new context.Date()).estimatedSavings], [1, 5]);
  start({ vices: smoking({ mode: 'quit', at: '2026-10-19T21:00:00', target: 0 }) });
  same([app.dailyEstimatedSavings('2026-10-19'), app.totals(new context.Date()).daysTracked], [5, 2]);
  start({ vices: smoking({ mode: 'quit', at: '2026-10-20T18:00:00', target: 0 }) });
  same([app.dailyEstimatedSavings('2026-10-20'), app.totals(new context.Date()).daysTracked], [0, 0]);
});
test('no usual amount or cost means no savings, and never NaN', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'quit', at: '2026-10-18T09:00:00', target: 0 }, { perDay: 0, costPerDay: 0 }) });
  assert.equal(app.dailyEstimatedSavings('2026-10-20'), 0);
  assert.equal(app.totals(new context.Date()).estimatedSavings, 0);
});
test('with nothing tracked, totals are zero', () => {
  setNow('2026-10-20T15:00:00');
  start();
  const total = app.totals(new context.Date());
  same([total.daysTracked, total.unitsAvoided, total.estimatedSavings], [0, 0, 0]);
});

test('a moment cannot be in the future, before the plan, or an impossible amount', () => {
  setNow('2026-10-20T15:00:00');
  start({ vices: smoking({ mode: 'quit', at: '2026-10-01T09:00:00', target: 0 }) });
  assert.equal(app.makeMoment('smoking', { at: new context.Date('2026-10-20T15:30:00') }), null);
  assert.equal(app.makeMoment('smoking', { at: new context.Date('2026-09-30T15:00:00') }), null);
  assert.equal(app.makeMoment('smoking', { amount: 0 }), null);
  assert.equal(app.makeMoment('smoking', { amount: 1001 }), null);
  assert.ok(app.makeMoment('smoking', { amount: 1000 }));
  assert.equal(app.makeMoment('nothing'), null);
});

const reminders = { 'daily:0': { time: '08:30', label: 'Morning' }, 'daily:1': { time: '20:30', label: 'Evening' } };
test('doses are next, then due once their time passes', () => {
  setNow('2026-10-20T08:29:00');
  start({ meds: [medication()], profile: { name: 'Sam', companion: { trackMedications: true, reminders } } });
  const prefix = () => app.trackingDoseSchedule('daily').map(dose => dose.timingLabel.split(' · ')[0]);
  same(prefix(), ['Next', 'Later']);
  setNow('2026-10-20T08:30:00');
  same(prefix(), ['Due', 'Later']);
  app.addDoseEvent('daily', 0);
  setNow('2026-10-20T09:00:00');
  assert.equal(app.trackingDoseSchedule('daily')[1].next, true);
  assert.equal(app.trackingDoseSchedule('daily')[0].noted, true);
});
test('a dose is late 30 minutes after its time, not before', () => {
  setNow('2026-10-20T15:00:00');
  start();
  const dose = { noted: false, reminderTime: '08:30' };
  assert.equal(app.trackingDoseLate(dose, new context.Date('2026-10-20T08:59:00')), false);
  assert.equal(app.trackingDoseLate(dose, new context.Date('2026-10-20T09:00:00')), true);
  assert.equal(app.trackingDoseLate({ ...dose, noted: true }, new context.Date('2026-10-20T09:00:00')), false);
  assert.equal(app.trackingDoseLate({ noted: false, reminderTime: '' }, new context.Date('2026-10-20T09:00:00')), false);
});
test('nothing is scheduled before a medication starts, or for an as-needed one', () => {
  setNow('2026-10-20T15:00:00');
  start({ meds: [medication({ startDate: '2026-10-20T09:00:00' }), medication({ id: 'prn', freq: 'prn', slots: [] })] });
  assert.equal(app.medDayStatus('daily', '2026-10-19').expected, 0);
  assert.equal(app.medDayStatus('daily', '2026-10-20').expected, 2);
  same(app.trackingDoseSchedule('prn'), []);
  same(app.missedDoses(7), []);
});
test('catch-up leaves out noted and skipped doses, and keeps days in order', () => {
  setNow('2026-10-20T15:00:00');
  start({ meds: [medication()], doses: {
    '2026-10-19': { daily: [{ slot: 0, at: '2026-10-19T08:30:00' }, { slot: 1, at: '2026-10-19T20:30:00', skipped: true }] },
    '2026-10-18': { daily: [{ slot: 1, at: '2026-10-18T20:30:00' }] } } });
  same(app.missedDoses(3).map(miss => [miss.day, miss.slot]), [['2026-10-17', 0], ['2026-10-17', 1], ['2026-10-18', 0]]);
});
test('a day with every dose noted or skipped is settled, and only noted doses complete it', () => {
  setNow('2026-10-20T15:00:00');
  start({ meds: [medication()], doses: { '2026-10-19': { daily: [{ slot: 0, at: '2026-10-19T08:30:00' }, { slot: 1, at: '2026-10-19T20:30:00', skipped: true }] } } });
  const status = app.medDayStatus('daily', '2026-10-19');
  same([status.noted, status.skipped, status.remaining, status.settled, status.complete], [1, 1, 0, true, false]);
});
test('turning medication tracking off stops catch-up', () => {
  setNow('2026-10-20T15:00:00');
  start({ meds: [medication()], profile: { name: 'Sam', companion: { trackMedications: false, reminders: {} } } });
  same(app.missedDoses(3), []);
});
test('doses from before a medication was added are optional that day: not due, late or missed, but can be noted', () => {
  setNow('2026-10-20T20:05:00');
  start({ meds: [medication({ startDate: '2026-10-20T12:00:00', addedAt: new context.Date('2026-10-20T20:00:00').toISOString() })],
    profile: { name: 'Sam', companion: { trackMedications: true, reminders } } });
  const status = app.medDayStatus('daily', '2026-10-20');
  same([status.expected, status.remaining, status.doses.map(dose => dose.optional)], [1, 1, [true, false]]);
  const schedule = app.trackingDoseSchedule('daily');
  same(schedule.map(dose => dose.timingLabel.split(' · ')[0]), ['Before you added it', 'Next']);
  assert.equal(app.trackingDoseLate(schedule[0]), false);
  same(app.todayActions().visibleTasks.filter(task => task.kind === 'dose').map(task => task.slot), []);
  setNow('2026-10-21T09:00:00');
  same(app.missedDoses(1).map(miss => [miss.day, miss.slot]), [['2026-10-20', 1]]);
  same(app.medDayStatus('daily', '2026-10-21').expected, 2);
  setNow('2026-10-20T20:05:00');
  app.addDoseEvent('daily', 0, new context.Date('2026-10-20T08:40:00'));
  const noted = app.medDayStatus('daily', '2026-10-20');
  same([noted.expected, noted.noted, noted.doses[0].optional], [2, 1, false]);
});
test('a medication added today remembers when; one started earlier, or moved to another day, does not', () => {
  setNow('2026-10-20T20:00:00');
  start({ meds: [] });
  const draft = { name: 'Sample', dose: '10', unit: 'mg', freq: 2, slots: ['Morning', 'Evening'], times: ['08:30', '20:30'], start: '2026-10-20' };
  assert.equal(app.saveMedication(draft), '');
  const added = app.S.meds[0];
  assert.equal(added.addedAt, new context.Date('2026-10-20T20:00:00').toISOString());
  assert.equal(app.applyState(JSON.parse(JSON.stringify(app.S))) && app.S.meds[0].addedAt, added.addedAt);
  setNow('2026-10-20T20:10:00');
  app.saveMedication({ ...draft, id: app.S.meds[0].id, why: 'Kept' });
  assert.equal(app.S.meds[0].addedAt, added.addedAt);
  app.saveMedication({ ...draft, id: app.S.meds[0].id, start: '2026-10-15' });
  assert.equal(app.S.meds[0].addedAt, undefined);
  start({ meds: [] });
  app.saveMedication({ ...draft, start: '2026-10-18' });
  assert.equal(app.S.meds[0].addedAt, undefined);
});
test('a tap that lands after a check-in has closed does nothing', () => {
  const page = vm.createContext({ V: {}, ACT: {}, app: { addEventListener() {} }, document: { addEventListener() {} },
    JOURNAL_TAGS: [], SLEEP_WORDS: [], CHECKIN_PROMPTS: [], $: () => null, $$: () => [] });
  vm.runInContext(source('checkin'), page);
  vm.runInContext('V.flow = null', page);
  const button = { parentNode: {}, dataset: { v: 'Other' }, classList: { toggle() {} }, setAttribute() {} };
  for (const verb of ['fmood', 'fsl', 'fslset', 'fq', 'ftag', 'fhealth', 'fcrskip', 'fnext', 'fsave', 'fback', 'fgo']) {
    assert.doesNotThrow(() => page.ACT[verb](button, {}, '1'), verb);
  }
  assert.doesNotThrow(() => vm.runInContext('fNext(); fSave();', page));
});
test('adherence counts full days and the current run', () => {
  setNow('2026-10-20T15:00:00');
  const full = day => ({ daily: [{ slot: 0, at: day + 'T08:30:00' }, { slot: 1, at: day + 'T20:30:00' }] });
  start({ meds: [medication({ startDate: '2026-10-16T09:00:00' })], doses: {
    '2026-10-16': full('2026-10-16'), '2026-10-18': full('2026-10-18'), '2026-10-19': full('2026-10-19') } });
  const adherence = app.medAdherence('daily', '2026-10-19');
  same([adherence.daysFullyNoted, adherence.daysExpected, adherence.currentRun], [3, 4, 2]);
});

// First-week checklist: only for people who finished setup for the first time, for 7 days, ticking from real data.
test('first-week checklist: never for people who started before it existed', () => {
  setNow('2026-03-10T09:00:00'); start();
  assert.equal(app.firstWeekChecklist(), null);
  app.startFirstWeek();   // already onboarded: no checklist is created
  assert.equal(app.firstWeekChecklist(), null);
});
test('first-week checklist: starts at first setup, ticks from check-ins, moments and doses', () => {
  setNow('2026-03-10T09:00:00'); start({ onboarded: false });
  app.startFirstWeek();
  same(app.S.firstWeek, { since: '2026-03-10', dismissed: false });
  same(app.firstWeekChecklist(), { checkin: false, moment: false });
  app.S.journal['2026-03-10'] = { checkins: { morning: { mood: 3 } } };
  same(app.firstWeekChecklist(), { checkin: true, moment: false });
  app.S.slips.push(slip('2026-03-10T09:30:00', { vice: 'smoking' }));
  assert.equal(app.firstWeekChecklist(), null);   // both done: gone
});
test('first-week checklist: a skipped dose is not a first dose; a taken one is', () => {
  setNow('2026-03-10T09:00:00'); start({ onboarded: false, meds: [medication()] });
  app.startFirstWeek();
  app.S.journal['2026-03-10'] = { checkins: { morning: { mood: 3 } } };
  app.S.doses['2026-03-10'] = { daily: [{ slot: 0, at: '2026-03-10T09:00:00.000Z', skipped: true }] };
  same(app.firstWeekChecklist(), { checkin: true, moment: false });
  app.S.doses['2026-03-10'].daily.push({ slot: 1, at: '2026-03-10T10:00:00.000Z' });
  assert.equal(app.firstWeekChecklist(), null);
});
test('first-week checklist: gone after 7 days, or once closed, and a later setup does not bring it back', () => {
  setNow('2026-03-10T09:00:00'); start({ onboarded: false });
  app.startFirstWeek();
  setNow('2026-03-16T23:00:00'); assert.ok(app.firstWeekChecklist());      // day 7 of 7 (six days later)
  setNow('2026-03-17T00:30:00'); assert.equal(app.firstWeekChecklist(), null);
  setNow('2026-03-11T09:00:00'); assert.ok(app.firstWeekChecklist());
  app.S.firstWeek.dismissed = true; assert.equal(app.firstWeekChecklist(), null);
  app.S.onboarded = true; app.startFirstWeek(); assert.equal(app.S.firstWeek.dismissed, true);
});

// Gentle return note: today is a return day when the last day with anything logged before it was 3 or more days ago.
test('return day: not for a new person, or after one or two quiet days', () => {
  setNow('2026-03-10T09:00:00'); start();
  assert.equal(app.returnDay(), null);                                    // nothing ever logged
  app.S.slips.push(slip('2026-03-08T09:00:00'));
  assert.equal(app.returnDay(), null);                                    // two days ago
  app.S.slips.push(slip('2026-03-07T09:00:00'));
  assert.equal(app.returnDay(), null);                                    // the most recent is still 2 days ago
});
test('return day: 3 or more quiet days, quiet until something is logged today', () => {
  setNow('2026-03-10T09:00:00'); start({ slips: [slip('2026-03-07T09:00:00')] });
  same(app.returnDay(), { prior: '2026-03-07', quiet: true });
  app.S.cravings.push({ id: 'c', vice: 'smoking', at: '2026-03-10T09:30:00', resisted: true });
  same(app.returnDay(), { prior: '2026-03-07', quiet: false });           // still the return day, but the note has done its job
  setNow('2026-03-11T09:00:00');
  assert.equal(app.returnDay(), null);                                    // yesterday had activity
});
test('return day: a skipped dose, or doses never taken, are not activity; a mood or a taken dose is', () => {
  setNow('2026-03-10T09:00:00');
  start({ meds: [medication()], doses: { '2026-03-09': { daily: [{ slot: 0, at: '2026-03-09T09:00:00.000Z', skipped: true }] }, '2026-03-02': { daily: [{ slot: 0, at: '2026-03-02T09:00:00.000Z' }] } } });
  same(app.returnDay(), { prior: '2026-03-02', quiet: true });
  app.S.journal['2026-03-06'] = { mood: 3 };
  same(app.returnDay(), { prior: '2026-03-06', quiet: true });
});

// Note for tomorrow: last evening's optional line, until closed.
test('note for tomorrow: shows the next day from last evening, once, and only that evening', () => {
  setNow('2026-03-10T21:00:00'); start({ journal: { '2026-03-10': { checkins: { evening: { mood: 3, noteForTomorrow: ' Go easy ' } } } } });
  assert.equal(app.noteForTomorrow(), null);                              // same evening: not yet
  setNow('2026-03-11T08:00:00'); same(app.noteForTomorrow(), { day: '2026-03-10', text: 'Go easy' });
  app.S.journal['2026-03-10'].checkins.evening.noteForTomorrowSeen = true;
  assert.equal(app.noteForTomorrow(), null);                              // closed
  setNow('2026-03-12T08:00:00'); app.S.journal['2026-03-10'].checkins.evening.noteForTomorrowSeen = false;
  assert.equal(app.noteForTomorrow(), null);                              // two days on: it was for the morning after
});
test('note for tomorrow: ignores other check-ins and empty notes', () => {
  setNow('2026-03-11T08:00:00');
  start({ journal: { '2026-03-10': { checkins: { afternoon: { mood: 3, noteForTomorrow: 'x' }, evening: { mood: 3, noteForTomorrow: '   ' } } } } });
  assert.equal(app.noteForTomorrow(), null);
});

// Running-low note: pills left as of a moment, less one dose's pills for each dose noted since.
const supplied = (left, over = {}) => medication({ id: 'rx', freq: 2, supply: { left, perDose: 1, asOf: '2026-03-10T08:00:00.000Z' }, ...over });
test('pill supply counts down by pills per dose as doses are noted taken', () => {
  setNow('2026-03-12T09:00:00'); start({ meds: [supplied(20, { supply: { left: 20, perDose: 2, asOf: '2026-03-10T08:00:00.000Z' } })],
    doses: { '2026-03-10': { rx: [{ slot: 0, at: '2026-03-10T09:00:00.000Z' }, { slot: 1, at: '2026-03-10T20:00:00.000Z' }] },
      '2026-03-11': { rx: [{ slot: 0, at: '2026-03-11T09:00:00.000Z', skipped: true }] } } });
  assert.equal(app.supplyLeft(app.S.meds[0]), 16);                       // two taken at 2 pills each; the skipped one is not counted
});
test('pill supply ignores doses noted from before the count, and never goes below zero', () => {
  setNow('2026-03-12T09:00:00'); start({ meds: [supplied(1)], doses: { '2026-03-09': { rx: [{ slot: 0, at: '2026-03-09T09:00:00.000Z' }] },
    '2026-03-11': { rx: [{ slot: 0, at: '2026-03-11T09:00:00.000Z' }, { slot: 1, at: '2026-03-11T20:00:00.000Z' }] } } });
  assert.equal(app.supplyLeft(app.S.meds[0]), 0);
});
test('running low: about a week at the scheduled rate, only for scheduled active medications', () => {
  setNow('2026-03-12T09:00:00');
  start({ meds: [supplied(14)] });  same(app.runningLow(app.S.meds[0]), { left: 14, daysLeft: 7 });   // 2 a day: 7 days
  start({ meds: [supplied(15)] });  assert.equal(app.runningLow(app.S.meds[0]), null);                // 7.5 days: not yet
  start({ meds: [supplied(3)] });   same(app.runningLow(app.S.meds[0]), { left: 3, daysLeft: 1 });
  start({ meds: [supplied(1)] });   same(app.runningLow(app.S.meds[0]), { left: 1, daysLeft: 0 });
  start({ meds: [supplied(0)] });   same(app.runningLow(app.S.meds[0]), { left: 0, daysLeft: 0 });
  start({ meds: [supplied(3, { active: false })] });  assert.equal(app.runningLow(app.S.meds[0]), null);
  start({ meds: [supplied(3, { freq: 'prn', slots: [] })] }); assert.equal(app.runningLow(app.S.meds[0]), null);
  start({ meds: [medication({ id: 'rx' })] }); assert.equal(app.runningLow(app.S.meds[0]), null);     // no count: off
});
test('saving a medication keeps the count from the number given, and clearing it turns the note off', () => {
  setNow('2026-03-12T09:00:00'); start({ meds: [] });
  const draft = { id: '', name: 'Sample', dose: '10', unit: 'mg', freq: 2, slots: ['Morning', 'Evening'], times: ['09:00', '21:00'], limit: '', start: '2026-03-12', why: '', backfill: false, left: '12', perDose: '' };
  assert.equal(app.saveMedication(draft), '');
  const saved = app.S.meds[0];
  same({ left: saved.supply.left, perDose: saved.supply.perDose }, { left: 12, perDose: 1 });
  assert.equal(app.saveMedication({ ...draft, id: saved.id, left: '' }), '');
  assert.equal(app.S.meds.find(m => m.id === saved.id).supply, undefined);
  assert.match(app.saveMedication({ ...draft, id: saved.id, left: 'lots' }), /pills left/);
});
