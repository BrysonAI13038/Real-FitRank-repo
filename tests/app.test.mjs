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
const empty = {version:1,workouts:[],elo:0};
const workout = (id,date,weight,earned) => ({id,completedAt:date,earned,exercises:[{exerciseId:'bench-press',sets:[{weightLbs:weight,reps:8}]}]});
const data = {version:1,elo:36,workouts:[workout('one','2026-09-14T12:00:00',100,12),workout('two','2026-09-18T12:00:00',105,24)]};
const render = (component,props) => renderToStaticMarkup(React.createElement(component,props));
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
test('food does not pretend to save; settings has no fake account controls',()=>{
  assert.match(render(Food,{}),/isn’t available yet/);
  assert.doesNotMatch(render(Food,{}),/Save food|Calories/);
  assert.match(render(Settings,{data}),/Export workout data/);
  assert.doesNotMatch(render(Settings,{data}),/Sign in|Password/);
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
  const multi={version:2,elo:16,quarantine:[],workouts:[{id:'m',completedAt:'2026-09-20T12:00:00',earned:16,exercises:[
    {exerciseId:'bench-press',sets:[{weightLbs:100,reps:8}]},
    {exerciseId:'lat-pulldown',sets:[{weightLbs:120,reps:10},{weightLbs:130,reps:8}]}]}]};
  const html=render(Workouts,{data:multi});
  assert.match(html,/Bench Press/);
  assert.match(html,/Lat Pulldown/);
  assert.match(html,/130.*lbs/);
});
