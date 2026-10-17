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
const { scoreWorkout, rankProgress } = load('scoring');
const { saveWorkout, loadData, addGoal, deleteGoal } = load('storage');
const { validateGoal, goalReward, currentBest, isGoalMet } = load('goals');
const { processWorkout, processSession } = load('model');
const { exercises, searchExercises, MUSCLE_GROUPS } = load('exercises');
const { loadDraft, saveDraft, clearDraft } = load('draft');
const exercise = (weight = 100, reps = 8, exerciseId = 'bench-press') => ({ exerciseId, sets: [{ weightLbs: weight, reps }] });
function store() {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
// Objects from the vm context have a different prototype, so compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const past = (...items) => items.map(ex => ({ exercises: [ex], earned: 12 }));

test('completion, distinct exercises, improvement, PB, flat and down sessions', () => {
  assert.equal(scoreWorkout([exercise()], []), 12);
  assert.equal(scoreWorkout([exercise(), exercise(50,8,'row')], []), 14);
  assert.equal(scoreWorkout([exercise(105)], past(exercise())), 24);
  assert.equal(scoreWorkout([exercise(100,9)], past(exercise())), 24);
  assert.equal(scoreWorkout([exercise()], past(exercise())), 12);
  assert.equal(scoreWorkout([exercise(90)], past(exercise())), 12);
  assert.equal(scoreWorkout([exercise(95)], past(exercise(100), exercise(90))), 14);
  assert.equal(scoreWorkout([exercise(0,9)], past(exercise(0,8))), 24);
  assert.equal(scoreWorkout([exercise(100)], past(exercise(0,8))), 12);
  assert.equal(scoreWorkout([{...exercise(),sets:[...exercise().sets,...exercise().sets]}],past(exercise())),12);
});
test('huge values, invalid sets, duplicate exercises and outlier bonuses', () => {
  for (const [weight,reps] of [[-1,8],[Infinity,8],[NaN,8],[10000,8],[100,-1],[100,0],[100,1.5],[100,101]]) assert.throws(() => scoreWorkout([exercise(weight,reps)], []));
  assert.throws(() => scoreWorkout([], []));
  assert.throws(() => scoreWorkout([exercise(),exercise()], []));
  assert.equal(scoreWorkout([exercise(300)],past(exercise(100))),12);
  assert.equal(processWorkout('bench-press',[{weight:'',reps:'8'}]).ok,false);
  assert.equal(processWorkout('bench-press',Array(21).fill({weight:'100',reps:'8'})).ok,false);
});
test('persistent history, PB across saves, reload, and idempotent submission', () => {
  const storage = store();
  const first = saveWorkout([exercise()], 'one', storage);
  assert.equal(first.before,0); assert.equal(first.after,12);
  const second = saveWorkout([exercise(105)], 'two', storage);
  assert.equal(second.before,12); assert.equal(second.after,36);
  assert.equal(loadData(storage).workouts.length,2);
  assert.equal(loadData(storage).workouts[1].exercises[0].sets[0].weightLbs,105);
  assert.equal(saveWorkout([exercise(105)], 'two', storage).after,36);
  assert.equal(loadData(storage).workouts.length,2);
  assert.equal(saveWorkout([exercise(90)], 'three', storage).after,48);
});
test('failed writes award nothing; corrupted data is not overwritten', () => {
  const storage = store();
  saveWorkout([exercise()], 'one', storage);
  assert.throws(() => saveWorkout([exercise(105)],'two',{getItem:storage.getItem,setItem:()=>{throw new Error('Quota');}}));
  assert.equal(loadData(storage).elo,12);
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
  const reward = saveWorkout([exercise(110)], 'c', storage);
  assert.equal(reward.before, 36); assert.equal(reward.after, 60);
  assert.equal(storage.getItem(V1), original);
  const v3 = JSON.parse(storage.getItem(V3));
  assert.equal(v3.version, 3); assert.equal(v3.workouts.length, 3); assert.equal(v3.elo, 60);
  same(loadData(storage), loadData(storage));
  assert.equal(saveWorkout([exercise(120)], 'd', storage).after, 84);
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
test('rank thresholds, progress and Elite cap', () => {
  for(const [elo,name] of [[0,'Bronze'],[300,'Silver'],[1000,'Gold'],[2500,'Platinum'],[5500,'Diamond'],[11000,'Elite']]) assert.equal(rankProgress(elo).rank,name);
  assert.equal(rankProgress(150).percent,50);
  assert.equal(rankProgress(299).remaining,1);
  assert.equal(rankProgress(300).percent,0);
  assert.equal(rankProgress(12000).percent,100);
  assert.equal(rankProgress(12000).next,undefined);
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
  assert.equal(scoreWorkout(session, []), 16);
  const storage = store();
  const reward = saveWorkout(session, 'multi', storage);
  assert.equal(reward.earned, 16);
  const loaded = loadData(storage);
  assert.equal(loaded.workouts[0].exercises.length, 3);
  assert.equal(loaded.elo, 16);
  assert.equal(scoreWorkout([exercise(105, 8, 'bench-press')], loaded.workouts), 24);
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
