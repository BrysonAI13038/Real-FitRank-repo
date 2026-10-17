import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { scanDist } from '../scripts/check-dist-keys.mjs';

// Loads the real TypeScript modules (src/workout and src/cloud) without a test framework.
const modules = new Map();
function load(file) {
  const full = file.endsWith('.ts') ? file : `${file}.ts`;
  if (modules.has(full)) return modules.get(full);
  const context = { exports: {}, require: spec => load(path.resolve(path.dirname(full), spec)) };
  const source = fs.readFileSync(full, 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  modules.set(full, context.exports);
  return context.exports;
}
const src = name => new URL(`../src/${name}`, import.meta.url).pathname;
const { mergeData, sync, toWorkoutRow } = load(src('cloud/sync'));
const { scopedStorage, clearScoped } = load(src('cloud/scopedStorage'));
const { loadData, writeData } = load(src('workout/storage'));
const { SCORING } = load(src('workout/scoring'));
const { GOAL_RULES } = load(src('workout/goals'));
const { MAX_EXERCISES } = load(src('workout/model'));

const plain = value => JSON.parse(JSON.stringify(value));
const noLock = commit => Promise.resolve(commit());
function store(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, String(value)), removeItem: key => data.delete(key),
    get length() { return data.size; }, key: index => [...data.keys()][index] ?? null, dump: () => Object.fromEntries(data),
  };
}
const workout = (id, day, earned = 10) => ({ id, completedAt: `2026-03-${String(day).padStart(2, '0')}T12:00:00.000Z`, earned, exercises: [{ exerciseId: 'bench-press', sets: [{ weightLbs: 100, reps: 8 }] }] });
const goal = (id, extra = {}) => ({ id, exerciseId: 'bench-press', kind: 'weight', target: 200, baseline: 150, reward: 50, createdAt: '2026-03-01T00:00:00.000Z', ...extra });
const dataOf = ({ workouts = [], goals = [], quarantine = [] } = {}) => {
  const json = JSON.stringify({ version: 3, workouts, goals, quarantine });
  return loadData({ getItem: () => json });
};
const remoteGoal = (g, deletedAt = null) => ({ id: g.id, data: g, deleted_at: deletedAt, updated_at: '2026-03-02T00:00:00.000Z' });
const NOW = new Date('2026-03-10T00:00:00.000Z');

// A fake server shared by several "devices".
function fakeServer({ reject = () => false } = {}) {
  const workouts = new Map(); const goals = new Map();
  return {
    workouts, goals,
    remote: {
      pullWorkouts: async () => [...workouts.values()],
      pullGoals: async () => [...goals.values()],
      pushWorkouts: async rows => { const bad = []; for (const row of rows) { if (reject(row)) bad.push(row.id); else if (!workouts.has(row.id)) workouts.set(row.id, plain(row)); } return bad; },
      pushGoals: async rows => { for (const row of rows) goals.set(row.id, plain(row)); },
    },
  };
}

test('mergeData unions disjoint workouts, sorts them, and totals stored earned', () => {
  const local = dataOf({ workouts: [workout('a', 5, 12), workout('c', 9, 7)] });
  const remote = [toWorkoutRow(workout('b', 7, 20))];
  const merged = mergeData(local, remote, [], new Set(), NOW);
  assert.deepEqual(plain(merged.data.workouts.map(w => w.id)), ['a', 'b', 'c']);
  assert.equal(merged.data.elo, 39);
  assert.deepEqual(plain(merged.workoutsToPush.map(w => w.id)), ['a', 'c']);
  assert.equal(merged.pulledWorkouts, 1);
});

test('mergeData does not duplicate overlapping workouts, keeps the local copy, and pushes nothing', () => {
  const local = dataOf({ workouts: [workout('a', 5, 12)] });
  const remote = [toWorkoutRow({ ...workout('a', 5, 99) })];
  const merged = mergeData(local, remote, [], new Set(), NOW);
  assert.equal(merged.data.workouts.length, 1);
  assert.equal(merged.data.workouts[0].earned, 12);
  assert.equal(merged.data.elo, 12);
  assert.equal(merged.workoutsToPush.length, 0);
});

test('mergeData quarantines bad remote workouts once, however many times it syncs', () => {
  const bad = { id: 'x', completedAt: 'nope', earned: -5, exercises: [] };
  const mismatched = { ...workout('real', 5), id: 'other' };
  const remote = [{ id: 'x', completed_at: 'x', earned: 0, data: bad }, { id: 'real', completed_at: 'x', earned: 10, data: mismatched }];
  let data = dataOf();
  for (let i = 0; i < 3; i++) data = mergeData(data, remote, [], new Set(), NOW).data;
  assert.equal(data.workouts.length, 0);
  assert.equal(data.quarantine.length, 2);
});

test('mergeData goals: new local goals are pushed, new remote goals are added', () => {
  const mine = goal('mine'); const theirs = goal('theirs');
  const merged = mergeData(dataOf({ goals: [mine] }), [], [remoteGoal(theirs)], new Set(), NOW);
  assert.deepEqual(plain(merged.data.goals.map(g => g.id).sort()), ['mine', 'theirs']);
  assert.deepEqual(plain(merged.goalRowsToPush.map(r => r.id)), ['mine']);
  assert.deepEqual(plain(merged.knownGoalIds.sort()), ['mine', 'theirs']);
});

test('mergeData goals: a goal deleted elsewhere is dropped, but an achieved goal beats a deletion', () => {
  const active = goal('active'); const done = goal('done', { achievedAt: '2026-03-05T00:00:00.000Z', achievedWorkoutId: 'a' });
  const merged = mergeData(dataOf({ goals: [active, done] }), [], [remoteGoal(active, '2026-03-06T00:00:00.000Z'), remoteGoal(done, '2026-03-06T00:00:00.000Z')], new Set(['active', 'done']), NOW);
  assert.deepEqual(plain(merged.data.goals.map(g => g.id)), ['done']);
  assert.deepEqual(plain(merged.goalRowsToPush.map(r => [r.id, r.deleted_at])), [['done', null]]);
});

test('mergeData goals: achieved on another device wins over an active local copy', () => {
  const achieved = goal('g', { achievedAt: '2026-03-05T00:00:00.000Z', achievedWorkoutId: 'a' });
  const merged = mergeData(dataOf({ goals: [goal('g')] }), [], [remoteGoal(achieved)], new Set(['g']), NOW);
  assert.equal(merged.data.goals[0].achievedAt, achieved.achievedAt);
  assert.equal(merged.goalRowsToPush.length, 0);
});

test('mergeData goals: a goal deleted on this device is soft-deleted on the server only if it was known', () => {
  const g = goal('g');
  const deletedHere = mergeData(dataOf(), [], [remoteGoal(g)], new Set(['g']), NOW);
  assert.equal(deletedHere.data.goals.length, 0);
  assert.equal(deletedHere.goalRowsToPush[0].deleted_at, NOW.toISOString());
  const createdElsewhere = mergeData(dataOf(), [], [remoteGoal(g)], new Set(), NOW);
  assert.equal(createdElsewhere.data.goals.length, 1);
  assert.equal(createdElsewhere.goalRowsToPush.length, 0);
});

test('sync converges two devices, writes local first, and never recalculates earned', async () => {
  const server = fakeServer();
  const phone = store(); const laptop = store();
  writeData(dataOf({ workouts: [workout('a', 5, 12)], goals: [goal('g1')] }), phone);
  writeData(dataOf({ workouts: [workout('b', 6, 8)] }), laptop);
  assert.deepEqual(plain(await sync(server.remote, phone, noLock, NOW)), { pulled: 0, pushed: 1, rejected: [] });
  assert.deepEqual(plain(await sync(server.remote, laptop, noLock, NOW)), { pulled: 1, pushed: 1, rejected: [] });
  await sync(server.remote, phone, noLock, NOW);
  for (const device of [phone, laptop]) {
    const data = loadData(device);
    assert.deepEqual(plain(data.workouts.map(w => w.id)), ['a', 'b']);
    assert.equal(data.elo, 20);
    assert.deepEqual(plain(data.goals.map(g => g.id)), ['g1']);
  }
  assert.equal(server.workouts.size, 2);
});

test('sync reports workouts the server refuses and still saves everything locally', async () => {
  const server = fakeServer({ reject: row => row.id === 'bad' });
  const device = store();
  writeData(dataOf({ workouts: [workout('ok', 5), workout('bad', 6)] }), device);
  const result = await sync(server.remote, device, noLock, NOW);
  assert.deepEqual(plain(result), { pulled: 0, pushed: 1, rejected: ['bad'] });
  assert.equal(loadData(device).workouts.length, 2);
});

test('sync carries a goal delete from one device to the other', async () => {
  const server = fakeServer();
  const a = store(); const b = store();
  writeData(dataOf({ goals: [goal('g')] }), a);
  await sync(server.remote, a, noLock, NOW);
  await sync(server.remote, b, noLock, NOW);
  assert.equal(loadData(b).goals.length, 1);
  writeData({ ...loadData(a), goals: [] }, a);
  await sync(server.remote, a, noLock, NOW);
  assert.ok(server.goals.get('g').deleted_at);
  await sync(server.remote, b, noLock, NOW);
  assert.equal(loadData(b).goals.length, 0);
});

test('sync leaves local data untouched when the pull fails', async () => {
  const device = store();
  writeData(dataOf({ workouts: [workout('a', 5)] }), device);
  const before = device.getItem('fitrank.data.v3');
  const remote = { ...fakeServer().remote, pullWorkouts: async () => { throw new Error('offline'); } };
  await assert.rejects(() => sync(remote, device, noLock, NOW), /offline/);
  assert.equal(device.getItem('fitrank.data.v3'), before);
});

test('scopedStorage keeps accounts separate and clearing one never touches the other or unscoped keys', () => {
  const base = store({ 'fitrank.data.v3': 'device-data' });
  const alice = scopedStorage('alice', base); const bob = scopedStorage('bob', base);
  alice.setItem('fitrank.data.v3', 'A'); bob.setItem('fitrank.data.v3', 'B');
  assert.equal(alice.getItem('fitrank.data.v3'), 'A');
  assert.equal(bob.getItem('fitrank.data.v3'), 'B');
  clearScoped('alice', base);
  assert.equal(alice.getItem('fitrank.data.v3'), null);
  assert.equal(bob.getItem('fitrank.data.v3'), 'B');
  assert.equal(base.getItem('fitrank.data.v3'), 'device-data');
});

test('the schema earned cap matches the maximum the code can award', () => {
  const sessionMax = SCORING.session + SCORING.weekly + SCORING.streakPerWeek * SCORING.streakMaxWeeks + SCORING.effort * SCORING.effortCap + SCORING.milestone * SCORING.milestoneCap * MAX_EXERCISES;
  const goalsMax = GOAL_RULES.maxActive * (GOAL_RULES.baseReward + GOAL_RULES.bonusReward);
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  const cap = Number(schema.match(/earned between 0 and (\d+)/)[1]);
  assert.equal(sessionMax, 170);
  assert.equal(goalsMax, 450);
  assert.ok(sessionMax + goalsMax <= cap, 'schema cap is below what scoring can award');
  assert.equal(cap, sessionMax + goalsMax, 'schema cap is looser than needed; update it deliberately');
});

test('schema policies: workouts are select+insert only, goals update has USING and WITH CHECK', () => {
  const schema = fs.readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
  assert.equal([...schema.matchAll(/create policy workouts_\w+ on public\.workouts for (\w+)/g)].map(m => m[1]).sort().join(), 'insert,select');
  assert.match(schema, /create policy goals_update[\s\S]*?using \(user_id = \(select auth\.uid\(\)\)\)\s+with check \(user_id = \(select auth\.uid\(\)\)\)/);
  assert.match(schema, /set search_path = ''/);
  assert.match(schema, /revoke execute on function public\.delete_account\(\) from public, anon/);
  assert.match(schema, /grant execute on function public\.delete_account\(\) to authenticated/);
});

test('check-local-data.js passes clean data and flags anything over the schema limits', () => {
  const code = fs.readFileSync(new URL('../scripts/check-local-data.js', import.meta.url), 'utf8');
  const run = items => {
    const logs = [];
    const localStorage = store(items);
    const result = vm.runInNewContext(code, { localStorage, TextEncoder, JSON, console: { log: line => logs.push(line) } });
    return { result: plain(result), logs };
  };
  const clean = run({ 'fitrank.data.v3': JSON.stringify({ version: 3, workouts: [workout('a', 5, 170), workout('b', 6, 620)], goals: [goal('g')] }) });
  assert.equal(clean.result.workouts, 2);
  assert.equal(clean.result.maxEarned, 620);
  assert.equal(clean.result.overLimit.length, 0);
  const dirty = run({ 'fitrank.data.v3': JSON.stringify({ version: 3, workouts: [workout('a', 5, 621)], goals: [] }) });
  assert.equal(dirty.result.overLimit.length, 1);
});

test('check-dist-keys accepts an anon key and fails on a service_role JWT or an sb_secret_ key', () => {
  const jwt = role => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ iss: 'supabase', role })).toString('base64url')}.sig`;
  const scan = content => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fitrank-dist-'));
    fs.mkdirSync(path.join(dir, 'assets'));
    fs.writeFileSync(path.join(dir, 'assets', 'index.js'), content);
    return scanDist(dir).problems;
  };
  assert.deepEqual(scan(`const k="${jwt('anon')}";`), []);
  assert.deepEqual(scan('const k="sb_publishable_abcdefghijklmnop1234";'), []);
  // The Supabase library contains the bare prefixes; that is not a leaked key.
  assert.deepEqual(scan('const a=k=>k.startsWith("sb_publishable_")||k.startsWith("sb_secret_");const k="sb_publishable_abcdefghijklmnop1234";'), []);
  assert.equal(scan(`const k="${jwt('anon')}",s="${jwt('service_role')}";`).length, 1);
  assert.equal(scan('const s="sb_secret_abcdefghijklmnop1234";').length >= 1, true);
  assert.equal(scan('console.log("no keys")').length, 1);
});

// ---- device import: once per device, first account only ----
const { deviceImportState, setImportStatus, importDeviceData, DEVICE_IMPORT_KEY } = load(src('cloud/deviceImport'));
const v1Raw = JSON.stringify({ version: 1, workouts: [workout('old1', 2, 15), workout('old2', 3, 20)] });
// Everything on the device except our own import record and account-scoped keys.
const originals = base => Object.fromEntries(Object.entries(base.dump()).filter(([key]) => key !== DEVICE_IMPORT_KEY && !key.startsWith('u.')));

test('device import: the first account is offered the device data, with counts', () => {
  const base = store({ 'fitrank.workouts.v1': v1Raw });
  assert.deepEqual(plain(deviceImportState('alice', base)), { status: 'offered', workouts: 2, goals: 0 });
});

test('device import: a second account is never offered it, even after the first is gone', () => {
  const base = store({ 'fitrank.workouts.v1': v1Raw });
  deviceImportState('alice', base);
  assert.equal(deviceImportState('bob', base), null);
  // alice declines, alice's scoped data is cleared (account deleted): bob still gets nothing.
  setImportStatus('alice', 'declined', base);
  clearScoped('alice', base);
  assert.equal(deviceImportState('bob', base), null);
  assert.throws(() => importDeviceData('bob', base, scopedStorage('bob', base)), /isn’t available/);
});

test('device import: a device with no old data records nothing and offers nothing to anyone', () => {
  const base = store();
  assert.equal(deviceImportState('alice', base), null);
  assert.equal(base.getItem(DEVICE_IMPORT_KEY), null);
});

test('device import: Yes copies workouts into the account, keeps the originals byte-identical, then stops offering', () => {
  const base = store({ 'fitrank.workouts.v1': v1Raw, 'unrelated': 'x' });
  const before = originals(base);
  deviceImportState('alice', base);
  const scoped = scopedStorage('alice', base);
  assert.equal(importDeviceData('alice', base, scoped, NOW), 2);
  const data = loadData(scoped);
  assert.deepEqual(plain(data.workouts.map(w => w.id)), ['old1', 'old2']);
  assert.equal(data.elo, 35);
  assert.deepEqual(originals(base), before);
  assert.equal(deviceImportState('alice', base).status, 'imported');
  assert.throws(() => importDeviceData('alice', base, scoped, NOW), /isn’t available/);
});

test('device import: No, then "Import data from this device" later, still works', () => {
  const base = store({ 'fitrank.workouts.v1': v1Raw });
  deviceImportState('alice', base);
  setImportStatus('alice', 'declined', base);
  assert.equal(deviceImportState('alice', base).status, 'declined');
  const scoped = scopedStorage('alice', base);
  assert.equal(importDeviceData('alice', base, scoped, NOW), 2);
  assert.equal(deviceImportState('alice', base).status, 'imported');
});

test('device import: workouts already logged under the account are kept and not duplicated', () => {
  const base = store({ 'fitrank.workouts.v1': v1Raw });
  deviceImportState('alice', base);
  const scoped = scopedStorage('alice', base);
  writeData(dataOf({ workouts: [workout('new1', 8, 9), workout('old1', 2, 15)] }), scoped);
  assert.equal(importDeviceData('alice', base, scoped, NOW), 1);
  const data = loadData(scoped);
  assert.deepEqual(plain(data.workouts.map(w => w.id)), ['old1', 'old2', 'new1']);
  assert.equal(data.elo, 44);
});

test('device import: unreadable device data is never offered and never touched', () => {
  const base = store({ 'fitrank.data.v3': '{not json' });
  assert.equal(deviceImportState('alice', base), null);
  assert.equal(base.getItem('fitrank.data.v3'), '{not json');
});
