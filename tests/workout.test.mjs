import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the real TypeScript modules without introducing a test framework.
const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const context = { exports: {}, require: path => load(path.replace('./', '')) };
  const source = fs.readFileSync(new URL(`../src/workout/${name}.ts`, import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, context);
  modules.set(name, context.exports);
  return context.exports;
}
const { scoreWorkout, rankProgress, rankMultiplier, weekStatus, RANKS, missedSessionBonus, SESSION_ONCE_A_DAY } = load('scoring');
const { saveWorkout, loadData, addGoal, deleteGoal } = load('storage');
const { validateGoal, goalReward, currentBest, isGoalMet, GoalError } = load('goals');
const { processWorkout, processSession } = load('model');
const { exercises, searchExercises, MUSCLE_GROUPS } = load('exercises');
const { loadDraft, saveDraft, clearDraft } = load('draft');
const { exerciseSeries, personalRecords, weeklyCounts, eloSeries, muscleSets } = load('stats');
const exercise = (weight = 100, reps = 8, exerciseId = 'bench-press') => ({ exerciseId, sets: [{ weightLbs: weight, reps }] });
function store() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
// Objects from the vm context have a different prototype, so compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));

// Local-time dates (no Z) keep the Mon-Sun week logic independent of the machine's timezone.
// 2026-02-02 is a Monday.
const at = (day, hour = 12) => new Date(2026, 1, day, hour);
const hist = (...items) => items.map(([ex, date]) => ({ exercises: [ex], completedAt: date.toISOString() }));
const lines = result => plain(result.breakdown);
const score = (current, history = [], elo = 0, now = at(2)) => scoreWorkout(current, history, elo, now);

test('session ELO: first session of a day only; flat, down and extra-set sessions lose nothing', () => {
  assert.equal(score([exercise()]).earned, 10);
  assert.deepEqual(lines(score([exercise()])), [{ label: 'Session', amount: 10 }]);
  assert.equal(score([exercise(), exercise(50, 8, 'row')]).earned, 10);
  assert.equal(score([exercise(90)], hist([exercise(100), at(1)])).earned, 10);
  assert.equal(score([{ ...exercise(), sets: [...exercise().sets, ...exercise().sets] }], hist([exercise(), at(1)])).earned, 10);
  const sameDay = score([exercise()], hist([exercise(), at(2, 7)]));
  assert.equal(sameDay.earned, 0); assert.deepEqual(lines(sameDay), []);
  assert.equal(score([exercise()], hist([exercise(), at(2, 23)]), 0, at(3, 0)).earned, 10);
});
test('20 lb milestones: per boundary above the all-time best, capped, baseline-first', () => {
  const before = (weight, id = 'bench-press') => hist([exercise(weight, 8, id), at(1)]);
  assert.equal(score([exercise(225)], before(195)).earned, 20);
  assert.match(score([exercise(225)], before(195)).breakdown[1].label, /Bench Press: 2 × 20 lb milestones/);
  assert.equal(score([exercise(195)], before(190)).earned, 10);
  assert.equal(score([exercise(200)], before(199)).earned, 15);
  assert.equal(score([exercise(300)], before(100)).earned, 25);
  assert.equal(score([exercise(300)], []).earned, 10);
  assert.equal(score([exercise(100, 8, 'squat')], before(0)).earned, 10);
  assert.equal(score([exercise(60, 8, 'row')], hist([exercise(0, 10, 'row'), at(1)])).earned, 10);
  assert.equal(score([exercise(120), exercise(80, 8, 'row')], hist([exercise(100), at(1)], [exercise(60, 8, 'row'), at(1)])).earned, 20);
  assert.equal(score([exercise(120)], hist([exercise(100), at(1)], [exercise(150), at(1)])).earned, 10);
  const manySets = { exerciseId: 'bench-press', sets: [{ weightLbs: 120, reps: 5 }, { weightLbs: 80, reps: 12 }, { weightLbs: 80, reps: 12 }] };
  assert.equal(score([manySets], before(100)).earned, 21);
});
test('weekly target: reached on the 3rd distinct day of a Mon-Sun week, once', () => {
  const day = d => [exercise(), at(d)];
  assert.equal(score([exercise()], hist(day(2), day(3)), 0, at(4)).earned, 25);
  assert.match(score([exercise()], hist(day(2), day(3)), 0, at(4)).breakdown[1].label, /Weekly target/);
  assert.equal(score([exercise()], hist(day(2)), 0, at(3)).earned, 10);
  assert.equal(score([exercise()], hist(day(2), day(3), day(4)), 0, at(5)).earned, 10);
  assert.equal(score([exercise()], hist(day(2), day(2), day(3)), 0, at(3)).earned, 0);
  assert.equal(score([exercise()], hist(day(2), day(2)), 0, at(3)).earned, 10);
  // Sunday belongs to the week that started the Monday before; the next Monday starts a fresh week.
  assert.equal(score([exercise()], hist(day(7), day(8)), 0, at(9)).earned, 10);
  assert.equal(score([exercise()], hist(day(2), day(7)), 0, at(8)).earned, 25);
  assert.equal(score([exercise()], hist(day(7), [exercise(), at(8, 23)]), 0, at(9, 0)).earned, 10);
});
test('streak: +5 per consecutive earlier week that hit the target, max 5, resets on a miss', () => {
  const week = (k, days = 3) => [0, 1, 2].slice(0, days).map(offset => [exercise(), new Date(2026, 1, 2 - 7 * k + offset, 12)]);
  const thisWeek = [[exercise(), at(2)], [exercise(), at(3)]];
  const run = history => score([exercise()], hist(...history, ...thisWeek), 0, at(4));
  assert.equal(run([]).earned, 25);
  assert.equal(run(week(1)).earned, 30);
  assert.match(run(week(1)).breakdown[2].label, /Streak: 1 week in a row/);
  assert.equal(run([...week(1), ...week(2)]).earned, 35);
  assert.equal(run([...week(1), ...week(3)]).earned, 30);
  assert.equal(run([...week(1, 2), ...week(2), ...week(3)]).earned, 30 - 5);
  assert.equal(run([1, 2, 3, 4, 5, 6].flatMap(k => week(k))).earned, 25 + 25);
  const status = weekStatus(hist(...week(1), ...week(2), ...thisWeek, [exercise(), at(4)]), at(4));
  assert.deepEqual(plain(status), { days: 3, target: 3, streak: 2, trainedToday: true });
  assert.deepEqual(plain(weekStatus([], at(4))), { days: 0, target: 3, streak: 0, trainedToday: false });
});
test('rank multiplier scales earning down as rank rises; goal-free totals never go negative', () => {
  for (const [elo, session] of [[0, 10], [299, 10], [300, 9], [900, 8], [2000, 7], [4000, 6], [7500, 5], [50000, 5]]) assert.equal(score([exercise()], [], elo).earned, session, `elo ${elo}`);
  assert.equal(rankMultiplier(0), 1); assert.equal(rankMultiplier(7500), 0.5);
  const day = d => [exercise(), at(d)];
  const bigDay = score([exercise(120)], hist(day(2), [exercise(100), at(3)]), 300, at(4));
  assert.deepEqual(lines(bigDay), [{ label: 'Session', amount: 9 }, { label: 'Weekly target: 3 training days', amount: 14 }, { label: 'Bench Press: 1 × 20 lb milestone', amount: 5 }]);
  assert.equal(bigDay.earned, 28);
  assert.equal(score([exercise(120)], hist([exercise(100), at(1)]), 7500).earned, 5 + 3);
});
test('huge values, invalid sets and duplicate exercises are rejected', () => {
  for (const [weight,reps] of [[-1,8],[Infinity,8],[NaN,8],[10000,8],[100,-1],[100,0],[100,1.5],[100,101]]) assert.throws(() => score([exercise(weight,reps)]));
  assert.throws(() => score([]));
  assert.throws(() => score([exercise(),exercise()]));
  assert.equal(processWorkout('bench-press',[{weight:'',reps:'8'}]).ok,false);
  assert.equal(processWorkout('bench-press',Array(21).fill({weight:'100',reps:'8'})).ok,false);
});
test('persistent history, breakdown saved, reload, idempotent and same-day submissions', () => {
  const storage = store();
  const first = saveWorkout([exercise()], 'one', storage, at(2));
  assert.equal(first.before,0); assert.equal(first.after,10);
  const second = saveWorkout([exercise(105)], 'two', storage, at(3));
  assert.equal(second.before,10); assert.equal(second.after,20);
  assert.equal(loadData(storage).workouts.length,2);
  assert.equal(loadData(storage).workouts[1].exercises[0].sets[0].weightLbs,105);
  assert.equal(saveWorkout([exercise(105)], 'two', storage, at(9)).after,20);
  assert.equal(loadData(storage).workouts.length,2);
  const third = saveWorkout([exercise(120)], 'three', storage, at(4));
  assert.equal(third.earned,30); assert.equal(third.after,50);
  assert.deepEqual(plain(loadData(storage).workouts[2].breakdown.map(line => line.amount)), [10, 15, 5]);
  assert.equal(loadData(storage).workouts[2].completedAt, at(4).toISOString());
  const sameDay = saveWorkout([exercise(90)], 'four', storage, at(4, 18));
  assert.equal(sameDay.earned,0); assert.equal(sameDay.after,50);
  assert.equal(loadData(storage).workouts.length,4);
  assert.equal(loadData(storage).elo,50);
});
test('failed writes award nothing; corrupted data is not overwritten', () => {
  const storage = store();
  saveWorkout([exercise()], 'one', storage, at(2));
  assert.throws(() => saveWorkout([exercise(105)],'two',{getItem:storage.getItem,setItem:()=>{throw new Error('Quota');}}, at(3)));
  assert.equal(loadData(storage).elo,10);
  let wrote = false;
  assert.throws(() => saveWorkout([exercise()],'one',{getItem:()=>'{broken',setItem:()=>{wrote=true;}}));
  assert.equal(wrote,false);
});
const V1 = 'fitrank.workouts.v1', V2 = 'fitrank.data.v2', V3 = 'fitrank.data.v3';
const saved = (id, ex = exercise(), earned = 12) => ({ id, completedAt: '2026-01-01T00:00:00.000Z', exercises: [ex], earned });
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const v1Store = workouts => { const s = store(); s.setItem(V1, JSON.stringify({ version: 1, workouts, elo: workouts.reduce((n, w) => n + w.earned, 0) })); return s; };
test('v1 data loads unchanged and migrates on first save; v1 key is never modified', () => {
  const storage = v1Store([saved('a'), saved('b', exercise(105), 24)]);
  const original = storage.getItem(V1);
  const loaded = loadData(storage);
  assert.equal(loaded.version, 3); same(loaded.goals, []); assert.equal(loaded.elo, 36); assert.equal(loaded.workouts.length, 2);
  same(loaded.workouts[1], saved('b', exercise(105), 24));
  assert.equal(storage.getItem(V3), null);
  const reward = saveWorkout([exercise(110)], 'c', storage, new Date(2026, 1, 2, 12));
  assert.equal(reward.before, 36); assert.equal(reward.after, 46);
  assert.equal(storage.getItem(V1), original);
  const v3 = JSON.parse(storage.getItem(V3));
  assert.equal(v3.version, 3); assert.equal(v3.workouts.length, 3); assert.equal(v3.elo, 46);
  same(loadData(storage), loadData(storage));
  assert.equal(saveWorkout([exercise(120)], 'd', storage, new Date(2026, 1, 3, 12)).after, 61);
  assert.equal(storage.getItem(V1), original);
});
test('bad entries are quarantined, not fatal; elo is derived from valid workouts', () => {
  const bad = { id: 'x', completedAt: 'nope', exercises: [], earned: 5 };
  const storage = v1Store([saved('a'), bad, saved('a'), saved('b', exercise(600), 200)]);
  const loaded = loadData(storage);
  same(loaded.workouts.map(w => w.id), ['a', 'b']);
  assert.equal(loaded.elo, 212);
  same(loaded.quarantine, [bad, saved('a')]);
  saveWorkout([exercise()], 'c', storage);
  same(JSON.parse(storage.getItem(V3)).quarantine, [bad, saved('a')]);
  const mismatched = store();
  mismatched.setItem(V1, JSON.stringify({ version: 1, workouts: [saved('a')], elo: 999 }));
  assert.equal(loadData(mismatched).elo, 12);
});
test('unreadable or unknown-version data throws and is never overwritten', () => {
  for (const [key, raw] of [[V2, '{broken'], [V2, '{"version":3,"workouts":[]}'], [V3, '{broken'], [V3, '{"version":4,"workouts":[]}'], [V3, '{"version":2,"workouts":[]}'], [V1, '{broken'], [V1, '{"version":1}'], [V2, 'null'], [V3, 'null']]) {
    const storage = store(); storage.setItem(key, raw);
    let wrote = false;
    assert.throws(() => loadData(storage), /Nothing was overwritten/);
    assert.throws(() => saveWorkout([exercise()], 'n', { getItem: storage.getItem, setItem: () => { wrote = true; } }));
    assert.equal(wrote, false); assert.equal(storage.getItem(key), raw);
  }
});
test('rank thresholds, progress, Elite cap, and no one drops a rank', () => {
  for(const [elo,name] of [[0,'Bronze'],[300,'Silver'],[900,'Gold'],[2000,'Platinum'],[4000,'Diamond'],[7500,'Elite']]) assert.equal(rankProgress(elo).rank,name);
  assert.equal(rankProgress(899).rank,'Silver');
  assert.equal(rankProgress(150).percent,50);
  assert.equal(rankProgress(299).remaining,1);
  assert.equal(rankProgress(300).percent,0);
  assert.equal(rankProgress(12000).percent,100);
  assert.equal(rankProgress(12000).next,undefined);
  // Old thresholds were Silver 300, Gold 1000, Platinum 2500, Diamond 5500, Elite 11000.
  const names = RANKS.map(rank => rank.name);
  for(const [elo,name] of [[300,'Silver'],[1000,'Gold'],[2500,'Platinum'],[5500,'Diamond'],[11000,'Elite']]) assert.ok(names.indexOf(rankProgress(elo).rank) >= names.indexOf(name), `${elo} keeps ${name}`);
});

test('catalog: unique ids, valid tags, legacy ids and limits preserved', () => {
  assert.ok(exercises.length >= 50);
  assert.equal(new Set(exercises.map(item => item.id)).size, exercises.length);
  for (const item of exercises) {
    assert.ok(MUSCLE_GROUPS.includes(item.primary), item.id);
    assert.ok(item.secondary.every(group => MUSCLE_GROUPS.includes(group) && group !== item.primary), item.id);
    assert.ok(item.maxWeightLbs > 0, item.id);
  }
  const legacy = { 'bench-press': 500, squat: 700, deadlift: 800, row: 200, 'overhead-press': 300, 'biceps-curl': 150, crunch: 100 };
  for (const [id, limit] of Object.entries(legacy)) assert.equal(exercises.find(item => item.id === id)?.maxWeightLbs, limit, id);
  assert.equal(processWorkout('bench-press', [{ weight: '500', reps: '5' }]).ok, true);
  assert.equal(processWorkout('bench-press', [{ weight: '501', reps: '5' }]).ok, false);
  assert.equal(processWorkout('nope', [{ weight: '1', reps: '5' }]).ok, false);
});
test('searchExercises: name, alias, muscle group and filter', () => {
  assert.equal(searchExercises('').length, exercises.length);
  assert.equal(searchExercises('rdl')[0].id, 'romanian-deadlift');
  assert.equal(searchExercises('OHP')[0].id, 'overhead-press');
  assert.ok(searchExercises('calves').every(item => [item.primary, ...item.secondary].includes('Calves')));
  const chest = searchExercises('', 'Chest');
  assert.ok(chest.length > 3 && chest.every(item => item.primary === 'Chest' || item.secondary.includes('Chest')));
  assert.equal(chest[0].primary, 'Chest');
  assert.equal(searchExercises('zzzz').length, 0);
});
test('processSession: limits, duplicates, per-entry errors, success', () => {
  const sets = [{ weight: '100', reps: '8' }];
  assert.equal(processSession([]).ok, false);
  const nine = exercises.slice(0, 8).map(item => ({ exerciseId: item.id, sets }));
  assert.match(processSession(nine).errors.session, /at most 7/);
  assert.match(processSession([{ exerciseId: 'squat', sets }, { exerciseId: 'squat', sets }]).errors.session, /only be added once/);
  const bad = processSession([{ exerciseId: 'squat', sets }, { exerciseId: 'row', sets: [{ weight: '999', reps: '8' }] }]);
  assert.equal(bad.ok, false);
  assert.deepEqual(plain(bad.errors.entries[0].rows), []);
  assert.ok(bad.errors.entries[1].rows[0].weight);
  const good = processSession([{ exerciseId: 'squat', sets }, { exerciseId: 'leg-press', sets: [{ weight: '0', reps: '10' }, { weight: '300', reps: '10' }] }]);
  assert.equal(good.ok, true);
  assert.deepEqual(plain(good.exercises.map(item => item.exerciseId)), ['squat', 'leg-press']);
  assert.equal(good.exercises[1].sets.length, 2);
});
test('multi-exercise session scores and round-trips through storage', () => {
  const session = [exercise(100, 8, 'bench-press'), exercise(200, 5, 'squat'), exercise(50, 10, 'lat-pulldown')];
  assert.equal(score(session).earned, 10);
  const storage = store();
  const reward = saveWorkout(session, 'multi', storage, at(2));
  assert.equal(reward.earned, 10);
  const loaded = loadData(storage);
  assert.equal(loaded.workouts[0].exercises.length, 3);
  assert.equal(loaded.elo, 10);
  assert.equal(score([exercise(125, 8, 'bench-press')], loaded.workouts, loaded.elo, at(3)).earned, 15);
});
test('draft: round-trip, tolerant load, blocked storage, separate from saved data', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
  const entries = [{ exerciseId: 'squat', sets: [{ weight: '100', reps: '5' }] }];
  assert.equal(saveDraft(entries, storage), true);
  assert.deepEqual(plain(loadDraft(storage)), entries);
  assert.deepEqual([...data.keys()], ['fitrank.draft.v1']);
  data.set('fitrank.draft.v1', JSON.stringify({ version: 1, entries: [{ exerciseId: 'ghost', sets: [] }, { exerciseId: 'row', sets: [{ weight: 5, reps: '1' }] }, { exerciseId: 'row', sets: [] }, 7, entries[0]] }));
  assert.deepEqual(plain(loadDraft(storage).map(item => item.exerciseId)), ['row', 'squat']);
  assert.deepEqual(plain(loadDraft(storage)[0].sets), [{ weight: '', reps: '' }]);
  data.set('fitrank.draft.v1', '{not json');
  assert.deepEqual(plain(loadDraft(storage)), []);
  data.set('fitrank.draft.v1', JSON.stringify({ version: 2, entries }));
  assert.deepEqual(plain(loadDraft(storage)), []);
  assert.equal(clearDraft(storage), true);
  assert.equal(data.size, 0);
  const blocked = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(plain(loadDraft(blocked)), []);
  assert.equal(saveDraft(entries, blocked), false);
  assert.equal(clearDraft(blocked), false);
});

const goalInput = (overrides = {}) => ({ exerciseId: 'bench-press', kind: 'weight', target: 110, ...overrides });
const logged = (...items) => items.map(ex => ({ exercises: [ex] }));
test('v2 data loads as v3 with no goals; v2 key is never modified', () => {
  const storage = store();
  const v2 = JSON.stringify({ version: 2, workouts: [saved('a'), saved('b', exercise(105), 24)], elo: 36, quarantine: ['old'] });
  storage.setItem(V2, v2);
  const loaded = loadData(storage);
  assert.equal(loaded.version, 3); assert.equal(loaded.elo, 36); same(loaded.goals, []); same(loaded.quarantine, ['old']);
  assert.equal(storage.getItem(V3), null);
  const reward = saveWorkout([exercise(110)], 'c', storage);
  assert.equal(reward.before, 36);
  assert.equal(storage.getItem(V2), v2);
  const v3 = JSON.parse(storage.getItem(V3));
  assert.equal(v3.version, 3); assert.equal(v3.workouts.length, 3); same(v3.quarantine, ['old']); same(v3.goals, []);
  // v3 wins once it exists, even though v2 is still on disk.
  assert.equal(loadData(storage).workouts.length, 3);
});
test('goals persist across saves; bad goals are quarantined; bad breakdowns are dropped', () => {
  const storage = store();
  saveWorkout([exercise(100)], 'one', storage);
  const goal = addGoal(goalInput(), 'g1', storage, new Date('2026-03-01T12:00:00Z'));
  assert.equal(goal.baseline, 100); assert.equal(goal.createdAt, '2026-03-01T12:00:00.000Z');
  same(addGoal(goalInput({ target: 200 }), 'g1', storage), goal);
  assert.equal(loadData(storage).goals.length, 1);
  saveWorkout([exercise(101)], 'two', storage);
  same(loadData(storage).goals, [goal]);
  const v3 = JSON.parse(storage.getItem(V3));
  const badGoal = { id: 'bad', exerciseId: 'squat', kind: 'sideways', target: 5, baseline: 0, reward: 50, createdAt: '2026-01-01T00:00:00Z' };
  const withBreakdowns = { ...saved('x', exercise(), 12), breakdown: [{ label: 'Session', amount: 10 }] };
  const brokenBreakdown = { ...saved('y', exercise(), 12), breakdown: 'oops' };
  storage.setItem(V3, JSON.stringify({ ...v3, goals: [goal, goal, badGoal], workouts: [...v3.workouts, withBreakdowns, brokenBreakdown] }));
  const loaded = loadData(storage);
  same(loaded.goals, [goal]); same(loaded.quarantine, [goal, badGoal]);
  same(loaded.workouts.find(w => w.id === 'x').breakdown, [{ label: 'Session', amount: 10 }]);
  assert.equal('breakdown' in loaded.workouts.find(w => w.id === 'y'), false);
  assert.equal(loaded.workouts.length, 4);
});
test('deleteGoal removes active goals only; goal writes respect failed storage', () => {
  const storage = store();
  saveWorkout([exercise(100)], 'one', storage);
  addGoal(goalInput(), 'g1', storage);
  deleteGoal('missing', storage);
  assert.equal(loadData(storage).goals.length, 1);
  deleteGoal('g1', storage);
  assert.equal(loadData(storage).goals.length, 0);
  addGoal(goalInput(), 'g2', storage);
  const v3 = JSON.parse(storage.getItem(V3));
  v3.goals[0].achievedAt = '2026-03-02T00:00:00Z';
  storage.setItem(V3, JSON.stringify(v3));
  deleteGoal('g2', storage);
  assert.equal(loadData(storage).goals.length, 1);
  assert.throws(() => addGoal(goalInput({ exerciseId: 'row', target: 60 }), 'g3', { getItem: storage.getItem, setItem: () => { throw new Error('Quota'); } }), /Log this exercise/);
  assert.throws(() => addGoal(goalInput({ target: 120 }), 'g4', { getItem: storage.getItem, setItem: () => { throw new Error('Quota'); } }), /Quota/);
  assert.equal(loadData(storage).goals.length, 1);
});
test('goalReward scales with stretch, rounds to 5, and is capped', () => {
  assert.equal(goalReward(100, 105), 50);
  assert.equal(goalReward(100, 115), 100);
  assert.equal(goalReward(100, 125), 150);
  assert.equal(goalReward(100, 400), 150);
  assert.equal(goalReward(100, 111), 80);
  assert.equal(goalReward(0, 10), 150);
});
test('validateGoal: weight goals need a real stretch over a logged best', () => {
  const history = logged(exercise(100), exercise(90));
  assert.equal(currentBest(history, 'bench-press', 'weight'), 100);
  assert.equal(validateGoal(goalInput({ target: 105 }), history, []).ok, true);
  assert.equal(validateGoal(goalInput({ target: 105 }), history, []).reward, 50);
  assert.match(validateGoal(goalInput({ target: 104.9 }), history, []).error, /at least 105 lbs/);
  assert.match(validateGoal(goalInput({ target: 100 }), history, []).error, /at least 105/);
  assert.match(validateGoal(goalInput({ target: 501 }), history, []).error, /up to 500/);
  assert.ok(!validateGoal(goalInput({ target: NaN }), history, []).ok);
  assert.ok(!validateGoal(goalInput({ target: 0 }), history, []).ok);
  assert.ok(!validateGoal(goalInput({ exerciseId: 'ghost' }), history, []).ok);
  assert.match(validateGoal(goalInput({ exerciseId: 'squat', target: 300 }), history, []).error, /Log this exercise/);
  assert.match(validateGoal(goalInput({ exerciseId: 'push-up', target: 20 }), logged(exercise(0, 10, 'push-up')), []).error, /reps goal instead/);
});
test('validateGoal: reps goals use a lifted weight and at least +1 rep / +5%', () => {
  const history = logged(exercise(100, 8), exercise(0, 20, 'push-up'));
  const reps = (overrides = {}) => ({ exerciseId: 'bench-press', kind: 'reps', target: 10, atWeightLbs: 100, ...overrides });
  assert.equal(currentBest(history, 'bench-press', 'reps', 100), 8);
  assert.equal(currentBest(history, 'bench-press', 'reps', 101), 0);
  assert.equal(validateGoal(reps({ target: 9 }), history, []).ok, true);
  assert.match(validateGoal(reps({ target: 8 }), history, []).error, /at least 9 reps/);
  assert.match(validateGoal(reps({ atWeightLbs: 150 }), history, []).error, /already lifted/);
  assert.ok(!validateGoal(reps({ atWeightLbs: undefined }), history, []).ok);
  assert.ok(!validateGoal(reps({ target: 9.5 }), history, []).ok);
  assert.ok(!validateGoal(reps({ target: 101 }), history, []).ok);
  assert.equal(validateGoal(reps({ exerciseId: 'push-up', atWeightLbs: 0, target: 20 }), history, []).ok, false);
  assert.equal(validateGoal(reps({ exerciseId: 'push-up', atWeightLbs: 0, target: 21 }), history, []).ok, true);
  // lower weight than the best: only sets at or above it count, so baseline can differ.
  assert.equal(validateGoal(reps({ atWeightLbs: 50, target: 9 }), history, []).baseline, 8);
});
test('validateGoal: max 3 active goals and one active goal per exercise and kind', () => {
  const history = logged(exercise(100), exercise(100, 5, 'squat'), exercise(50, 5, 'row'), exercise(40, 5, 'lat-pulldown'));
  const goal = (id, exerciseId, kind = 'weight', achievedAt) => ({ id, exerciseId, kind, target: 500, ...(kind === 'reps' ? { atWeightLbs: 0 } : {}), baseline: 100, reward: 50, createdAt: '2026-01-01T00:00:00Z', ...(achievedAt ? { achievedAt } : {}) });
  assert.match(validateGoal(goalInput({ target: 120 }), history, [goal('a', 'bench-press')]).error, /already have an active goal/);
  assert.equal(validateGoal(goalInput({ kind: 'reps', target: 10, atWeightLbs: 100 }), history, [goal('a', 'bench-press')]).ok, true);
  const three = [goal('a', 'squat'), goal('b', 'row'), goal('c', 'lat-pulldown')];
  assert.match(validateGoal(goalInput({ target: 120 }), history, three).error, /at most 3/);
  assert.equal(validateGoal(goalInput({ target: 120 }), history, [...three.slice(0, 2), goal('c', 'lat-pulldown', 'weight', '2026-02-01T00:00:00Z')]).ok, true);
});
test('isGoalMet: weight and reps goals', () => {
  const base = { id: 'g', exerciseId: 'bench-press', baseline: 100, reward: 50, createdAt: '2026-01-01T00:00:00Z' };
  const weight = { ...base, kind: 'weight', target: 110 };
  const reps = { ...base, kind: 'reps', target: 10, atWeightLbs: 100 };
  assert.equal(isGoalMet(weight, [exercise(110, 1)]), true);
  assert.equal(isGoalMet(weight, [exercise(109.5, 20)]), false);
  assert.equal(isGoalMet(weight, [exercise(200, 5, 'squat')]), false);
  assert.equal(isGoalMet(reps, [exercise(100, 10)]), true);
  assert.equal(isGoalMet(reps, [exercise(95, 12)]), false);
  assert.equal(isGoalMet(reps, [{ exerciseId: 'bench-press', sets: [{ weightLbs: 100, reps: 8 }, { weightLbs: 120, reps: 10 }] }]), true);
  assert.equal(isGoalMet(reps, [{ exerciseId: 'bench-press', sets: [{ weightLbs: 100, reps: 9 }, { weightLbs: 120, reps: 5 }] }]), false);
});

const aGoal = (overrides = {}) => ({ id: 'g1', exerciseId: 'bench-press', kind: 'weight', target: 110, baseline: 100, reward: 80, createdAt: at(1).toISOString(), ...overrides });
test('scoring: goal rewards are added once per met goal and are not rank-scaled', () => {
  const run = (goals, current = [exercise(110)], elo = 0) => scoreWorkout(current, hist([exercise(100), at(1)]), elo, at(2), goals);
  const met = run([aGoal()]);
  assert.equal(met.earned, 10 + 80); assert.deepEqual(plain(met.achievedGoalIds), ['g1']);
  assert.deepEqual(lines(met)[1], { label: 'Goal achieved: Bench Press: 110 lbs', amount: 80 });
  assert.equal(run([aGoal()], [exercise(110)], 7500).earned, 5 + 80);
  assert.equal(run([aGoal()], [exercise(109)]).earned, 10);
  assert.deepEqual(plain(run([aGoal()], [exercise(109)]).achievedGoalIds), []);
  assert.equal(run([aGoal({ achievedAt: at(1).toISOString() })]).earned, 10);
  assert.equal(run([aGoal()], [exercise(300, 8, 'squat')]).earned, 10);
  const two = run([aGoal(), aGoal({ id: 'g2', kind: 'reps', target: 10, atWeightLbs: 100, reward: 60 })], [exercise(110, 10)]);
  assert.equal(two.earned, 10 + 80 + 60); assert.deepEqual(plain(two.achievedGoalIds), ['g1', 'g2']);
  assert.match(lines(two)[2].label, /Bench Press: 10 reps at 100\+ lbs/);
});
test('saving a workout completes goals atomically, once, and keeps elo = sum of earned', () => {
  const storage = store();
  saveWorkout([exercise(100)], 'one', storage, at(2));
  const goal = addGoal(goalInput({ target: 110 }), 'g1', storage, at(2));
  addGoal({ exerciseId: 'bench-press', kind: 'reps', target: 10, atWeightLbs: 100 }, 'g2', storage, at(2));
  const miss = saveWorkout([exercise(105)], 'two', storage, at(3));
  assert.equal(miss.earned, 10); assert.equal(miss.goalsAchieved.length, 0);
  assert.equal(loadData(storage).goals.filter(g => g.achievedAt).length, 0);
  const hit = saveWorkout([exercise(110, 4)], 'three', storage, at(4));
  assert.equal(goal.reward, 75); assert.equal(hit.earned, 10 + 15 + goal.reward);
  assert.deepEqual(plain(hit.goalsAchieved.map(g => g.id)), ['g1']);
  const after = loadData(storage);
  const done = after.goals.find(g => g.id === 'g1');
  assert.equal(done.achievedAt, at(4).toISOString()); assert.equal(done.achievedWorkoutId, 'three');
  assert.equal(after.goals.find(g => g.id === 'g2').achievedAt, undefined);
  assert.equal(after.elo, after.workouts.reduce((sum, w) => sum + w.earned, 0));
  assert.ok(after.workouts[2].breakdown.some(line => /Goal achieved/.test(line.label)));
  // Re-submitting the same workout id pays nothing more and still reports the goal.
  const again = saveWorkout([exercise(110, 4)], 'three', storage, at(9));
  assert.equal(again.after, hit.after); assert.deepEqual(plain(again.goalsAchieved.map(g => g.id)), ['g1']);
  // Matching the target again later does not pay an achieved goal a second time.
  assert.equal(saveWorkout([exercise(110)], 'four', storage, at(5)).earned, 10);
  assert.equal(loadData(storage).goals.find(g => g.id === 'g1').achievedWorkoutId, 'three');
  // Removing is no longer possible once achieved; the reward stays in history.
  deleteGoal('g1', storage);
  assert.equal(loadData(storage).goals.length, 2);
});
test('a failed write neither completes goals nor awards their reward', () => {
  const storage = store();
  saveWorkout([exercise(100)], 'one', storage, at(2));
  addGoal(goalInput({ target: 110 }), 'g1', storage, at(2));
  assert.throws(() => saveWorkout([exercise(115)], 'two', { getItem: storage.getItem, setItem: () => { throw new Error('Quota'); } }, at(3)));
  assert.equal(loadData(storage).goals[0].achievedAt, undefined);
  assert.equal(loadData(storage).elo, 10);
});
test('addGoal rule violations throw GoalError', () => {
  const storage = store();
  saveWorkout([exercise(100)], 'one', storage, at(2));
  assert.throws(() => addGoal(goalInput({ target: 101 }), 'g1', storage), error => error.constructor.name === 'GoalError' && /at least 105/.test(error.message));
  assert.equal(loadData(storage).goals.length, 0);
});

const setsOf = (count, exerciseId = 'bench-press', weight = 50) => ({ exerciseId, sets: Array.from({ length: count }, () => ({ weightLbs: weight, reps: 8 })) });
const five = ['bench-press', 'squat', 'deadlift', 'row', 'overhead-press'];
test('effort bonus: +6 per exercise with 3+ sets, 5 per day, no repeat credit, rank-scaled', () => {
  assert.equal(score([setsOf(3)]).earned, 16);
  assert.deepEqual(lines(score([setsOf(3)]))[1], { label: 'Effort: 1 exercise with 3+ sets', amount: 6 });
  assert.equal(score([setsOf(2)]).earned, 10);
  assert.equal(score([setsOf(3), setsOf(2, 'row'), setsOf(4, 'squat')]).earned, 22);
  assert.equal(score(five.map(id => setsOf(3, id))).earned, 10 + 30);
  assert.equal(score([...five, 'biceps-curl'].map(id => setsOf(3, id))).earned, 10 + 30);
  // Splitting a day: new exercises still earn until 5 are credited, repeats earn nothing.
  const morning = hist([setsOf(3, 'bench-press'), at(2, 7)], [setsOf(3, 'squat'), at(2, 8)]);
  assert.equal(score([setsOf(3, 'bench-press'), setsOf(3, 'squat')], morning).earned, 0);
  assert.equal(score([setsOf(3, 'bench-press'), setsOf(3, 'deadlift')], morning).earned, 6);
  assert.equal(score(['deadlift', 'row', 'overhead-press', 'biceps-curl'].map(id => setsOf(3, id)), morning).earned, 18);
  // A new day starts a fresh allowance.
  assert.equal(score([setsOf(3)], morning, 0, at(3)).earned, 16);
  assert.equal(score([setsOf(3), setsOf(3, 'row')], [], 7500).earned, 5 + 6);
  assert.equal(score([setsOf(3)], [], 300).earned, 9 + 5);
});

test('stats: per-exercise series, volume and bodyweight handling', () => {
  const history = [
    { exercises: [{ exerciseId: 'bench-press', sets: [{ weightLbs: 100, reps: 8 }, { weightLbs: 120, reps: 5 }] }, exercise(50, 10, 'row')], completedAt: at(2).toISOString(), earned: 10 },
    { exercises: [exercise(0, 12, 'bench-press')], completedAt: at(4).toISOString(), earned: 10 },
  ];
  const series = plain(exerciseSeries(history, 'bench-press'));
  assert.deepEqual(series.map(p => [p.bestWeight, p.bestReps, p.volume]), [[120, 8, 1400], [0, 12, 0]]);
  assert.deepEqual(plain(exerciseSeries(history, 'squat')), []);
});
test('stats: personal records pick heaviest set, ties by reps', () => {
  const history = [
    { exercises: [exercise(100, 5), exercise(0, 10, 'row')], completedAt: at(2).toISOString() },
    { exercises: [exercise(100, 8), exercise(50, 3, 'row')], completedAt: at(3).toISOString() },
  ];
  const records = plain(personalRecords(history));
  assert.deepEqual(records.map(r => [r.exerciseId, r.weightLbs, r.reps, r.name]), [['bench-press', 100, 8, 'Bench Press'], ['row', 50, 3, exercises.find(e => e.id === 'row').name]]);
  assert.deepEqual(plain(personalRecords([])), []);
});
test('stats: weekly counts are distinct days per Mon-Sun week, oldest first', () => {
  const history = hist([exercise(), at(2)], [exercise(), at(2, 18)], [exercise(), at(4)], [exercise(), at(10)]);
  const counts = plain(weeklyCounts(history, 3, at(11)).map(w => w.days));
  assert.deepEqual(counts, [0, 2, 1]);
  assert.equal(weeklyCounts([], 12, at(11)).length, 12);
});
test('stats: ELO series accumulates earned; muscle sets cover every group', () => {
  const history = hist([exercise(), at(2)], [exercise(50, 8, 'squat'), at(3)]).map((w, i) => ({ ...w, earned: [10, 15][i] }));
  assert.deepEqual(plain(eloSeries(history)).map(p => p.elo), [10, 25]);
  assert.deepEqual(plain(eloSeries([])), []);
  const muscles = plain(muscleSets(history));
  assert.equal(muscles.length, MUSCLE_GROUPS.length);
  assert.equal(muscles.find(m => m.muscle === 'Chest').sets, 1);
  assert.equal(muscles.find(m => m.muscle === 'Quads').sets, 1);
  assert.equal(muscles.find(m => m.muscle === 'Calves').sets, 0);
});

test('a later session the same day explains the missing session bonus without changing ELO',()=>{
  const first=scoreWorkout([exercise()],[],0,new Date('2026-03-10T09:00:00'));
  assert.ok(first.breakdown.some(line=>line.label==='Session'));
  assert.equal(missedSessionBonus(first.breakdown),false);
  const history=[{completedAt:new Date('2026-03-10T09:00:00').toISOString(),exercises:[exercise()]}];
  const second=scoreWorkout([exercise(100,8,'squat')].map(ex=>({...ex,sets:[ex.sets[0],ex.sets[0],ex.sets[0]]})),history,first.earned,new Date('2026-03-10T18:00:00'));
  assert.deepEqual(plain(second.breakdown.map(line=>line.label.split(':')[0])),['Effort']);
  assert.equal(second.earned,6);
  assert.equal(missedSessionBonus(second.breakdown),true);
  assert.match(SESSION_ONCE_A_DAY,/once per day/);
  // Workouts saved before breakdowns existed have nothing to explain.
  assert.equal(missedSessionBonus(undefined),false);
  assert.equal(missedSessionBonus([]),false);
});
