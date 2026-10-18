import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
const cache = new Map();
function load(file) {
  file = path.resolve(file);
  if(cache.has(file)) return cache.get(file);
  const context = { exports: {}, require: name => {
    if(!name.startsWith('.')) return require(name);
    const base = path.resolve(path.dirname(file),name);
    return load([base+'.ts',base+'.tsx'].find(candidate=>fs.existsSync(candidate)));
  }};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,context);
  cache.set(file,context.exports); return context.exports;
}
const { summarize, latestComparisons } = load('src/app/data.ts');
const { Home, Workouts, Progress, Food, Settings } = load('src/app/pages.tsx');
const empty = {version:3,workouts:[],goals:[],elo:0};
const workout = (id,date,weight,earned) => ({id,completedAt:date,earned,exercises:[{exerciseId:'bench-press',sets:[{weightLbs:weight,reps:8}]}]});
const data = {version:3,elo:36,goals:[],workouts:[workout('one','2026-09-14T12:00:00',100,12),workout('two','2026-09-18T12:00:00',105,24)]};
// Screens that read the signed-in account get a fake one backed by memory.
const { AccountContext } = load('src/cloud/accountContext.ts');
const memory = new Map();
const account = { user:{id:'test-user',email:'lifter@example.com'}, storage:{getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)},
  sync:{state:'idle',rejected:[]}, syncNow:async()=>true, dataVersion:0, deviceImport:null, importDevice:async()=>0, declineImport(){}, signOut:async()=>{}, deleteAccount:async()=>{} };
const renderAs = (value,component,props) => renderToStaticMarkup(React.createElement(AccountContext.Provider,{value},React.createElement(component,props)));
const render = (component,props) => renderAs(account,component,props);
test('fresh browser renders honest empty home, history and progress',()=>{
  assert.match(render(Home,{data:empty}),/Bronze/);
  assert.match(render(Home,{data:empty}),/Your first session/);
  assert.match(render(Workouts,{data:empty}),/Your first session/);
  assert.match(render(Progress,{data:empty}),/starting point/);
});
test('saved history supplies totals, session sets and comparisons',()=>{
  assert.equal(summarize(data.workouts,new Date('2026-09-18T13:00:00')).thisWeek,2);
  assert.equal(summarize(data.workouts).sets,2);
  assert.equal(latestComparisons(data.workouts)[0].previous.weightLbs,100);
  assert.equal(latestComparisons(data.workouts)[0].current.weightLbs,105);
  assert.match(render(Workouts,{data}),/105.*lbs/);
  assert.match(render(Progress,{data}),/More weight or reps/);
  assert.match(render(Home,{data}),/36/);
});
test('food does not pretend to save; settings has real account controls and no password UI',()=>{
  assert.match(render(Food,{}),/isn’t available yet/);
  assert.doesNotMatch(render(Food,{}),/Save food|Calories/);
  assert.match(render(Food,{}),/Coming soon/);
  assert.match(render(Home,{data}),/Log Food · Coming soon/);
  assert.doesNotMatch(render(Home,{data}),/href="#\/food"/);
  const settings = render(Settings,{data});
  assert.match(settings,/lifter@example\.com/);
  assert.match(settings,/Export my data/);
  assert.match(settings,/Sign out/);
  assert.match(settings,/Delete my account/);
  assert.match(settings,/Type DELETE to confirm/);
  assert.match(settings,/<button[^>]*disabled=""[^>]*>Delete my account/);
  assert.doesNotMatch(settings,/Password|Coming soon/);
});
test('settings offers "Import data from this device" only to the account that may import, and not after importing',()=>{
  const button = /Import data from this device/;
  const stateFor = deviceImport => renderAs({...account,deviceImport},Settings,{data});
  assert.doesNotMatch(stateFor(null),button);
  assert.doesNotMatch(stateFor({status:'imported',workouts:2,goals:0}),button);
  assert.match(stateFor({status:'declined',workouts:2,goals:0}),button);
  assert.match(stateFor({status:'offered',workouts:1,goals:0}),button);
});
test('settings reports sync state and workouts the server refused',()=>{
  assert.match(renderAs({...account,sync:{state:'error',rejected:[],message:'Couldn’t sync.'}},Settings,{data}),/Couldn’t sync/);
  assert.match(renderAs({...account,sync:{state:'synced',at:Date.now(),rejected:['x']}},Settings,{data}),/1 workout couldn’t be uploaded/);
});
const { exportJson } = load('src/app/exportData.ts');
test('export is the saved data, as JSON that parses back to the same thing',()=>{
  assert.deepEqual(JSON.parse(exportJson(data)),JSON.parse(JSON.stringify(data)));
  assert.equal(JSON.parse(exportJson(data)).workouts.length,2);
});
const { hasSeenIntroduction, completeIntroduction } = load('src/app/introductionPreference.ts');
const { default: Introduction } = load('src/app/Introduction.tsx');
test('introduction completion persists independently of workout data',()=>{
  const saved = new Map([['fitrank.workouts.v1','existing workout data']]);
  const storage = { getItem:key=>saved.get(key)??null, setItem:(key,value)=>saved.set(key,value) };
  assert.equal(hasSeenIntroduction(storage),false);
  assert.equal(completeIntroduction(storage),true);
  assert.equal(hasSeenIntroduction(storage),true);
  assert.equal(saved.get('fitrank.workouts.v1'),'existing workout data');
  assert.equal(saved.size,2);
});
test('unavailable preference storage does not throw or falsely report saving',()=>{
  assert.equal(hasSeenIntroduction({getItem:()=>{throw new Error('blocked');}}),false);
  assert.equal(completeIntroduction({setItem:()=>{throw new Error('blocked');}}),false);
});
test('introduction is concise and includes the rank order and completion action',()=>{
  const html=render(Introduction,{onComplete:()=>{}});
  assert.match(html,/Start FitRank/);
  assert.match(html,/ELO never decreases/);
  assert.match(html,/Bronze.*Silver.*Gold.*Platinum.*Diamond.*Elite/);
  assert.match(render(Introduction,{onComplete:()=>{},reviewing:true}),/Back to Settings/);
  assert.match(render(Settings,{data}),/View FitRank Introduction/);
});
test('home and progress include collapsed, native keyboard-accessible ELO help',()=>{
  for (const component of [Home,Progress]) {
    const html=render(component,{data});
    assert.match(html,/<details class="app-elo-help"><summary>What is ELO\?<\/summary>/);
    assert.match(html,/Your ELO never decreases/);
    assert.doesNotMatch(html,/<details[^>]* open/);
  }
  assert.match(render(Home,{data}),/Log a workout, earn ELO/);
});
test('history renders a multi-exercise session with library names',()=>{
  const multi={version:3,elo:16,quarantine:[],goals:[],workouts:[{id:'m',completedAt:'2026-09-20T12:00:00',earned:16,exercises:[
    {exerciseId:'bench-press',sets:[{weightLbs:100,reps:8}]},
    {exerciseId:'lat-pulldown',sets:[{weightLbs:120,reps:10},{weightLbs:130,reps:8}]}]}]};
  const html=render(Workouts,{data:multi});
  assert.match(html,/Bench Press/);
  assert.match(html,/Lat Pulldown/);
  assert.match(html,/130.*lbs/);
});
test('goals card: empty state, set-a-goal entry, active and achieved goals, cap',()=>{
  assert.match(render(Progress,{data:empty}),/Log a workout first, then you can set a goal/);
  assert.doesNotMatch(render(Progress,{data:empty}),/Set a goal/);
  assert.match(render(Progress,{data}),/\+ Set a goal/);
  const goal=(id,exerciseId,extra={})=>({id,exerciseId,kind:'weight',target:120,baseline:105,reward:75,createdAt:'2026-09-19T12:00:00',...extra});
  const withGoals=goals=>({...data,goals});
  const html=render(Progress,{data:withGoals([goal('a','bench-press'),goal('b','squat',{achievedAt:'2026-09-20T12:00:00',achievedWorkoutId:'two'})])});
  assert.match(html,/Remove goal Bench Press: 120 lbs/);
  assert.match(html,/\+75 ELO/);
  assert.match(html,/Now: 105 lbs · started at 105/);
  assert.match(html,/Achieved/);
  assert.match(html,/Squat: 120 lbs/);
  const full=render(Progress,{data:withGoals([goal('a','bench-press'),goal('b','row'),goal('c','squat')])});
  assert.match(full,/You have 3 active goals/);
  assert.doesNotMatch(full,/\+ Set a goal/);
});
test('history shows ELO breakdown, month groups, exercise filter and paging',()=>{
  const withBreakdown={version:3,elo:16,quarantine:[],goals:[],workouts:[
    {id:'a',completedAt:'2026-08-30T12:00:00',earned:10,exercises:[{exerciseId:'squat',sets:[{weightLbs:150,reps:5}]}]},
    {id:'b',completedAt:'2026-09-20T12:00:00',earned:16,breakdown:[{label:'Session',amount:10},{label:'Effort: 1 exercise with 3+ sets',amount:6}],exercises:[{exerciseId:'bench-press',sets:[{weightLbs:100,reps:8}]}]}]};
  const html=render(Workouts,{data:withBreakdown});
  assert.match(html,/How this session earned ELO/);
  assert.match(html,/Effort: 1 exercise with 3\+ sets/);
  assert.match(html,/August 2026/); assert.match(html,/September 2026/);
  assert.match(html,/<option value="squat">Squat<\/option>/);
  assert.match(html,/1 session/);
  assert.doesNotMatch(html,/Show more/);
  const many={...withBreakdown,workouts:Array.from({length:25},(_,i)=>workout('w'+i,new Date(2026,0,1+i,12).toISOString(),100,10))};
  assert.match(render(Workouts,{data:many}),/Show more \(5 older\)/);
});
test('progress charts: hidden when empty, labelled SVG charts and records with history',()=>{
  assert.doesNotMatch(render(Progress,{data:empty}),/ELO over time|Personal records/);
  const html=render(Progress,{data});
  assert.match(html,/<svg[^>]*role="img"[^>]*aria-label="ELO over time: 2 sessions, from 12 to 36"/);
  assert.match(html,/Weekly consistency/);
  assert.match(html,/aria-label="Bench Press heaviest set: 2 sessions, from 100 lbs to 105 lbs"/);
  assert.match(html,/Personal records/);
  assert.match(html,/105 lbs × 8/);
  const one={...data,workouts:[data.workouts[0]]};
  assert.match(render(Progress,{data:one}),/Log at least two sessions to see a trend/);
});

const { WorkoutList } = load('src/app/components.tsx');
test('history explains a missing session bonus, and only then',()=>{
  const withBreakdown = breakdown => [{...workout('x','2026-09-18T12:00:00',100,3),breakdown}];
  const later = renderToStaticMarkup(React.createElement(WorkoutList,{workouts:withBreakdown([{label:'Effort: 1 exercise with 3+ sets',amount:3}]),details:true}));
  assert.match(later,/No session bonus: you already earned today/);
  const first = renderToStaticMarkup(React.createElement(WorkoutList,{workouts:withBreakdown([{label:'Session',amount:10},{label:'Effort: 1 exercise with 3+ sets',amount:3}]),details:true}));
  assert.doesNotMatch(first,/No session bonus/);
  const old = renderToStaticMarkup(React.createElement(WorkoutList,{workouts:[workout('y','2026-09-18T12:00:00',100,3)],details:true}));
  assert.doesNotMatch(old,/No session bonus/);
});

const { default: Privacy } = load('src/app/Privacy.tsx');
const { PRIVACY_HREF, TERMS_HREF } = load('src/app/legalLinks.ts');
test('privacy page says what is stored and where, and how to export or delete; no placeholders',()=>{
  const page = renderToStaticMarkup(React.createElement(Privacy,{signedIn:true}));
  for (const phrase of [/Your email address/,/workouts/,/Supabase/,/Netlify/,/Google/,/No ads/,/No analytics/,/No tracking cookies/,/Export my data/,/Delete account/,/before accounts existed/,/Last updated/]) assert.match(page,phrase);
  assert.doesNotMatch(page,/coming soon|todo|lorem|[\w.]+@[\w-]+\.\w+/i);
});
test('privacy page works signed out and its back link goes to the right place',()=>{
  const out = renderToStaticMarkup(React.createElement(Privacy,{signedIn:false}));
  assert.match(out,/href="#\/home"[^>]*>Back to sign in/);
  assert.match(renderToStaticMarkup(React.createElement(Privacy,{signedIn:true})),/href="#\/settings"[^>]*>Back to Settings/);
});
test('settings links to the privacy page',()=>{
  assert.equal(PRIVACY_HREF,'#/privacy');
  assert.match(render(Settings,{data}),/href="#\/privacy"[^>]*>Privacy/);
});

const { default: Terms } = load('src/app/Terms.tsx');
test('terms page: plain-language, no medical claims, points to privacy, works signed out, no placeholders',()=>{
  const page = renderToStaticMarkup(React.createElement(Terms,{signedIn:false}));
  for (const phrase of [/Terms of service/,/Last updated/,/not a measure of your health/,/does not give medical/,/as is/,/export your data or delete your account/i,/href="#\/privacy"/]) assert.match(page,phrase);
  assert.match(page,/href="#\/home"[^>]*>Back to sign in/);
  assert.match(renderToStaticMarkup(React.createElement(Terms,{signedIn:true})),/href="#\/settings"[^>]*>Back to Settings/);
  assert.doesNotMatch(page,/coming soon|todo|lorem|[\w.]+@[\w-]+\.\w+/i);
});
test('terms and privacy link to each other, and settings links to terms',()=>{
  assert.equal(TERMS_HREF,'#/terms');
  assert.match(renderToStaticMarkup(React.createElement(Privacy,{signedIn:true})),/href="#\/terms"/);
  assert.match(render(Settings,{data}),/href="#\/terms"[^>]*>Terms/);
  assert.match(render(Settings,{data}),/href="#\/privacy"[^>]*>Privacy/);
});

const { default: MuscleMap } = load('src/app/MuscleMap.tsx');
const mapNow = new Date('2026-03-20T12:00:00Z');
const mapWorkout = (id, iso, exercises) => ({ id, completedAt: iso, earned: 10, exercises });
const sets = (n, exerciseId) => ({ exerciseId, sets: Array.from({ length: n }, () => ({ weightLbs: 100, reps: 8 })) });
const mapHtml = workouts => renderToStaticMarkup(React.createElement(MuscleMap, { workouts, now: mapNow }));
test('muscle map: exact set counts per main muscle, relative shading, every muscle listed',()=>{
  const html = mapHtml([mapWorkout('a','2026-03-19T12:00:00Z',[sets(3,'bench-press'),sets(1,'squat')])]);
  for (const muscle of ['Chest','Back','Shoulders','Biceps','Triceps','Forearms','Core','Quads','Hamstrings','Glutes','Calves']) assert.match(html,new RegExp(`<span>${muscle}</span>`));
  assert.match(html,/<span>Chest<\/span><strong>3 sets<\/strong>/);
  assert.match(html,/<span>Quads<\/span><strong>1 set<\/strong>/);
  assert.match(html,/<g class="mm-shape mm-l4" data-muscle="Chest">/);   // the most-trained muscle is brightest
  assert.match(html,/<g class="mm-shape mm-l2" data-muscle="Quads">/);   // 1 of 3 sets
  assert.match(html,/<g class="mm-shape mm-l0" data-muscle="Back">/);    // untrained
  assert.match(html,/aria-pressed="true">7 days/);
  assert.doesNotMatch(html,/No sets logged/);
});
test('muscle map: only the chosen period counts, and an empty period says so',()=>{
  const old = mapHtml([mapWorkout('a','2026-02-01T12:00:00Z',[sets(5,'bench-press')])]);
  assert.match(old,/No sets logged in the last 7 days/);
  assert.match(old,/<span>Chest<\/span><strong>0 sets<\/strong>/);
  assert.match(mapHtml([]),/No sets logged in the last 7 days/);
});
test('progress shows the muscle map only when there is history',()=>{
  assert.doesNotMatch(render(Progress,{data:empty}),/Muscle map/);
  assert.match(render(Progress,{data}),/Muscle map/);
});
