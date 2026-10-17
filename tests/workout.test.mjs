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
const { saveWorkout, loadData } = load('storage');
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
const V1 = 'fitrank.workouts.v1', V2 = 'fitrank.data.v2';
const saved = (id, ex = exercise(), earned = 12) => ({ id, completedAt: '2026-01-01T00:00:00.000Z', exercises: [ex], earned });
const same = (a, b) => assert.equal(JSON.stringify(a), JSON.stringify(b));
const v1Store = workouts => { const s = store(); s.setItem(V1, JSON.stringify({ version: 1, workouts, elo: workouts.reduce((n, w) => n + w.earned, 0) })); return s; };
test('v1 data loads unchanged and migrates on first save; v1 key is never modified', () => {
  const storage = v1Store([saved('a'), saved('b', exercise(105), 24)]);
  const original = storage.getItem(V1);
  const loaded = loadData(storage);
  assert.equal(loaded.version, 2); assert.equal(loaded.elo, 36); assert.equal(loaded.workouts.length, 2);
  same(loaded.workouts[1], saved('b', exercise(105), 24));
  assert.equal(storage.getItem(V2), null);
  const reward = saveWorkout([exercise(110)], 'c', storage);
  assert.equal(reward.before, 36); assert.equal(reward.after, 60);
  assert.equal(storage.getItem(V1), original);
  const v2 = JSON.parse(storage.getItem(V2));
  assert.equal(v2.version, 2); assert.equal(v2.workouts.length, 3); assert.equal(v2.elo, 60);
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
  same(JSON.parse(storage.getItem(V2)).quarantine, [bad, saved('a')]);
  const mismatched = store();
  mismatched.setItem(V1, JSON.stringify({ version: 1, workouts: [saved('a')], elo: 999 }));
  assert.equal(loadData(mismatched).elo, 12);
});
test('unreadable or unknown-version data throws and is never overwritten', () => {
  for (const [key, raw] of [[V2, '{broken'], [V2, '{"version":3,"workouts":[]}'], [V1, '{broken'], [V1, '{"version":1}'], [V2, 'null']]) {
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
