const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const levelDifficulty = level => ({groups:Math.min(20+(level-1)*2,36),speed:Math.min(.34+(level-1)*.018,.55),
  interval:Math.max(1.2,1.85-(level-1)*.045),roadWidth:Math.max(.66,.84-Math.max(0,level-3)*.018),
  moving:level>=3,double:level>=5,deadline:85,maxAcceleration:1.6});
const icons = {
  flag:'<svg viewBox="0 0 24 24" fill="none"><path d="M5 21V4m0 0c5-5 9 5 15 0v11c-6 5-10-5-15 0" stroke="currentColor" stroke-width="1.8"/><path d="M6 5h4v4H6zm4 4h4v4h-4zm4-4h4v4h-4z" fill="currentColor"/></svg>',
  arrow:'<svg viewBox="0 0 24 24" fill="none"><path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  car:'<svg viewBox="0 0 32 32" fill="none"><path d="m7 13 3-7h12l3 7M5 23V13h22v10H5Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="M8 23v4m16-4v4M9 17h3m8 0h3" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  people:'<svg viewBox="0 0 32 32" fill="none"><circle cx="12" cy="10" r="4" stroke="currentColor" stroke-width="2"/><path d="M4 26v-3a8 8 0 0 1 16 0v3m1-19a4 4 0 0 1 0 8m3 4a6 6 0 0 1 4 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  bolt:'<svg viewBox="0 0 24 24" fill="none"><path d="m14 2-9 12h7l-2 8 9-12h-7l2-8Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  trophy:'<svg viewBox="0 0 24 24" fill="none"><path d="M7 3h10v6a5 5 0 0 1-10 0V3Zm10 2h4v3a4 4 0 0 1-4 4M7 5H3v3a4 4 0 0 0 4 4m5 2v6m-4 1h8" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>'
};
function button(label, action, cls='primary', extra='') {
  return `<button class="btn ${cls}" data-action="${action}" ${extra}>${label}</button>`;
}
function coupleArt(context='page', message='Che bello avervi qui con noi!', pose='hug') {
  return `<aside class="couple-hosts couple-hosts-${context}" aria-label="Gli sposi vi accompagnano">
    <div class="couple-portrait pose-${pose}" role="img" aria-label="Irene e Daniele in versione cartoon: ${pose==='dance'?'un ballo':pose==='jump'?'un salto di gioia':'un abbraccio'}"></div>
    <div class="couple-greeting"><strong>Irene <span>♥</span> Daniele</strong><p>${esc(message)}</p></div>
  </aside>`;
}
function heroArt() {return coupleArt('hero','La nostra festa è più bella con voi.','dance');}

class BrainUI {
  constructor(parent, component) {
    this.parent=parent;this.root=parent.querySelector('#brain-app');this.component=component;
    this.pending=[];this.audio=new ArcadeAudio();this.signature='';this.engine=null;
    this.identitySent=false;this.lastPacket=0;this.soundPhase='';this.error='';
    this.root.addEventListener('click', e=>this.click(e));
    this.root.addEventListener('submit', e=>this.submit(e));
    this.root.addEventListener('pointerdown',e=>{
      const control=e.target.closest('[data-steer]');
      if(control&&this.engine){e.preventDefault();this.audio.unlock();control.setPointerCapture(e.pointerId);
        this.engine.keys.add(control.dataset.steer);}
    });
    for(const name of ['pointerup','pointercancel','lostpointercapture']) this.root.addEventListener(name,e=>{
      const control=e.target.closest('[data-steer]');if(control&&this.engine)this.engine.keys.delete(control.dataset.steer);
    });
    this.interval=setInterval(()=>this.tick(),100);
  }
  send(action, payload={}) {
    if(['START_SINGLE','REPLAY','REGISTER','NEXT_LEVEL'].includes(action)) {
      if(this.pending.some(p=>['START_SINGLE','REPLAY','REGISTER','NEXT_LEVEL'].includes(p.action)))return;
      this.root.querySelectorAll('[data-action="START_SINGLE"],[data-action="REPLAY"],[data-action="NEXT_LEVEL"],.register button').forEach(b=>{
        b.disabled=true;b.textContent='Partenza…';b.setAttribute('aria-busy','true');
      });
    }
    const command={id:makeId(),action,...payload};this.pending.push(command);this.flush();
  }
  flush() {this.lastPacket=Date.now();this.component.setStateValue('packet',[...this.pending]);}
  update(component) {
    const previous=this.data;
    this.component=component;this.data={...component.data,
      stats:component.data.stats||this.data?.stats||{best:0},
      leaderboard:component.data.leaderboard||this.data?.leaderboard||[],
      dedications:component.data.dedications||this.data?.dedications||[],
      photos:component.data.photos||this.data?.photos||[]};
    const data=this.data;
    this.pending=this.pending.filter(p=>!data.command_acks.includes(p.id));
    if(this.optimisticPage){
      if(component.data.page===this.optimisticPage)this.optimisticPage=null;
      else this.data.page=this.optimisticPage;
    }
    if(this.optimisticNextLevel){
      if((component.data.game?.level||0)>=this.optimisticNextLevel)this.optimisticNextLevel=null;
      else if(previous?.game?.level===this.optimisticNextLevel){
        this.data.game=previous.game;
        if(!this.pending.some(p=>p.action==='NEXT_LEVEL')&&Date.now()-(this.lastNextRetry||0)>900){
          this.lastNextRetry=Date.now();queueMicrotask(()=>this.send('NEXT_LEVEL'));
        }
      }
    }
    if(this.optimisticStart){
      if(component.data.game?.seed===this.optimisticStart)this.optimisticStart=null;
      else if(previous?.game?.seed===this.optimisticStart)this.data.game=previous.game;
    }
    if(this.localQuizActive){
      if(component.data.game?.screen_phase==='LEVEL_SUMMARY')this.localQuizActive=false;
      else if(['QUIZ','LEVEL_SUMMARY'].includes(previous?.game?.screen_phase))this.data.game=previous.game;
    }
    this.serverOffset=(data.now || Date.now()/1000)*1000-Date.now();
    if(!data.booted&&!this.identitySent){this.identitySent=true;
      queueMicrotask(()=>this.send('IDENTIFY',{token:safeStorage.get('br:identity')}));}
    if(data.identity_token&&this.savedToken!==data.identity_token){
      this.savedToken=data.identity_token;
      if(!safeStorage.set('br:identity',data.identity_token))this.storageWarning=true;
      queueMicrotask(()=>this.send('TOKEN_SAVED'));
    }
    const view=this.view();
    const game=data.game,room=data.room;
    const questionKey=game?`${game.id}:${game.level}:${game.qindex}`:'';
    if(this.answerLock?.key!==questionKey || !['QUIZ','REVEAL'].includes(view))this.answerLock=null;
    if(data.message && data.message!==this.handledError && !this.pending.length){this.signature='';this.answerLock=null;}
    this.handledError=data.message;
    const signature=[view,view==='DRIVING'?game?.seed:game?.id,game?.level,game?.qindex,
      ['QUIZ','REVEAL'].includes(view)?game?.answered:'',
      view==='LOBBY'?JSON.stringify(room?.players):'',data.player?.id||''].join(':');
    if(signature!==this.signature){
      this.signature=signature;
      this.mountView(view);
    }else if(this.engine)this.engine.sync({...game,serverNow:data.now});
    if(this.root.querySelector('[data-opponents]'))this.root.querySelector('[data-opponents]').innerHTML=this.opponents();
    const guestbook=this.root.querySelector('[data-guestbook]');
    if(guestbook)guestbook.innerHTML=this.dedicationEntries();
    if(this.dedicationSaving && !this.pending.some(p=>p.action==='DEDICATE')) {
      const feedback=this.root.querySelector('[data-dedication-feedback]');
      if(feedback)feedback.textContent=data.message?'': '♥ La tua dedica è stata salvata. Grazie!';
      this.dedicationSaving=false;
    }
    const toast=this.root.querySelector('.toast');
    if(toast){toast.hidden=!data.message;toast.textContent=data.message||'';}
    if(view==='REVEAL'&&this.soundPhase!==signature){this.soundPhase=signature;this.audio.play(game.answer?.correct?'correct':'wrong');}
    if(view==='MATCH_RESULTS'&&this.soundPhase!==signature){this.soundPhase=signature;this.audio.play('victory');}
    this.tick();
  }
  mountView(view) {
    const data=this.data,game=data.game;
    if(this.engine){this.engine.destroy();this.engine=null;}
    this.root.innerHTML=this.header()+`<main class="screen screen-${view.toLowerCase()}">${this.render(view)}</main>`+this.footer()+
      '<div class="toast" role="alert" hidden></div>';
    this.root.scrollIntoView({block:'start',behavior:'instant'});
    if(view==='DRIVING'){
      this.engine=new DrivingEngine(this.root.querySelector('canvas'),{...game,serverNow:data.now},events=>{
        const current=this.data.game;
        const completed=events.some(event=>event.event_type==='LEVEL_COMPLETED');
        if(completed){
          this.send('EVENTS',{game_id:current.id,level:current.level,events});
          queueMicrotask(()=>this.openLocalQuiz(current));
        }else if(!this.pending.some(p=>p.action==='EVENTS'))
          this.send('EVENTS',{game_id:current.id,level:current.level,events});
      },this.audio);
    }
  }
  notify(message) {
    const toast=this.root.querySelector('.toast');
    if(!toast)return;
    toast.textContent=message;
    toast.hidden=false;
    clearTimeout(this.toastTimer);
    this.toastTimer=setTimeout(()=>{toast.hidden=true;},4200);
  }
  openLocalQuiz(game) {
    if(this.localQuizActive||!game?.quiz_preview?.length)return;
    const now=(Date.now()+(this.serverOffset||0))/1000;
    this.localQuizActive=game.mode==='single';
    this.data.game={...game,phase:'QUIZ',screen_phase:'QUIZ',qindex:0,
      question:game.quiz_preview[0],deadline:now+15,answered:false,eligible:true};
    this.signature='';this.mountView('QUIZ');
  }
  advanceLocalQuiz(choice) {
    const g=this.data.game,correct=choice===g.question.correct_index,delta=correct?1:-2;
    this.data.game={...g,score:g.score+delta,correct:g.correct+(correct?1:0),wrong:g.wrong+(correct?0:1),
      round_correct:g.round_correct+(correct?1:0),round_wrong:g.round_wrong+(correct?0:1),
      answered:true,answer:{choice,correct,delta},screen_phase:'REVEAL',phase:'REVEAL',deadline:null};
    const level=g.level,index=g.qindex;
    setTimeout(()=>{
      const current=this.data.game;
      if(!this.localQuizActive||current.level!==level||current.qindex!==index)return;
      this.answerLock=null;
      if(index+1<current.quiz_preview.length){
        const now=(Date.now()+(this.serverOffset||0))/1000;
        this.data.game={...current,phase:'QUIZ',screen_phase:'QUIZ',qindex:index+1,
          question:current.quiz_preview[index+1],deadline:now+15,answered:false,answer:null};
        this.signature='';this.mountView('QUIZ');
      }else{
        this.data.game={...current,phase:'LEVEL_SUMMARY',screen_phase:'LEVEL_SUMMARY',answered:false,answer:null};
        this.signature='';this.mountView('LEVEL_SUMMARY');
      }
    },700);
  }
  startLocalGame(template, action) {
    const now=(Date.now()+(this.serverOffset||0))/1000;
    this.data.game={id:`pending-${template.seed}`,mode:'single',status:'active',phase:'DRIVING',screen_phase:'DRIVING',
      level:1,seed:template.seed,score:0,lives:3,stars:0,hearts:0,correct:0,wrong:0,progress:0,
      collected:[],hit:[],balloon_hit:[],shield:false,start_at:now,deadline:null,acks:[],
      difficulty:template.difficulty,round_score:0,round_stars:0,round_correct:0,round_wrong:0,
      round_hearts:0,qindex:0,answered:false,quiz_preview:template.quiz_preview||[]};
    this.optimisticStart=template.seed;
    this.signature=['DRIVING',template.seed,1,0,'','',this.data.player?.id||''].join(':');
    this.mountView('DRIVING');this.send(action,{seed:template.seed});
  }
  view() {
    const d=this.data,g=d.game,r=d.room;
    if(!d.booted)return 'LOADING';
    if(!d.player)return 'WELCOME';
    if(this.menuOverlay)return this.menuOverlay;
    return this.gameView();
  }
  gameView() {
    const d=this.data,g=d.game,r=d.room;
    if(r){
      if(r.phase==='CLOSED')return 'CLOSED';
      if(r.phase==='LOBBY')return 'LOBBY';
      if(['COUNTDOWN','DRIVING'].includes(r.phase))return ['QUIZ','REVEAL'].includes(g?.screen_phase)?g.screen_phase:g?.phase==='DRIVING'?'DRIVING':'PIT';
      if(r.phase==='QUIZ')return g?.screen_phase||'PIT';
      return r.phase;
    }
    return g?.screen_phase||d.page;
  }
  header() {
    const d=this.data,active=d.game||d.room;
    return `<header class="nav"><button class="brand" data-action="NAV" data-page="HOME">
      <span class="brand-symbol">${icons.flag}</span><span>BRAIN<span class="brand-light">RACER</span><small>GUIDA. PENSA. VINCI.</small></span></button>
      <nav aria-label="Navigazione principale">${[['HOME','Garage'],['LEADERBOARD','Classifica'],['HELP','Come si gioca'],['DEDICATIONS','Dediche ♥'],['PHOTOS','Foto ♥'],['SUPERVISOR','🔐 Area Sposi']].map(([page,label])=>
        `<button data-action="NAV" data-page="${page}" class="nav-link ${['HOME','LEADERBOARD','HELP'].includes(page)?'nav-main':''} ${['DEDICATIONS','PHOTOS'].includes(page)?'nav-highlight':''} ${page==='SUPERVISOR'?'spouse-area-link':''} ${(this.menuOverlay||d.page)===page?'selected':''}" ${!d.player?'disabled':''}>${label}</button>`).join('')}<a class="nav-link manual-link" href="app/static/manuale-brain-racer.pdf" target="_blank" rel="noopener">Manuale ↗</a></nav>
      <div class="nav-right"><div class="audio-controls" aria-label="Controlli audio"><button class="sound" data-action="MUSIC" title="Musica di sottofondo" aria-label="${this.audio.musicMuted?'Attiva musica di sottofondo':'Disattiva musica di sottofondo'}"><span>${this.audio.musicMuted?'♪̸':'♫'}</span><small>Musica</small></button><button class="sound" data-action="EFFECTS" title="Effetti sonori" aria-label="${this.audio.effectsMuted?'Attiva effetti sonori':'Disattiva effetti sonori'}"><span>${this.audio.effectsMuted?'🔇':'🔊'}</span><small>Effetti</small></button></div>
      ${d.player?`<button class="profile" data-action="NAV" data-page="STATS"><span class="avatar">${esc(d.player.nickname.slice(0,2).toUpperCase())}</span><span>${esc(d.player.nickname)}<small>#${esc(d.player.tag)}</small></span></button>`:
      '<span class="edition">ARCADE / VOL. 01</span>'}</div></header><nav class="mobile-nav" aria-label="Menu smartphone">${d.player?[['HOME','Garage'],['LEADERBOARD','Classifica'],['HELP','Come si gioca'],['DEDICATIONS','Dediche ♥'],['PHOTOS','Foto ♥'],['SUPERVISOR','🔐 Area Sposi']].map(([page,label])=>`<button data-action="NAV" data-page="${page}" class="${['HOME','LEADERBOARD','HELP'].includes(page)?'nav-main':''} ${['DEDICATIONS','PHOTOS'].includes(page)?'nav-highlight':''} ${page==='SUPERVISOR'?'spouse-area-link':''} ${(this.menuOverlay||d.page)===page?'selected':''}">${label}</button>`).join(''):''}<a class="manual-link" href="app/static/manuale-brain-racer.pdf" target="_blank" rel="noopener">Manuale ↗</a></nav>${active&&this.menuOverlay?`<div class="active-game-banner"><span>Partita in corso</span>${button('Riprendi subito','RESUME','primary')}</div>`:''}`;
  }
  footer() {return `<footer><span>${icons.flag} BRAIN RACER <i>·</i> Riflessi veloci. Mente accesa.</span><span>Fatto per giocare. Ancora una volta. <span class="tiny-dot"></span></span></footer>`;}
  intro(eyebrow,title,description='') {return `<div class="page-intro with-couple"><div class="intro-copy"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>${coupleArt('page')}</div>`;}
  render(view) {
    const d=this.data,g=d.game,r=d.room;
    if(view==='LOADING')return `<div class="center-state"><div class="loader"></div><h2>Prepariamo la griglia.</h2><p>Il tuo prossimo record parte da qui.</p></div>`;
    if(view==='HOME'||view==='WELCOME')return this.home(view==='WELCOME');
    if(view==='LEADERBOARD')return this.intro('LA GRIGLIA DEI MIGLIORI','Ogni punto conta.','I migliori 10 piloti. Un solo record per giocatore.')+this.leaderboard()+this.back();
    if(view==='STATS')return this.stats();
    if(view==='DEDICATIONS')return this.dedications();
    if(view==='PHOTOS')return this.photos();
    if(view==='SUPERVISOR')return this.intro('AREA RISERVATA','Irene e Daniele','Gestite in privato le foto e l’ordine del vostro Flipbook.')+this.back();
    if(view==='HELP')return this.help();
    if(view==='MULTIPLAYER')return this.intro('STESSA STRADA. STESSA SFIDA.','La gara è più bella insieme.','Da 2 a 6 piloti, cinque livelli. Invita i tuoi amici con il codice stanza.')+
      `<div class="two-col room-options"><section class="panel"><span class="feature-icon lime">${icons.flag}</span><h2>La tua griglia di partenza.</h2><p>Crea una stanza privata e condividi il codice. Quando tutti sono pronti, si parte.</p>${button('Crea stanza '+icons.arrow,'CREATE_ROOM')}</section>
      <section class="panel"><span class="feature-icon lavender">${icons.people}</span><h2>Ti stanno aspettando?</h2><p>Inserisci il codice di 6 caratteri ricevuto dai tuoi amici.</p><form data-form="join"><label for="room-code">Codice stanza</label><div class="input-row"><input id="room-code" name="code" placeholder="ES. RACE42" minlength="6" maxlength="6" required autocomplete="off" autocapitalize="characters"><button class="btn secondary" type="submit">Entra ${icons.arrow}</button></div></form></section></div>`+this.back();
    if(view==='LOBBY')return this.lobby();
    if(view==='DRIVING')return this.driving();
    if(view==='QUIZ'||view==='REVEAL')return this.quiz(view==='REVEAL');
    if(view==='LEVEL_SUMMARY')return this.summary();
    if(view==='GAME_OVER')return this.gameOver();
    if(view==='PIT')return this.pit();
    if(view==='ROUND_RESULTS'||view==='MATCH_RESULTS')return this.results(view==='MATCH_RESULTS');
    return this.intro('STANZA CHIUSA','Ci vediamo sulla prossima griglia.')+button('Torna al garage','HOME');
  }
  home(welcome) {
    const d=this.data,s=d.stats;
    return `<section class="hero"><div class="hero-copy"><span class="eyebrow"><span class="pulse"></span> IRENE & DANIELE · UNA VITA A TUTTO GAS</span>
      <h1>Irene <span class="wedding-and">&</span><br><em>Daniele</em></h1>${welcome?`<div class="photo-home-invite"><span class="feature-icon">📷</span><div><h3>Condividi le foto della festa</h3><p>Scegli prima il tuo nickname per aggiungere gli scatti.</p></div>${button('Scegli il nick','FOCUS_NAME','secondary')}</div>`:`<div class="home-primary-actions">${button('📸 Condividi le foto della festa','OPEN_PHOTO_UPLOAD','primary home-main-action')}${button('🏁 Gioca · accompagna gli sposi! ✨','START_SINGLE','primary play-now home-main-action')}${button('🔐 Area Sposi · Irene & Daniele ✨','NAV','secondary spouse-main-action','data-page="SUPERVISOR"')}</div>`}<h2>Oggi si festeggia. Insieme a voi!</h2>
      <p>Un pensiero da custodire, una corsa da condividere.<br>Lascia un augurio agli sposi e unisciti alla festa!</p>
      <div class="hero-tags"><span>♥ Dediche</span><span>✿ Amici</span><span>★ Una corsa insieme</span></div>
      ${welcome?`<form class="register" data-form="register"><label for="nickname">METTI IL TUO NICK</label><div class="input-row"><input id="nickname" name="nickname" placeholder="Il tuo nickname" minlength="3" maxlength="16" required autocomplete="nickname"><button type="submit" name="intent" value="play" class="btn primary">Gioca</button></div><button type="submit" name="intent" value="dedicate" class="btn secondary">Lascia una dedica ♥</button><small>3–16 caratteri · lettere, numeri, _ e -</small></form>`:
      `<div class="welcome-back"><span class="avatar small">${esc(d.player.nickname.slice(0,2).toUpperCase())}</span><span>Bentornato, <strong>${esc(d.player.nickname)}.</strong> La festa ti aspetta!</span></div><div class="dedication-invite"><span class="dedication-heart">♥</span><div><h3>Un pensiero per gli sposi</h3><p>Il tuo augurio diventa un ricordo da conservare.</p></div>${button("Lascia una dedica", "NAV", "primary", 'data-page="DEDICATIONS"')}</div>`}</div>${heroArt()}</section>
      <section class="mode-section"><div class="section-heading"><h2><span class="section-number">01</span> Scegli la tua sfida</h2><span>IL PROSSIMO TRAGUARDO INIZIA QUI</span></div>
      <div class="mode-grid"><button class="mode-card single" data-action="${welcome?'FOCUS_NAME':'START_SINGLE'}"><div class="mode-top"><span class="feature-icon">${icons.car}</span><span class="pill">1 GIOCATORE</span></div><div class="mode-bottom"><div><h3>Partita singola</h3><p>Accompagna gli sposi verso il prossimo traguardo.</p></div><span class="circle-arrow">${icons.arrow}</span></div><div class="mode-track"></div></button>
      <button class="mode-card multi" data-action="${welcome?'FOCUS_NAME':'NAV'}" data-page="MULTIPLAYER"><div class="mode-top"><span class="feature-icon">${icons.people}</span><span class="pill">2–6 GIOCATORI</span></div><div class="mode-bottom"><div><h3>Multiplayer</h3><p>Invita gli amici: la festa continua in pista!</p></div><span class="circle-arrow">${icons.arrow}</span></div><div class="mode-track"></div></button></div></section>
      <section class="home-bottom"><div class="leader-preview"><div class="section-heading"><h2>${icons.trophy} Top 10</h2>${welcome?'':`<button class="text-link" data-action="NAV" data-page="LEADERBOARD">Classifica completa ↗</button>`}</div>${this.leaderboard(true)}</div>
      <div class="record-panel"><span class="eyebrow">${welcome?'LA FORMULA È SEMPLICE':'IL TUO RECORD PERSONALE'}</span>${welcome?`<h3>Mani sul volante.<br>Mente sulla vittoria.</h3><p>3 vite. 3 domande a livello.<br>Quante volte riesci a superarti?</p><div class="score-rules"><span>★ <b>+1</b> stella</span><span>✓ <b>+1</b> corretta</span><span>× <b>−2</b> errata</span></div>`:
      `<div class="record-number">${s.best}<span>PT</span></div><div class="record-details"><span><b>${s.level}</b> Livello massimo</span><span><b>${s.games}</b> Partite giocate</span></div><button class="text-link" data-action="NAV" data-page="STATS">Le mie statistiche ${icons.arrow}</button>`}</div></section>`;
  }
  leaderboard(compact=false) {
    const rows=this.data.leaderboard||[];
    if(!rows.length)return `<div class="empty-board"><span>${icons.trophy}</span><h3>Il primo record potrebbe essere il tuo.</h3><p>Completa una partita per accendere la classifica.</p></div>`;
    return `<div class="leader-table"><div class="table-row table-head"><span>POS.</span><span>GIOCATORE</span><span>PUNTI</span><span>LIVELLO</span></div>${rows.slice(0,compact?5:10).map(p=>
      `<div class="table-row ${p.player_id===this.data.player?.id?'is-you':''}"><span class="rank rank-${p.rank}">${String(p.rank).padStart(2,'0')}</span><span class="table-player"><span class="avatar small">${esc(p.nickname.slice(0,2).toUpperCase())}</span><span>${esc(p.nickname)} <small>#${esc(p.tag)}${p.player_id===this.data.player?.id?' · TU':''}</small></span></span><b>${p.score}</b><span>${String(p.level).padStart(2,'0')}</span></div>`).join('')}</div>`;
  }
  back() {return `<div class="back-row">${button('← Torna al garage','NAV','ghost','data-page="HOME"')}</div>`;}
  dedications() {
    const entries=this.data.dedications||[],mine=entries.find(d=>d.player_id===this.data.player.id);
    return this.intro('IL LIBRO DEGLI OSPITI','Per Irene e Daniele, con amore.','Qui puoi leggere tutte le dediche lasciate dagli invitati e aggiungere la tua.')+
      `<section class="panel dedication-form"><form data-form="dedication"><label for="dedication">La tua dedica agli sposi</label>
      <textarea id="dedication" name="message" maxlength="800" rows="5" required placeholder="Cari Irene e Daniele…">${esc(mine?.message||'')}</textarea>
      <p>Fino a 800 caratteri. Il messaggio sarà visibile agli altri giocatori in questo libro, firmato con il tuo nickname. Puoi modificarlo e salvarlo di nuovo.</p>
      <button class="btn primary" type="submit">♥ Salva la dedica</button><span data-dedication-feedback role="status"></span></form></section>
      <h2 class="subheading">Tutte le dediche degli invitati <span class="pill">${entries.length}</span></h2><div data-guestbook class="guestbook">${this.dedicationEntries()}</div>`+this.back();
  }
  dedicationEntries() {
    const entries=this.data.dedications||[];
    return entries.length?entries.map(d=>`<article class="panel dedication-entry"><span class="dedication-heart">♥</span><p>${esc(d.message)}</p><small>— ${esc(d.nickname)} #${esc(d.tag)}</small></article>`).join(''):
      '<div class="empty-board"><h3>Il primo pensiero potrebbe essere il tuo.</h3><p>Lascia un ricordo per gli sposi.</p></div>';
  }
  photos() {
    const approved=Math.max(0,Number(this.data.photo_summary?.approved_count||0));
    const flipbookAction=approved?
      `<div class="flipbook-cta"><p>Gli scatti scelti dagli sposi, da sfogliare e far crescere insieme.</p>${button(`✦ L'album di Irene e Daniele · ${approved} foto`,'OPEN_FLIPBOOK','primary flipbook-open-button')}<small>Arricchiscilo con i tuoi contributi! ♥</small></div>`:
      '<p class="flipbook-empty">Gli scatti scelti dagli sposi appariranno qui appena pubblicati.</p>';
    return this.intro('I RICORDI DELLA FESTA','Foto, sorrisi e momenti da rivivere.','Carica le tue foto qui sotto: appariranno nella galleria condivisa.')+
      `<section class="flipbook album-hero"><div class="section-heading"><h2>♥ L'album di Irene e Daniele</h2><span>Un ricordo della festa che cresce con voi</span></div>${flipbookAction}</section>
      <section class="photo-upload-note panel"><span class="feature-icon">📷</span><div><h2>Condividi i tuoi scatti</h2><p>Puoi scegliere fino a 20 foto alla volta dalla galleria del telefono. Le tue foto possono rendere ancora più bello l'album degli sposi.</p></div></section>`+this.back();
  }
  stats() {
    const s=this.data.stats;
    const cells=[['Record personale',s.best,'PT'],['Livello massimo',s.level,''],['Partite giocate',s.games,''],['Stelle raccolte',s.stars,'★'],['Risposte corrette',s.correct,''],['Risposte sbagliate',s.wrong,''],['Precisione quiz',s.accuracy,'%'],['Multiplayer giocati',s.multiplayer,''],['Vittorie multiplayer',s.wins,'']];
    const badges=[['Prima corsa',s.games>0,'Completa la tua prima partita'],['Collezionista',s.stars>=50,'Raccogli 50 stelle'],['Sopravvissuto',s.level>=10,'Raggiungi il livello 10'],['Campione',s.wins>0,'Vinci una gara multiplayer']];
    return this.intro('IL TUO PERCORSO',`${esc(this.data.player.nickname)}, si migliora correndo.`,'Ogni gara lascia il segno. Questi sono i tuoi numeri.')+
      `<div class="stats-grid">${cells.map(([name,value,unit])=>`<section class="stat-card"><span>${name}</span><strong>${value}<small>${unit}</small></strong></section>`).join('')}</div>
      <h2 class="subheading">Traguardi personali</h2><div class="badges">${badges.map(([name,yes,desc])=>`<div class="badge ${yes?'unlocked':''}"><span>${yes?'✦':'◇'}</span><div><b>${name}</b><small>${desc}</small></div></div>`).join('')}</div>`+this.back();
  }
  help() {
    return this.intro('POCHE REGOLE. TANTA VOGLIA DI RIPROVARCI.','Prima il volante. Poi il cervello.')+
      `<div class="help-grid">${[['01','Guida e sopravvivi.','Muoviti con ← → oppure A e D. Tieni premuto ↑, W o Shift per accelerare fino a 1,6 volte la velocità; rilascia per rallentare. Su smartphone usa i pulsanti o trascina il dito sulla pista e tieni premuto ACCELERA per aumentare la velocità. Parti con 3 vite: ogni urto ne costa una, poi hai 1,3 secondi di protezione.'],['02','Attraversa il traguardo.','Tocca la pista, premi F o tocca ✿ BOUQUET per lanciare fiori: mira ai palloncini a cuore, ogni colpo riuscito vale +2 punti. Puoi tenere premuto. Supera i gruppi di ostacoli fino al termine del percorso. Le stelle valgono +1, lo scudo assorbe un urto e il bonus tempo rallenta la strada per 4 secondi.'],['03','Pensa veloce.','Rispondi a 3 domande, con 15 secondi per ognuna. Risposta corretta: +1. Sbagliata o tempo scaduto: −2. I punteggi negativi sono possibili, ma gli errori al quiz non tolgono vite.']].map(([n,h,p])=>`<section class="panel"><span class="step-number">${n}</span><h2>${h}</h2><p>${p}</p></section>`).join('')}</div>
      <section class="panel help-multi"><span class="feature-icon lavender">${icons.people}</span><div><h2>Una griglia, fino a sei rivali.</h2><p>Create una stanza, segnatevi pronti e lasciate partire l'host. Avrete la stessa pista e le stesse domande per 5 livelli. I risultati delle risposte restano nascosti fino alla chiusura della domanda. Chi non arriva entro 85 secondi perde una vita e salta il quiz. Chi esaurisce le vite può restare a guardare.</p><p>In singolo puoi mettere in pausa con Spazio. In multiplayer il tempo condiviso continua anche se cambi scheda. Una disconnessione oltre 40 secondi elimina il pilota. Se l'host lascia la lobby, il comando passa a un altro giocatore.</p></div></section>`+this.back();
  }
  lobby() {
    const r=this.data.room,players=r.players,me=players.find(p=>p.player_id===this.data.player.id);
    const host=r.host===this.data.player.id;
    return this.intro('LA GRIGLIA SI STA FORMANDO','Il tuo gruppo. La tua gara.','Condividi il codice. Tutti pronti? Si parte.')+
      `<div class="lobby-layout"><section class="panel"><div class="section-heading"><h2>Giocatori</h2><span class="pill">${players.length} / 6</span></div><div class="lobby-players">${players.map(p=>`<div class="lobby-player ${p.player_id===this.data.player.id?'is-you':''}"><span class="avatar">${esc(p.nickname.slice(0,2).toUpperCase())}</span><div><strong>${esc(p.nickname)} ${p.player_id===this.data.player.id?'<small>TU</small>':''}</strong><small>#${esc(p.tag)} ${p.player_id===r.host?'· HOST':''}</small></div><span class="ready-state ${p.ready?'ready':''}">${p.ready?'✓ Pronto':'○ In attesa'}</span></div>`).join('')}
      ${Array.from({length:Math.max(0,2-players.length)},()=>'<div class="lobby-player empty-slot"><span class="avatar">+</span><span>Un amico sta per unirsi…</span></div>').join('')}</div>
      <div class="lobby-actions">${button(me?.ready?'✓ Sei pronto':'Sono pronto','READY',me?.ready?'secondary':'primary',me?.ready?'disabled':'')}
      ${host?button('Inizia gara '+icons.arrow,'START_ROOM','primary',players.length<2||!players.every(p=>p.ready)?'disabled':''):'<p>La gara partirà quando l’host darà il via.</p>'}</div></section>
      <aside class="panel invite-panel"><span class="eyebrow">IL VOSTRO CODICE STANZA</span><div class="room-code">${esc(r.code)}</div>${button('Copia codice','COPY','secondary')}<div class="room-facts"><span>01 <b>Stessa pista per tutti</b></span><span>02 <b>5 livelli di sfida</b></span><span>03 <b>Un campione Brain Racer</b></span></div><p>Connessi allo stesso indirizzo dell'app, anche da dispositivi diversi.</p></aside></div>
      <div class="back-row">${button('← Lascia la stanza','LEAVE_ROOM','ghost')}</div>`;
  }
  driving() {
    const g=this.data.game,r=this.data.room;
    return `<div class="race-heading"><div><span class="eyebrow">${r?'GARA MULTIPLAYER · '+esc(r.code):'PARTITA SINGOLA'}</span><h1>Irene e Daniele, in viaggio.</h1></div><span class="level-pill">LIVELLO <b>${String(g.level).padStart(2,'0')}</b>${r?'/ 05':''}</span></div>
      <div class="race-layout"><section class="race-main"><div class="race-hud"><div><span>PUNTEGGIO</span><strong data-local-score>${g.score}</strong></div><div class="hud-lives"><span>VITE</span><strong data-local-lives>${'♥'.repeat(g.lives)}</strong></div><div><span>PERCORSO</span><strong class="progress-text" data-local-progress>${g.progress} / ${g.difficulty.groups}</strong></div></div><div class="route-bar"><i data-local-bar style="width:${g.progress/g.difficulty.groups*100}%"></i></div>
      <div class="canvas-wrap"><canvas tabindex="0" aria-label="Pista di Brain Racer. Usa le frecce sinistra e destra, A e D, o trascina per guidare."></canvas></div>
      <div class="touch-controls wedding-controls"><button data-steer="arrowleft" aria-label="Sterza a sinistra">←<span>SINISTRA</span></button><button data-steer="arrowup" data-accelerator aria-label="Tieni premuto per accelerare">↑<span>ACCELERA<small>×1,00</small></span></button><button data-steer="f" data-action="BOUQUET" class="bouquet-control" aria-label="Lancia bouquet contro i cuori">✿<span>BOUQUET<small>♥ +2 punti</small></span></button><button data-steer="arrowright" aria-label="Sterza a destra">→<span>DESTRA</span></button></div><div class="wedding-plaque"><b>Irene <span>♥</span> Daniele</b><small data-power>F / ✿ lancia bouquet · cuore +2</small></div></section>
      <aside class="race-sidebar">${coupleArt("race","In viaggio insieme a te!")}${r?`<section class="panel opponents-panel"><span class="eyebrow">LA GARA IN DIRETTA</span><div data-opponents>${this.opponents()}</div><div class="deadline-note">Tempo gara <b data-countdown data-end="${r.deadline}"></b></div></section>`:
      `<section class="panel mission"><span class="eyebrow">LA TUA MISSIONE</span><span class="feature-icon lime">${icons.flag}</span><h2>Prima il traguardo.<br>Poi la sfida.</h2><p>Supera ${g.difficulty.groups} gruppi di ostacoli per sbloccare le 3 domande di questo livello.</p><div class="mini-record"><span>IL TUO RECORD</span><strong>${this.data.stats.best} <small>PT</small></strong></div></section>`}
      <section class="panel bonus-guide"><h3>Una marcia in più</h3><div><b class="lime-text">★</b><span>Stella<small>+1 punto</small></span></div><div><b class="cyan-text">⬡</b><span>Scudo<small>Assorbe un urto</small></span></div><div><b class="lavender-text">◷</b><span>Tempo lento<small>4 secondi per respirare</small></span></div></section>
      <div class="drive-controls"><span><kbd>←</kbd> <kbd>→</kbd> sterza · <kbd>↑</kbd> <kbd>W</kbd> accelera · <kbd>F</kbd> bouquet</span>${r?'':button('Ⅱ Pausa','PAUSE','secondary')} ${button(r?'Lascia la gara':'Termina partita',r?'CONFIRM_LEAVE':'CONFIRM_ABORT','ghost')}</div></aside></div>`;
  }
  opponents() {
    const r=this.data.room;if(!r)return '';
    const labels={WAITING:'Al traguardo',ELIMINATED:'Eliminato',DNF:'Traguardo non raggiunto',DRIVING:'In pista'};
    return r.players.map((p,i)=>`<div class="opponent ${p.player_id===this.data.player.id?'is-you':''}"><div><b>${i+1}. ${esc(p.nickname)}</b><span>${p.score} PT</span></div><div class="opponent-track"><i style="width:${Math.min(100,p.progress/(this.data.game?.difficulty.groups||20)*100)}%"></i></div><small>${labels[p.phase]||'In attesa'} · ${'♥'.repeat(Math.max(0,p.lives))}${p.online?'':' · Connessione…'}</small></div>`).join('');
  }
  quiz(reveal) {
    const g=this.data.game,q=g.question,r=this.data.room;
    if(!q)return this.pit();
    const answer=g.answer,eligible=g.eligible;
    const title=reveal?(eligible?(answer?.correct?'Risposta corretta!':'Risposta sbagliata.'):'Ecco la risposta.'):'Adesso, pensa veloce.';
    return `${coupleArt('quiz',reveal?'Un passo in più verso la festa!':'Facciamo il tifo per te!',reveal?'jump':'dance')}<div class="quiz-top"><span class="eyebrow">LIVELLO ${String(g.level).padStart(2,'0')} · SFIDA DI CONOSCENZA</span><span class="score-chip">${g.score} <small>PT</small></span></div>
      <section class="quiz-panel ${reveal?'revealed':''}"><div class="quiz-meta"><span class="pill">${esc(q.category)}</span><div class="question-steps">${[0,1,2].map(i=>`<i class="${i===g.qindex?'current':i<g.qindex?'complete':''}"></i>`).join('')}<span>${g.qindex+1} / 3</span></div></div>
      <div class="quiz-timing"><span>${reveal?'PROSSIMA TAPPA TRA':'TEMPO A DISPOSIZIONE'}</span><b data-countdown data-end="${g.deadline}"></b></div><div class="quiz-timer"><i data-timer-bar data-end="${g.deadline}" data-duration="${reveal?.45:15}"></i></div>
      <span class="quiz-kicker">${title}</span><h1>${esc(q.question)}</h1>
      <div class="answer-grid">${q.answers.map((a,i)=>`<button class="answer ${reveal&&i===q.correct_index?'correct':''} ${reveal&&answer?.choice===i&&!answer.correct?'wrong':''}" data-action="ANSWER" data-choice="${i}" ${reveal||g.answered||!eligible?'disabled':''}><span class="answer-letter">${'ABCD'[i]}</span><span>${esc(a)}</span>${reveal&&i===q.correct_index?'<b>✓</b>':''}</button>`).join('')}</div>
      ${reveal?`<div class="quiz-feedback ${answer?.correct?'positive':''}" role="status"><strong>${eligible?(answer?.correct?'✓ +1 punto':answer?.choice===null?'◷ Tempo scaduto · −2 punti':'× −2 punti'):'Risultati della domanda'}</strong><p>Risposta corretta: <b>${esc(q.answers[q.correct_index])}</b>${q.explanation?'<br>'+esc(q.explanation):''}</p></div>`:
      `<div class="quiz-status" role="status">${!eligible?(g.phase==='DNF'?'DNF · Traguardo non raggiunto. Rientrerai al prossimo livello.':'Sei eliminato: segui la sfida come spettatore.'):
         g.answered?'✓ Risposta registrata. Passiamo subito alla prossima.':'Ogni risposta conta. Fidati della tua prima intuizione.'}</div>`}
      <div class="quiz-scoring"><span>✓ Corretta <b>+1</b></span><span>× Sbagliata o scaduta <b>−2</b></span><span>♥ Le vite restano al sicuro</span></div></section>`;
  }
  summary() {
    const g=this.data.game,delta=g.score-g.round_score;
    return `${coupleArt("celebration","Questo traguardo è anche vostro!","jump")}<section class="result-hero"><div class="result-symbol">${icons.flag}</div><span class="eyebrow">BEN FATTO, PILOTA</span><h1>Livello ${g.level} completato<span class="lime-text">.</span></h1><p>La prossima strada è un po' più veloce.<br>Il tuo cervello è già pronto.</p><div class="total-score">${g.score}<small>PUNTI TOTALI</small></div></section>
      <div class="summary-grid">${[['Cuori scoppiati',g.round_hearts||0],['Stelle raccolte',g.round_stars],['Corrette',g.round_correct],['Sbagliate',g.round_wrong],['Punti del livello',(delta>0?'+':'')+delta],['Vite rimaste','♥'.repeat(g.lives)],['Record personale',this.data.stats.best]].map(([l,v])=>`<div class="stat-card"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div>
      <div class="center-actions">${button('Continua al livello successivo '+icons.arrow,'NEXT_LEVEL')}${button('Concludi e salva','ABORT','ghost')}</div>`;
  }
  gameOver() {
    const g=this.data.game,rank=this.data.leaderboard.find(p=>p.player_id===this.data.player.id);
    return `<section class="result-hero"><span class="eyebrow">LA CORSA FINISCE. LA SFIDA CONTINUA.</span><h1>GAME <em>OVER.</em></h1>${button("Gioca ancora", "REPLAY", "primary play-now")}<p>${g.score>=this.data.stats.best?'Il tuo record personale è qui.':'Un’altra corsa. Un nuovo traguardo.'}</p><div class="total-score">${g.score}<small>PUNTEGGIO FINALE</small></div><div class="result-chips"><span>Livello ${g.level}</span><span>Record ${this.data.stats.best} PT</span>${rank?`<span>#${rank.rank} in classifica personale</span>`:''}</div></section>
      <div class="center-actions">${button('Torna al garage','HOME','secondary')}</div>${coupleArt("celebration","Questo traguardo è anche vostro!","jump")}<div class="save-note">✓ Risultato salvato. Il prossimo record ti aspetta.</div>`;
  }
  pit() {
    const g=this.data.game,eliminated=g?.phase==='ELIMINATED';
    return `<div class="pit-layout"><section class="result-hero"><div class="pit-icon">${eliminated?'◇':icons.flag}</div><span class="eyebrow">${eliminated?'LA GARA CONTINUA':'HAI TAGLIATO IL TRAGUARDO'}</span><h1>${eliminated?'Resti in prima fila.':'PIT STOP.'}</h1><p>${eliminated?'Sei eliminato. Segui gli altri piloti fino al podio.':'Riprendi fiato. Tra poco si accende il cervello.'}</p><div class="waiting-dots"><i></i><i></i><i></i></div><small>In attesa degli altri giocatori</small></section><aside class="panel"><h2>La gara in diretta</h2><div data-opponents>${this.opponents()}</div></aside></div>`;
  }
  results(final) {
    const r=this.data.room,players=r.players,winner=players[0];
    return `<section class="result-hero ${final?'champion':''}"><span class="eyebrow">${final?'CAMPIONE BRAIN RACER':'CLASSIFICA DELLA GARA · LIVELLO '+r.level}</span><h1>${final?esc(winner.nickname):'Un livello più vicini.'}</h1><p>${final?'Riflessi d’acciaio. Mente da campione.':'Ogni punto può cambiare la gara.'}</p></section>
      ${final?`<div class="podium">${[1,0,2].filter(i=>players[i]).map(i=>`<div class="podium-place place-${i+1}"><span class="medal">${['🥇','🥈','🥉'][i]}</span><strong>${esc(players[i].nickname)}</strong><span>${players[i].score} PT</span><div>${i+1}</div></div>`).join('')}</div>`:''}
      <div class="race-results"><div class="result-row result-head"><span>POS.</span><span>GIOCATORE</span><span>PUNTI</span><span>VITE</span><span>QUIZ ✓ / ×</span><span>ARRIVO</span></div>${players.map((p,i)=>`<div class="result-row ${p.player_id===this.data.player.id?'is-you':''}"><b>${i+1}</b><span>${esc(p.nickname)} <small>${p.player_id===this.data.player.id?'TU':''}</small></span><strong>${p.score}</strong><span>${'♥'.repeat(p.lives)||'—'}</span><span>${p.round_correct} / ${p.round_wrong}</span><span>${p.finish_time?`${p.finish_time}s`:p.phase==='DNF'?'DNF':'—'}</span></div>`).join('')}</div>
      <div class="center-actions">${final?button('Torna al garage','HOME'):`<p>Prossima partenza tra <b data-countdown data-end="${r.deadline}"></b></p>`}</div>${final?'<div class="save-note">✓ Gara e vittoria salvate nei profili.</div>':''}`;
  }
  tick() {
    if(!this.data)return;
    const liveNow=(Date.now()+(this.serverOffset||0))/1000;
    const now=this.view()==='QUIZ' && this.answerLock ? this.answerLock.at : liveNow;
    if(this.view()==='QUIZ' && this.data.game.answered && !this.answerLock)
      this.answerLock={key:`${this.data.game.id}:${this.data.game.level}:${this.data.game.qindex}`,at:now};
    if(this.engine?.state.done && this.engine.state.lives<=0 && this.data.game.mode==='single' && !this.root.querySelector('.quick-replay')){
      const panel=document.createElement('section');panel.className='quick-replay';
      panel.innerHTML='<h1>Game Over</h1>'+button('Gioca ancora','REPLAY');
      this.root.querySelector('.screen-driving').append(panel);
    }
    this.root.querySelectorAll('[data-countdown]').forEach(el=>{el.textContent=`${Math.max(0,Math.ceil(Number(el.dataset.end)-now))}s`;});
    this.root.querySelectorAll('[data-timer-bar]').forEach(el=>{
      const fraction=Math.max(0,Math.min(1,(Number(el.dataset.end)-now)/Number(el.dataset.duration)));
      el.style.width=`${fraction*100}%`;el.classList.toggle('urgent',fraction<.25);
    });
    if(this.pending.length&&Date.now()-this.lastPacket>1700)this.flush();
  }
  click(event) {
    const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
    const action=el.dataset.action;
    if(action==='MUSIC'){this.audio.toggleMusic();el.textContent=this.audio.musicMuted?'♪̸':'♫';el.setAttribute('aria-label',this.audio.musicMuted?'Attiva musica di sottofondo':'Disattiva musica di sottofondo');return;}
    if(action==='EFFECTS'){this.audio.toggleEffects();el.textContent=this.audio.effectsMuted?'🔇':'🔊';el.setAttribute('aria-label',this.audio.effectsMuted?'Attiva effetti sonori':'Disattiva effetti sonori');return;}
    this.audio.unlock();
    if(action==='OPEN_PHOTO_UPLOAD'){
      this.optimisticPage='PHOTOS';this.data.page='PHOTOS';this.signature='';this.mountView('PHOTOS');this.send('OPEN_PHOTO_UPLOAD');
      const deadline=Date.now()+10000;
      const scrollToUpload=()=>{try{const target=window.parent.document.getElementById('photo-upload-start');if(target){target.scrollIntoView({block:'start',behavior:'smooth'});return;}}catch(_e){}if(Date.now()<deadline)setTimeout(scrollToUpload,120);};
      setTimeout(scrollToUpload,120);return;
    }
    if(action==='NAV'){
      const page=el.dataset.page;
      if((this.data.game||this.data.room)&&page==='MULTIPLAYER'){
        this.notify('Hai una partita in corso. Termina o esci dalla gara prima di aprire il Multiplayer.');return;
      }
      if((this.data.game||this.data.room)&&['HOME','LEADERBOARD','STATS','HELP','DEDICATIONS','PHOTOS','SUPERVISOR'].includes(page)){
        this.menuOverlay=page;this.signature='';this.mountView(page);return;
      }
      if(!this.data.game&&!this.data.room&&['HOME','LEADERBOARD','STATS','HELP','MULTIPLAYER','DEDICATIONS','PHOTOS','SUPERVISOR'].includes(page)){
        this.optimisticPage=page;this.data.page=page;this.signature='';this.mountView(this.view());
      }
      this.send('NAV',{page});return;
    }
    if(action==='OPEN_FLIPBOOK'){
      el.disabled=true;el.textContent='Apro il Flipbook…';this.send('OPEN_FLIPBOOK');return;
    }
    if(action==='RESUME'||(action==='START_SINGLE'&&this.menuOverlay&&(this.data.game||this.data.room))){
      this.menuOverlay=null;this.signature='';this.mountView(this.gameView());return;
    }
    if(action==='START_SINGLE'&&this.data.start_template){
      this.startLocalGame(this.data.start_template,'START_SINGLE');return;
    }
    if(action==='REPLAY'&&this.data.replay_template){
      this.startLocalGame(this.data.replay_template,'REPLAY');return;
    }
    if(action==='NEXT_LEVEL'){
      const g=this.data.game,now=(Date.now()+(this.serverOffset||0))/1000;
      const nextDifficulty=g.next_difficulty||levelDifficulty(g.level+1);
      this.data.game={...g,screen_phase:'DRIVING',phase:'DRIVING',level:g.level+1,start_at:now,
        progress:0,collected:[],hit:[],balloon_hit:[],shield:false,qindex:0,answered:false,
        difficulty:nextDifficulty,next_difficulty:null,quiz_preview:g.next_quiz_preview||[],acks:[]};
      this.optimisticNextLevel=g.level+1;
      this.signature='';this.mountView('DRIVING');this.send('NEXT_LEVEL');return;
    }
    if(action==='FOCUS_NAME'){this.root.querySelector('#nickname')?.focus();this.notify('Scegli un nickname per sbloccare il Multiplayer.');return;}
    if(action==='PAUSE'){this.engine?.togglePause();el.textContent=this.engine?.paused?'▶ Riprendi':'Ⅱ Pausa';return;}
    if(action==='BOUQUET'){if(this.engine?.state.started)this.engine.throwBouquet();return;}
    if(action==='COPY'){
      navigator.clipboard?.writeText(this.data.room.code).then(()=>{el.textContent='✓ Codice copiato';}).catch(()=>{el.textContent=this.data.room.code;});return;
    }
    if(action==='CONFIRM_ABORT'||action==='CONFIRM_LEAVE'){
      this.engine?.keys.clear();
      const modal=document.createElement('div');modal.className='modal-backdrop';
      modal.innerHTML=`<section class="modal panel" role="dialog" aria-modal="true" aria-label="Concludi la gara"><h2>${action==='CONFIRM_ABORT'?'Concludere la partita?':'Lasciare la gara?'}</h2><p>${action==='CONFIRM_ABORT'?'Il tuo punteggio verrà salvato.':'Verrai eliminato da questa gara.'}</p><div class="center-actions">${button('Continua a giocare','CANCEL','secondary')}${button('Conferma',action==='CONFIRM_ABORT'?'ABORT':'LEAVE_ROOM')}</div></section>`;
      this.root.append(modal);if(this.engine&&this.data.game.mode==='single')this.engine.paused=true;
      modal.querySelector('button').focus();return;
    }
    if(action==='CANCEL'){this.root.querySelector('.modal-backdrop')?.remove();if(this.engine)this.engine.paused=false;return;}
    if(action==='ABORT'&&this.data.game?.mode==='single'){
      this.root.querySelector('.modal-backdrop')?.remove();
      if(this.engine){this.engine.destroy();this.engine=null;}
      this.localQuizActive=false;this.optimisticNextLevel=null;this.optimisticStart=null;
      this.data.game={...this.data.game,status:'finished',phase:'GAME_OVER',screen_phase:'GAME_OVER',lives:this.data.game.lives??0};
      this.signature='';this.mountView('GAME_OVER');this.send('ABORT');return;
    }
    if(action==='ANSWER'){
      const g=this.data.game;
      if(this.answerLock || g.answered || g.screen_phase!=='QUIZ')return;
      const choice=Number(el.dataset.choice),correctIndex=Number(g.question?.correct_index);
      this.answerLock={key:`${g.id}:${g.level}:${g.qindex}`,at:(Date.now()+(this.serverOffset||0))/1000};
      this.root.querySelectorAll('.answer').forEach((answer,index)=>{
        answer.disabled=true;
        if(Number.isInteger(correctIndex)&&index===correctIndex)answer.classList.add('correct');
        if(Number.isInteger(correctIndex)&&index===choice&&choice!==correctIndex)answer.classList.add('wrong');
      });
      if(!Number.isInteger(correctIndex))el.classList.add('picked');
      if(Number.isInteger(correctIndex)){
        const correct=choice===correctIndex,status=this.root.querySelector('.quiz-status');
        if(status){status.className=`quiz-feedback instant-feedback ${correct?'positive':'negative'}`;
          status.innerHTML=correct?'<strong>✓ Risposta corretta! +1 punto</strong>':
            `<strong>× Risposta sbagliata. −2 punti</strong><p>Risposta corretta: <b>${esc(g.question.answers[correctIndex])}</b></p>`;}
        this.audio.play(correct?'correct':'wrong');
      }
      this.send('ANSWER',{game_id:g.id,level:g.level,index:g.qindex,choice});
      if(this.localQuizActive)this.advanceLocalQuiz(choice);
      return;
    }
    this.send(action);
  }
  submit(event) {
    event.preventDefault();this.audio.unlock();const form=event.target;
    if(form.dataset.form==='register')this.send('REGISTER',{nickname:form.elements.nickname.value,play:event.submitter?.value==='play'});
    if(form.dataset.form==='join')this.send('JOIN_ROOM',{code:form.elements.code.value});
    if(form.dataset.form==='dedication'){
      this.send('DEDICATE',{message:form.elements.message.value});
      this.dedicationSaving=true;
    }
  }
  destroy() {clearInterval(this.interval);this.engine?.destroy();this.audio.destroy();}
}

export default function(component) {
  const parent=component.parentElement;
  if(parent.__brainUI && parent.__brainUI.root!==parent.querySelector('#brain-app')) {
    parent.__brainUI.destroy();delete parent.__brainUI;
  }
  if(!parent.__brainUI)parent.__brainUI=new BrainUI(parent,component);
  parent.__brainUI.update(component);
  return ()=>{setTimeout(()=>{if(!parent.isConnected){parent.__brainUI?.destroy();delete parent.__brainUI;}},100);};
}
