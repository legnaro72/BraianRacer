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

test('viewport geometry preserves sprite proportions on wide and portrait displays',()=>{
  for(const [width,height] of [[1920,800],[390,650],[960,360]]) {
    const e=host(width,height).make();
    assert.ok(Math.abs(e.sceneWidth()/720-width/height)<1e-10);
    e.dragging=true;e.steer({clientX:0});
    for(let i=0;i<60;i++)e.update(1/60);
    assert.ok(e.state.x>=.5-e.cfg.roadWidth/2+36/e.sceneWidth()-1e-8);
  }
});

test('pointer steering moves toward drag target within the road bounds',()=>{
  const e=host().make();e.dragging=true;e.steer({clientX:0});
  for(let i=0;i<60;i++)e.update(1/60);
  assert.ok(e.state.x>.2&&e.state.x<.3);
});

test('perspective projects distant targets smaller and converges at the horizon',()=>{
  const e=host().make(),far=e.project(.2,0),near=e.project(.2,.8);
  assert.ok(near.scale>far.scale && near.y>far.y);
  assert.ok(Math.abs(far.x-e.sceneWidth()/2)<Math.abs(near.x-e.sceneWidth()/2));
  assert.ok(Math.abs(e.project(.5,.8).y-598)<1e-8);
});

test('bouquet hits a heart once and respects the throw cooldown',()=>{
  const e=host().make(),g=e.course.find(g=>g.balloon);
  e.state.x=e.laneX(g.balloonLane);e.state.t=g.spawn+.42/e.cfg.speed;e.state.real=5;
  e.throwBouquet();e.throwBouquet();assert.equal(e.bouquets.length,1);
  for(let i=0;i<40;i++){e.state.real+=.02;e.state.t+=.02;e.updateBouquets(.02);}
  assert.equal(e.state.score,2);assert.deepEqual([...e.state.balloon_hit],[g.id]);
  assert.equal(e.state.pending.filter(p=>p.event_type==='BALLOON_POPPED').length,1);
});
test('progress updates are sent only when the car reaches a new checkpoint',()=>{
  const e=host().make();e.queueProgress();assert.equal(e.state.pending.length,0);
  e.state.progress=1;e.queueProgress();e.queueProgress();
  assert.equal(e.state.pending.filter(p=>p.event_type==='PROGRESS_UPDATE').length,1);
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
test('guestbook renders dedications from every player',()=>{
  const context=vm.createContext({});
  vm.runInContext(uiSource+'\nglobalThis.UI=BrainUI;',context);
  const ui=Object.create(context.UI.prototype);
  ui.data={player:{id:'p1'},dedications:[
    {player_id:'p1',nickname:'Anna',tag:'A1',message:'La mia dedica'},
    {player_id:'p2',nickname:'Luca',tag:'B2',message:'Auguri da Luca'}]};
  const html=ui.dedicationEntries();
  assert.match(html,/La mia dedica/);assert.match(html,/Auguri da Luca/);assert.match(html,/Luca/);
});
const uiSource=fs.readFileSync(path.join(assets,'ui.js'),'utf8').replace('export default function(component)', 'function renderer(component)');
function uiHost(){
  let now=100000;
  class ClockDate extends Date {static now(){return now;}}
  const context=vm.createContext({Date:ClockDate,Math,Number,makeId:()=>String(now++),setInterval:()=>1,clearInterval(){}});
  vm.runInContext(uiSource+'\nglobalThis.UI=BrainUI;',context);
  const ui=Object.create(context.UI.prototype), timer={dataset:{end:115},textContent:''};
  const bar={dataset:{end:115,duration:15},style:{},classList:{toggle(){}}};
  const answers=Array.from({length:4},(_,choice)=>({disabled:false,dataset:{action:'ANSWER',choice:String(choice)},
    classes:new Set(),classList:{add(name){answers[choice].classes.add(name);}}}));
  const status={className:'quiz-status',innerHTML:''};
  ui.data={booted:true,player:{id:'p'},game:{id:'g',level:1,qindex:0,screen_phase:'QUIZ',answered:false,
    question:{answers:['Uno','Due','Tre','Quattro'],correct_index:1}},command_acks:[]};
  ui.pending=[];ui.audio={unlock(){},play(){}};ui.component={setStateValue(){}};ui.lastPacket=now;
  ui.root={querySelector:s=>s==='.quiz-status'?status:null,
    querySelectorAll:s=>s==='[data-countdown]'?[timer]:s==='[data-timer-bar]'?[bar]:s==='.answer'?answers:[]};
  return {ui,timer,bar,answer:answers[0],answers,status,setTime:t=>now=t};
}
test('answer locks immediately, freezes timer, and sends only once before acknowledgement',()=>{
  const {ui,timer,bar,answer,setTime}=uiHost();
  ui.click({target:{closest:()=>answer}});
  assert.equal(answer.disabled,true);assert.equal(ui.pending.length,1);
  ui.tick();const frozen=timer.textContent, width=bar.style.width;
  setTime(105000);ui.tick();
  assert.equal(timer.textContent,frozen);assert.equal(bar.style.width,width);
  answer.disabled=false;ui.click({target:{closest:()=>answer}}); // Simulated stale rerender.
  assert.equal(ui.pending.length,1);
  ui.data.game.screen_phase='REVEAL';ui.tick();assert.notEqual(timer.textContent,frozen);
});
test('answer feedback paints the correct choice green and a wrong choice red immediately',()=>{
  const {ui,answers,status}=uiHost();
  ui.click({target:{closest:()=>answers[0]}});
  assert.equal(answers[0].classes.has('wrong'),true);
  assert.equal(answers[1].classes.has('correct'),true);
  assert.match(status.innerHTML,/Risposta sbagliata/);
  assert.match(status.innerHTML,/Due/);
});
test('rapid play/replay clicks produce a single start command',()=>{
  const {ui}=uiHost();ui.send('REPLAY');ui.send('REPLAY');ui.send('START_SINGLE');
  assert.equal(ui.pending.length,1);assert.equal(ui.pending[0].action,'REPLAY');
});
test('play paints the driving screen before the cloud acknowledges the command',()=>{
  const {ui}=uiHost();let mounted='',sent=null;
  ui.data={...ui.data,game:null,start_template:{seed:42,difficulty:{groups:20},quiz_preview:[{id:'q1'}]}};
  ui.mountView=view=>{mounted=view;};ui.send=(action,payload)=>{sent={action,payload};};
  const play={disabled:false,dataset:{action:'START_SINGLE'}};
  ui.click({target:{closest:()=>play}});
  assert.equal(mounted,'DRIVING');assert.equal(ui.data.game.seed,42);
  assert.equal(ui.data.game.quiz_preview[0].id,'q1');
  assert.equal(sent.action,'START_SINGLE');assert.equal(sent.payload.seed,42);
});
test('next level keeps preloaded quiz questions and abort reacts locally',()=>{
  const {ui}=uiHost();let mounted='',sent=[];
  ui.data={...ui.data,game:{...ui.data.game,mode:'single',screen_phase:'LEVEL_SUMMARY',phase:'LEVEL_SUMMARY',
    level:1,lives:3,score:5,progress:20,next_difficulty:{groups:22},next_quiz_preview:[{id:'q2'}]}};
  ui.mountView=view=>{mounted=view;};ui.send=action=>{sent.push(action);};
  ui.click({target:{closest:()=>({disabled:false,dataset:{action:'NEXT_LEVEL'}})}});
  assert.equal(mounted,'DRIVING');assert.equal(ui.data.game.level,2);
  assert.equal(ui.data.game.quiz_preview[0].id,'q2');
  ui.root.querySelector=()=>({remove(){}});
  ui.engine={destroy(){this.destroyed=true;}};
  ui.click({target:{closest:()=>({disabled:false,dataset:{action:'ABORT'}})}});
  assert.equal(mounted,'GAME_OVER');assert.equal(ui.data.game.screen_phase,'GAME_OVER');
  assert.deepEqual(sent,['NEXT_LEVEL','ABORT']);
});
test('top navigation paints the selected page before the cloud acknowledges it',()=>{
  const {ui}=uiHost();let mounted='',sent=null;
  ui.data={...ui.data,game:null,room:null,page:'HOME'};
  ui.mountView=view=>{mounted=view;};ui.send=(action,payload)=>{sent={action,payload};};
  const nav={disabled:false,dataset:{action:'NAV',page:'HELP'}};
  ui.click({target:{closest:()=>nav}});
  assert.equal(ui.data.page,'HELP');assert.equal(mounted,'HELP');
  assert.equal(sent.action,'NAV');assert.equal(sent.payload.page,'HELP');
});
test('top navigation remains usable during a game and resumes without a server round trip',()=>{
  const {ui}=uiHost();let mounted='';
  ui.data={...ui.data,room:null,page:'HOME'};ui.mountView=view=>{mounted=view;};
  const nav={disabled:false,dataset:{action:'NAV',page:'HELP'}};
  ui.click({target:{closest:()=>nav}});
  assert.equal(ui.menuOverlay,'HELP');assert.equal(mounted,'HELP');
  const resume={disabled:false,dataset:{action:'RESUME'}};
  ui.click({target:{closest:()=>resume}});
  assert.equal(ui.menuOverlay,null);assert.equal(mounted,'QUIZ');
});
test('Flipbook card opens the real album and shows the approved photo count',()=>{
  const {ui}=uiHost();let sent=null;
  ui.data={...ui.data,game:null,room:null,page:'PHOTOS',photo_summary:{approved_count:17}};
  ui.send=action=>{sent=action;};
  const html=ui.photos();
  assert.match(html,/L'album di Irene e Daniele · 17 foto/);
  const open={disabled:false,textContent:'',dataset:{action:'OPEN_FLIPBOOK'}};
  ui.click({target:{closest:()=>open}});
  assert.equal(open.disabled,true);assert.equal(open.textContent,'Apro il Flipbook…');
  assert.equal(sent,'OPEN_FLIPBOOK');
});
test('manual is always linked from desktop and mobile navigation',()=>{
  const {ui}=uiHost();ui.data={...ui.data,player:null,game:null,room:null,page:'WELCOME'};
  ui.audio={musicMuted:false,effectsMuted:false};
  const html=ui.header();
  assert.equal((html.match(/app\/static\/manuale-brain-racer\.pdf/g)||[]).length,2);
  assert.match(html,/target="_blank"/);assert.match(html,/Manuale ↗/);
});
test('new game id never restores a finished engine session',()=>{
  const h=host(),old=h.make();old.state.done=true;old.state.score=99;old.state.lives=0;old.persist();
  h.data.id='fresh';const next=h.make();
  assert.equal(next.state.done,false);assert.equal(next.state.score,0);assert.equal(next.state.lives,3);
  assert.equal(next.state.t,0);assert.equal(next.state.pending.length,0);
});

test('independent multiplayer follows own phase and advances without the guest',()=>{
  const {ui}=uiHost();
  ui.data.room={id:'room',independent:true,phase:'DRIVING',players:[]};
  ui.data.game={...ui.data.game,mode:'multi',independent:true,phase:'LEVEL_SUMMARY',screen_phase:'LEVEL_SUMMARY',level:2,next_quiz_preview:[{id:'q3'}]};
  assert.equal(ui.gameView(),'LEVEL_SUMMARY');
  let mounted;
  ui.mountView=view=>{mounted=view;};
  ui.click({target:{closest:()=>({dataset:{action:'NEXT_LEVEL'}})}});
  assert.equal(mounted,'DRIVING');
  assert.equal(ui.data.game.level,3);
  assert.equal(ui.pending[0].game_id,'g');
  ui.pending=[];ui.data.game.level=5;
  ui.click({target:{closest:()=>({dataset:{action:'NEXT_LEVEL'}})}});
  assert.equal(mounted,'PIT');
  assert.equal(ui.data.game.phase,'CHALLENGE_DONE');
  assert.equal(ui.pending[0].game_id,'g');
});

test('delayed cloud snapshot cannot replace the local answer feedback',()=>{
  const {ui}=uiHost();
  ui.localQuizActive=true;
  ui.data.game={...ui.data.game,screen_phase:'REVEAL',phase:'REVEAL',answered:true,score:7,answer:{correct:true}};
  const previous=ui.data.game;
  ui.mountView=()=>{};
  ui.update({data:{...ui.data,now:100,game:{...previous,screen_phase:'QUIZ',phase:'QUIZ',answered:false,score:6}}});
  assert.equal(ui.data.game,previous);
  assert.equal(ui.data.game.score,7);
  assert.equal(ui.view(),'REVEAL');
});

test('photo count changes repaint the album entry without navigation',()=>{
  const {ui}=uiHost();let mounts=0;
  ui.data={...ui.data,game:null,page:'PHOTOS',photo_summary:{approved_count:1}};
  ui.mountView=()=>{mounts++;};
  ui.update({data:{...ui.data,now:100}});
  ui.update({data:{...ui.data,now:101,photo_summary:{approved_count:2}}});
  assert.equal(mounts,2);
});

test('garage starts single player and multiplayer is visibly disabled',()=>{
  const {ui}=uiHost();
  ui.data={...ui.data,player:{id:'p',nickname:'Pilota',tag:'1234'},game:null,room:null,page:'HOME',stats:{best:0,level:0,games:0},leaderboard:[]};
  const home=ui.home(false),play=ui.help();
  assert.match(home,/data-action="START_SINGLE"/);
  assert.match(play,/mode-card multi" disabled/);
  assert.match(play,/IN PROGRESS/);
  assert.doesNotMatch(play,/data-page="MULTIPLAYER"/);
});

test('cloud clock corrections do not change the time available in a local quiz',()=>{
  const {ui,timer,setTime}=uiHost();
  ui.localQuizActive=true;ui.quizClockOffset=0;
  ui.data.game.deadline=115;
  ui.serverOffset=-8000;ui.tick();
  assert.equal(timer.textContent,'15s');
  setTime(102000);ui.serverOffset=3000;ui.tick();
  assert.equal(timer.textContent,'13s');
});

test('touching the track fires immediately, keeps steering and respects cooldown/pause',()=>{
  const e=host().make();e.state.started=true;
  const touch={preventDefault(){},pointerType:'touch',pointerId:1,clientX:250};
  e.down(touch);assert.equal(e.bouquets.length,1);assert.equal(e.dragging,true);
  e.down(touch);assert.equal(e.bouquets.length,1);
  e.up();assert.equal(e.dragging,false);
  e.state.real+=1;e.paused=true;e.down(touch);assert.equal(e.bouquets.length,1);
  e.paused=false;e.down(touch);assert.equal(e.bouquets.length,2);
  e.state.real+=1;e.state.done=true;e.down(touch);assert.equal(e.bouquets.length,2);
});

test('background music and sound effects have independent toggles',async()=>{
  const storage=new Map(),listeners=new Map(),tracks=[];
  class AudioMock {
    constructor(src){this.src=src;this.paused=true;this.plays=0;tracks.push(this);}
    setAttribute(){} play(){this.paused=false;this.plays++;return Promise.resolve();}
    pause(){this.paused=true;} remove(){this.removed=true;}
  }
  const doc={hidden:false,body:{append(){}},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n)};
  const context=vm.createContext({window:{Audio:AudioMock},document:doc,
    localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}});
  vm.runInContext(fs.readFileSync(path.join(assets,'game.js'),'utf8')+'\nglobalThis.Sound=ArcadeAudio;',context);
  const sound=new context.Sound();sound.unlock();assert.equal(tracks.length,0);
  assert.equal(sound.effectsMuted,false);
  sound.toggleMusic();await Promise.resolve();await Promise.resolve();
  assert.equal(tracks.length,1);assert.equal(tracks[0].src,'app/static/main.mp3');
  assert.equal(tracks[0].paused,false);assert.equal(tracks[0].loop,true);
  sound.unlock();assert.equal(tracks[0].plays,1);
  sound.toggleEffects();assert.equal(sound.effectsMuted,true);assert.equal(tracks[0].paused,false);
  assert.equal(storage.get('br:effects-muted'),'true');
  sound.toggleMusic();assert.equal(tracks[0].paused,true);assert.equal(storage.get('br:music-muted'),'true');
  sound.toggleMusic();await Promise.resolve();await Promise.resolve();assert.equal(tracks.length,1);
  doc.hidden=true;listeners.get('visibilitychange')();assert.equal(tracks[0].paused,true);
  doc.hidden=false;listeners.get('visibilitychange')();assert.equal(tracks[0].paused,false);
  sound.destroy();assert.equal(tracks[0].paused,true);assert.equal(tracks[0].removed,true);assert.equal(listeners.size,0);
});
