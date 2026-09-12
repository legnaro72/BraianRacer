// Engine unit tests execute the production JavaScript, with a minimal canvas host.
// No browser, network, or additional JavaScript dependencies are required.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assets = path.join(__dirname,'..','assets');

function host(width=480,height=720) {
  const storage=new Map();
  const context=vm.createContext({console,Math,Date,JSON,Set,Map,Number,performance,
    window:{devicePixelRatio:1,addEventListener(){},removeEventListener(){}},
    document:{hidden:false},navigator:{},crypto:require('node:crypto').webcrypto,
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},
    ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:()=>1,cancelAnimationFrame(){}});
  vm.runInContext(fs.readFileSync(path.join(assets,'course.js'),'utf8')+'\n'+
    fs.readFileSync(path.join(assets,'game.js'),'utf8')+'\nglobalThis.Engine=DrivingEngine;',context);
  const canvas={getContext:()=>({}),getBoundingClientRect:()=>({width,height,left:0,top:0}),
    addEventListener(){},removeEventListener(){},focus(){},setPointerCapture(){}};
  const cfg={groups:20,speed:.34,interval:1.85,roadWidth:.84,moving:false,double:false};
  const data={id:'test',seed:87461,level:1,mode:'single',progress:0,lives:3,score:0,
    shield:false,hit:[],collected:[],difficulty:cfg,serverNow:Date.now()/1000,start_at:0};
  const make=()=>new context.Engine(canvas,data,()=>{}, {play(){},unlock(){}});
  return {make,data,storage,canvas};
}

test('keyboard steering is independent of rendered resolution and frame rate',()=>{
  const a=host(300,450).make(),b=host(900,1350).make();
  a.keys.add('arrowright');b.keys.add('d');
  for(let i=0;i<12;i++)a.update(1/60);
  for(let i=0;i<6;i++)b.update(1/30);
  assert.ok(Math.abs(a.state.x-b.state.x)<1e-10);
  assert.ok(a.state.x>.5);
});

test('pointer steering moves toward drag target within the road bounds',()=>{
  const e=host().make();e.dragging=true;e.steer({clientX:0});
  for(let i=0;i<60;i++)e.update(1/60);
  assert.ok(e.state.x>=.1249&&e.state.x<.2);
});

test('collision deducts one life, cannot repeat, and shields absorb one hit',()=>{
  const e=host().make(),g=e.course[0];
  e.state.real=10;e.hit(g);e.hit(g);
  assert.equal(e.state.lives,2);
  e.state.real=12;e.state.shield=true;e.hit(e.course[1]);
  assert.equal(e.state.lives,2);assert.equal(e.state.shield,false);
  e.state.real=12.5;e.hit(e.course[2]);assert.equal(e.state.lives,2);
  e.state.real=14;e.hit(e.course[2]);assert.equal(e.state.lives,1);
});

test('star, slow time, finish and elimination generate meaningful events',()=>{
  const e=host().make();e.collect(e.course[1]);
  assert.equal(e.state.score,1);
  e.collect(e.course.find(g=>g.bonus==='slow'));const before=e.state.t;e.update(1/60);
  assert.ok(e.state.t-before<1/60);
  e.state.t=e.course.at(-1).spawn+1.3/e.cfg.speed;e.update(.01);
  assert.equal(e.state.progress,20);assert.equal(e.state.done,true);assert.ok(e.pendingFinish);
  const crash=host().make();
  for(let i=0;i<3;i++){crash.state.real=i*2;crash.hit(crash.course[i]);}
  assert.equal(crash.state.lives,0);assert.equal(crash.state.done,true);
});

test('refresh restores simulation and undelivered events; acknowledgements clear only delivered events',()=>{
  const h=host(),e=h.make();e.state.t=7;e.state.x=.3;e.event('BONUS_COLLECTED',{group:1});e.destroy();
  const restored=h.make();assert.equal(restored.state.t,7);assert.equal(restored.state.x,.3);
  assert.equal(restored.state.pending.length,1);
  const id=restored.state.pending[0].event_id;
  restored.sync({...h.data,acks:[id],score:1});
  assert.equal(restored.state.pending.length,0);assert.equal(restored.state.score,1);
});

test('a reload during finish celebration still sends the completion event',()=>{
  const h=host(),e=h.make();e.state.done=true;e.persist();
  assert.ok(h.make().pendingFinish);
});

test('accelerator increases travel, stays bounded, and eases back on release',()=>{
  const slow=host().make(),fast=host().make();
  fast.keys.add('arrowup');
  for(let i=0;i<60;i++){slow.update(1/60);fast.update(1/60);}
  assert.ok(fast.state.t>slow.state.t*1.4);
  assert.ok(fast.state.acceleration<=1.6);
  fast.keys.clear();
  for(let i=0;i<120;i++)fast.update(1/60);
  assert.ok(Math.abs(fast.state.acceleration-1)<.001);
});

test('dedication markup escapes HTML supplied by a player',()=>{
  const context=vm.createContext({});
  const ui=fs.readFileSync(path.join(assets,'ui.js'),'utf8').replace('export default function(component)', 'function renderer(component)');
  vm.runInContext(ui+'\nglobalThis.escapeText=esc;',context);
  assert.equal(context.escapeText('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
