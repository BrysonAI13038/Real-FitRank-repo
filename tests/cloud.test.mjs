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
  assert.equal(sessionMax, 185);
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
  const clean = run({ 'fitrank.data.v3': JSON.stringify({ version: 3, workouts: [workout('a', 5, 185), workout('b', 6, 635)], goals: [goal('g')] }) });
  assert.equal(clean.result.workouts, 2);
  assert.equal(clean.result.maxEarned, 635);
  assert.equal(clean.result.overLimit.length, 0);
  const dirty = run({ 'fitrank.data.v3': JSON.stringify({ version: 3, workouts: [workout('a', 5, 636)], goals: [] }) });
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

// ---- email code sign-in (pure logic) ----
const otp = load(src('cloud/otp'));

test('otp: emails are trimmed and lowercased, and obviously wrong ones are rejected', () => {
  assert.equal(otp.normalizeEmail('  Lifter@Example.COM '), 'lifter@example.com');
  assert.ok(otp.isValidEmail('lifter@example.com'));
  for (const bad of ['', 'lifter', 'lifter@', '@example.com', 'a b@example.com', 'lifter@example', `${'a'.repeat(250)}@example.com`]) assert.equal(otp.isValidEmail(bad), false, bad);
});

test('otp: codes keep digits only, accept pasted spacing, and need exactly 6 digits', () => {
  assert.equal(otp.cleanCode('123 456'), '123456');
  assert.equal(otp.cleanCode('12-34-56'), '123456');
  assert.equal(otp.cleanCode('abc123'), '123');
  assert.equal(otp.cleanCode('1234567890'), '123456');
  assert.ok(otp.isCompleteCode('123456'));
  for (const bad of ['', '12345', '1234567', '12345a']) assert.equal(otp.isCompleteCode(bad), false, bad);
});

test('otp: the code expires after 10 minutes and resend unlocks after 60 seconds', () => {
  const sent = 1_000_000;
  assert.equal(otp.secondsUntilResend(sent, sent), 60);
  assert.equal(otp.secondsUntilResend(sent, sent + 59_001), 1);
  assert.equal(otp.secondsUntilResend(sent, sent + 60_000), 0);
  assert.equal(otp.secondsUntilResend(sent, sent + 500_000), 0);
  assert.equal(otp.isExpired(sent, sent + 599_999), false);
  assert.equal(otp.isExpired(sent, sent + 600_000), true);
  // A clock that jumped backwards doesn't produce a negative countdown.
  assert.equal(otp.secondsUntilResend(sent, sent - 5_000), 60);
});

test('otp: wrong and expired codes get different messages, decided by our own timer', () => {
  const sent = 1_000_000;
  // Supabase answers both the same way.
  const rejected = { code: 'otp_expired', status: 403, message: 'Token has expired or is invalid' };
  assert.equal(otp.verifyErrorMessage(rejected, sent, sent + 30_000), otp.WRONG_CODE_MESSAGE);
  assert.equal(otp.verifyErrorMessage(rejected, sent, sent + 601_000), otp.EXPIRED_MESSAGE);
  assert.equal(otp.verifyErrorMessage({ status: 400, message: 'Invalid token' }, sent, sent + 1_000), otp.WRONG_CODE_MESSAGE);
});

test('otp: offline, rate limits and unknown failures have friendly messages', () => {
  const network = { name: 'AuthRetryableFetchError', message: 'Failed to fetch', status: 0 };
  assert.equal(otp.sendErrorMessage(network), otp.NETWORK_MESSAGE);
  assert.equal(otp.verifyErrorMessage(network, 0, 1), otp.NETWORK_MESSAGE);
  assert.equal(otp.sendErrorMessage({ status: 429, code: 'over_email_send_rate_limit' }), otp.RATE_LIMIT_MESSAGE);
  assert.equal(otp.sendErrorMessage({ code: 'over_request_rate_limit' }), otp.RATE_LIMIT_MESSAGE);
  assert.match(otp.verifyErrorMessage({ status: 429 }, 0, 1), /Too many attempts/);
  assert.match(otp.sendErrorMessage({ code: 'email_address_not_authorized', status: 400 }), /can’t receive codes yet/);
  assert.match(otp.sendErrorMessage({ code: 'validation_failed', status: 400 }), /valid email/);
  assert.match(otp.sendErrorMessage({ code: 'signup_disabled', status: 422 }), /isn’t available/);
  assert.match(otp.sendErrorMessage({ status: 500, message: 'boom' }), /Couldn’t send a code/);
  assert.match(otp.verifyErrorMessage({ status: 500, message: 'boom' }, 0, 1), /Couldn’t sign in/);
  assert.match(otp.sendErrorMessage(null), /Couldn’t send a code/);
});

test('otp: the pending sign-in survives a reload, holds no secrets, and is dropped when stale or bad', () => {
  const base = store();
  const t = 5_000_000;
  otp.savePending(base, { email: 'a@b.co', sentAt: t });
  assert.deepEqual(plain(otp.loadPending(base, t + 120_000)), { email: 'a@b.co', sentAt: t });
  assert.deepEqual(Object.keys(JSON.parse(base.getItem(otp.PENDING_KEY))).sort(), ['email', 'sentAt']);
  assert.equal(otp.loadPending(base, t + 601_000), null);
  assert.equal(otp.loadPending(base, t - 3_600_000), null);
  for (const raw of ['{not json', 'null', '{"email":5,"sentAt":1}', '{"email":"nope","sentAt":5000000}', '{"email":"a@b.co"}']) {
    const bad = store({ [otp.PENDING_KEY]: raw });
    assert.equal(otp.loadPending(bad, t), null, raw);
  }
  otp.clearPending(base);
  assert.equal(otp.loadPending(base, t), null);
  // Blocked storage never throws.
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.equal(otp.loadPending(blocked, t), null);
  otp.savePending(blocked, { email: 'a@b.co', sentAt: t });
  otp.clearPending(blocked);
});

// ---- which sign-in methods a build offers ----
const { signInMethods } = load(src('cloud/signInMethods'));

test('signInMethods: both off by default, each flag turns on only its own method', () => {
  assert.deepEqual(plain(signInMethods({})), { google: false, email: false });
  assert.deepEqual(plain(signInMethods({ VITE_GOOGLE_SIGNIN: 'on' })), { google: true, email: false });
  assert.deepEqual(plain(signInMethods({ VITE_EMAIL_SIGNIN: 'on' })), { google: false, email: true });
  assert.deepEqual(plain(signInMethods({ VITE_GOOGLE_SIGNIN: 'on', VITE_EMAIL_SIGNIN: 'on' })), { google: true, email: true });
});

test('signInMethods: only the exact value "on" counts, and Apple is never offered', () => {
  for (const value of ['true', '1', 'ON', 'On', ' on', 'on ', 'yes', '', true, 1, undefined, null]) {
    assert.deepEqual(plain(signInMethods({ VITE_GOOGLE_SIGNIN: value, VITE_EMAIL_SIGNIN: value })), { google: false, email: false }, String(value));
  }
  assert.deepEqual(Object.keys(signInMethods({ VITE_APPLE_SIGNIN: 'on' })).sort(), ['email', 'google']);
  assert.equal(signInMethods({ VITE_APPLE_SIGNIN: 'on' }).google, false);
});

// ---- keep-alive: a daily write that stops Supabase pausing the free project ----
const keepaliveSql = fs.readFileSync(new URL('../supabase/keepalive.sql', import.meta.url), 'utf8');
const keepaliveYml = fs.readFileSync(new URL('../.github/workflows/supabase-keepalive.yml', import.meta.url), 'utf8');

test('keepalive.sql: the table is locked down and ping() only writes one timestamp', () => {
  assert.match(keepaliveSql, /alter table public\.keepalive enable row level security/);
  assert.match(keepaliveSql, /revoke all on public\.keepalive from anon, authenticated/);
  assert.doesNotMatch(keepaliveSql, /create policy/i, 'no policy means no direct access for anyone');
  assert.match(keepaliveSql, /id integer primary key check \(id = 1\)/, 'a single row, so it can never grow');
  assert.match(keepaliveSql, /returns void/);
  assert.match(keepaliveSql, /security definer\s+set search_path = ''/);
  assert.match(keepaliveSql, /revoke execute on function public\.ping\(\) from public/);
  assert.match(keepaliveSql, /grant execute on function public\.ping\(\) to anon, authenticated/);
  // It must never touch user data.
  assert.doesNotMatch(keepaliveSql.replace(/--.*$/gm, ''), /workouts|goals|auth\./);
});

test('keepalive workflow: daily and on demand, least privilege, secrets only, fails loudly', () => {
  assert.match(keepaliveYml, /schedule:\s+- cron: "\d+ \d+ \* \* \*"/);
  assert.match(keepaliveYml, /workflow_dispatch:/);
  assert.match(keepaliveYml, /permissions: \{\}/);
  assert.match(keepaliveYml, /timeout-minutes: \d+/);
  assert.match(keepaliveYml, /secrets\.SUPABASE_URL/);
  assert.match(keepaliveYml, /secrets\.SUPABASE_ANON_KEY/);
  assert.match(keepaliveYml, /\/rest\/v1\/rpc\/ping/);
  assert.match(keepaliveYml, /exit 1/);
  // No key or project address is written into the repo.
  assert.doesNotMatch(keepaliveYml, /eyJ[A-Za-z0-9_-]{10}|sb_(publishable|secret)_|supabase\.co/);
});
