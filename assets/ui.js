const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
function heroArt() {
  return `<div class="hero-art" aria-hidden="true">
    <div class="orbit orbit-one"></div><div class="orbit orbit-two"></div>
    <div class="art-label"><span class="pulse"></span> RIFLESSI + CONOSCENZA</div>
    <svg class="hero-road" viewBox="0 0 560 430" fill="none">
      <defs><linearGradient id="asphalt" x1="160" y1="60" x2="450" y2="420"><stop stop-color="#202a35"/><stop offset="1" stop-color="#11161f"/></linearGradient>
      <linearGradient id="body" x1="0" x2="80" y2="140"><stop stop-color="#ffffff"/><stop offset=".6" stop-color="#fff0e8"/><stop offset="1" stop-color="#d9a4ba"/></linearGradient>
      <filter id="glow"><feGaussianBlur stdDeviation="6"/></filter></defs>
      <g transform="rotate(27 280 215)">
      <path d="M142-60h276v610H142z" fill="url(#asphalt)"/>
      <path d="M144-60v610m272-610v610" stroke="#79e4e8" stroke-width="2" opacity=".65"/>
      <path d="M151-60v610m258-610v610" stroke="#42525d" stroke-width="3" stroke-dasharray="20 20"/>
      <path d="M231-60v610m95-610v610" stroke="#687483" stroke-width="2" stroke-dasharray="32 35" opacity=".6"/>
      <path d="M280 216v240" stroke="#ceff5f" stroke-width="42" opacity=".06" filter="url(#glow)"/>
      <path d="M260 280v210m40-200v200" stroke="#cfff61" stroke-width="2" opacity=".25"/>
      <g transform="translate(249 155)">
      <rect x="-8" y="18" width="12" height="28" rx="4" fill="#03070a"/><rect x="58" y="18" width="12" height="28" rx="4" fill="#03070a"/>
      <rect x="-8" y="83" width="12" height="28" rx="4" fill="#03070a"/><rect x="58" y="83" width="12" height="28" rx="4" fill="#03070a"/>
      <rect x="0" width="62" height="127" rx="15" fill="url(#body)"/>
      <path d="m10 30 42 0 4 24H6l4-24Z" fill="#162c32"/><path d="M12 96h38l5 16H7l5-16Z" fill="#172d30"/>
      <path d="M27 0h8v26h-8zm0 59h8v28h-8z" fill="#d781a8"/>
      <rect x="6" y="7" width="14" height="7" rx="2" fill="#f4fff3"/><rect x="42" y="7" width="14" height="7" rx="2" fill="#f4fff3"/>
      <text x="31" y="79" text-anchor="middle" fill="#ba7194" font-size="19">♥</text><text x="31" y="142" text-anchor="middle" fill="#f8c3da" font-size="10">IRENE &amp; DANIELE</text><path d="M8 120h11m25 0h11" stroke="#ff686d" stroke-width="4"/>
      <path d="m5 3-24-90h63L19 3m24 0L21-87h67L57 3" fill="#d9ffeb" opacity=".04"/>
      </g>
      <g transform="translate(350 90)"><circle r="22" fill="#ceff5f" opacity=".12"/><path d="m0-14 4 9 10 1-8 7 3 10-9-6-9 6 3-10-8-7 10-1z" fill="#dcff85"/></g>
      <g transform="translate(196 50)"><path d="m0-18 14 34h-28z" fill="#db9155"/><path d="M-6 0H6" stroke="#ffe3af" stroke-width="5"/></g>
      <g transform="translate(170 350)"><path d="M0 0h230v22H0z" fill="#e3e8dc" opacity=".7"/><path d="M0 0h23v11H0zm46 0h23v11H46zm46 0h23v11H92zm46 0h23v11h-23zm46 0h23v11h-23zM23 11h23v11H23zm46 0h23v11H69zm46 0h23v11h-23zm46 0h23v11h-23zm46 0h23v11h-23z" fill="#131a23"/></g>
      </g>
    </svg>
    <div class="floating-chip chip-brain"><span>✦</span><div>VIVA GLI SPOSI<strong>Irene ♥ Daniele</strong></div></div>
    <div class="floating-chip chip-star"><b>★</b><div>OGNI STELLA CONTA<strong>+1 punto</strong></div></div>
    <div class="art-caption">01 / IL TUO PROSSIMO RECORD TI ASPETTA</div>
  </div>`;
}

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
    const command={id:makeId(),action,...payload};this.pending.push(command);this.flush();
  }
  flush() {this.lastPacket=Date.now();this.component.setStateValue('packet',[...this.pending]);}
  update(component) {
    this.component=component;this.data=component.data;
    const data=this.data;
    this.pending=this.pending.filter(p=>!data.command_acks.includes(p.id));
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
    const signature=[view,game?.id,game?.level,game?.qindex,
      ['QUIZ','REVEAL'].includes(view)?game?.answered:'',
      view==='LOBBY'?JSON.stringify(room?.players):'',data.player?.id||''].join(':');
    if(signature!==this.signature){
      this.signature=signature;
      if(this.engine){this.engine.destroy();this.engine=null;}
      this.root.innerHTML=this.header()+`<main class="screen screen-${view.toLowerCase()}">${this.render(view)}</main>`+this.footer()+
      '<div class="toast" role="alert" hidden></div>';
      this.root.scrollIntoView({block:'start',behavior:'instant'});
      if(view==='DRIVING'){
        this.engine=new DrivingEngine(this.root.querySelector('canvas'),{...game,serverNow:data.now},events=>{
          // An outstanding transport packet is retried, never expanded indefinitely.
          if(!this.pending.some(p=>p.action==='EVENTS'))this.send('EVENTS',{game_id:game.id,level:game.level,events});
        },this.audio);
      }
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
  view() {
    const d=this.data,g=d.game,r=d.room;
    if(!d.booted)return 'LOADING';
    if(!d.player)return 'WELCOME';
    if(r){
      if(r.phase==='CLOSED')return 'CLOSED';
      if(r.phase==='LOBBY')return 'LOBBY';
      if(['COUNTDOWN','DRIVING'].includes(r.phase))return g?.phase==='DRIVING'?'DRIVING':'PIT';
      return r.phase;
    }
    return g?.screen_phase||d.page;
  }
  header() {
    const d=this.data,active=d.game||d.room;
    return `<header class="nav"><button class="brand" data-action="NAV" data-page="HOME" ${active?'disabled':''}>
      <span class="brand-symbol">${icons.flag}</span><span>BRAIN<span class="brand-light">RACER</span><small>GUIDA. PENSA. VINCI.</small></span></button>
      <nav aria-label="Navigazione principale">${[['HOME','Garage'],['LEADERBOARD','Classifica'],['HELP','Come si gioca'],['DEDICATIONS','Dediche ♥']].map(([page,label])=>
        `<button data-action="NAV" data-page="${page}" class="nav-link ${d.page===page&&!active?'selected':''}" ${active||!d.player?'disabled':''}>${label}</button>`).join('')}</nav>
      <div class="nav-right"><button class="sound" data-action="SOUND" title="Attiva o disattiva audio" aria-label="${this.audio.muted?'Attiva audio':'Disattiva audio'}">${this.audio.muted?'♪̸':'♫'}</button>
      ${d.player?`<button class="profile" data-action="NAV" data-page="STATS" ${active?'disabled':''}><span class="avatar">${esc(d.player.nickname.slice(0,2).toUpperCase())}</span><span>${esc(d.player.nickname)}<small>#${esc(d.player.tag)}</small></span></button>`:
      '<span class="edition">ARCADE / VOL. 01</span>'}</div></header>${d.player&&!active?`<nav class="mobile-nav" aria-label="Menu smartphone">${[['HOME','Garage'],['LEADERBOARD','Classifica'],['HELP','Come si gioca'],['DEDICATIONS','Dediche ♥']].map(([page,label])=>`<button data-action="NAV" data-page="${page}" class="${d.page===page?'selected':''}">${label}</button>`).join('')}</nav>`:''}`;
  }
  footer() {return `<footer><span>${icons.flag} BRAIN RACER <i>·</i> Riflessi veloci. Mente accesa.</span><span>Fatto per giocare. Ancora una volta. <span class="tiny-dot"></span></span></footer>`;}
  intro(eyebrow,title,description='') {return `<div class="page-intro"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1>${description?`<p>${description}</p>`:''}</div>`;}
  render(view) {
    const d=this.data,g=d.game,r=d.room;
    if(view==='LOADING')return `<div class="center-state"><div class="loader"></div><h2>Prepariamo la griglia.</h2><p>Il tuo prossimo record parte da qui.</p></div>`;
    if(view==='HOME'||view==='WELCOME')return this.home(view==='WELCOME');
    if(view==='LEADERBOARD')return this.intro('LA GRIGLIA DEI MIGLIORI','Ogni punto conta.','I migliori 10 piloti. Un solo record per giocatore.')+this.leaderboard()+this.back();
    if(view==='STATS')return this.stats();
    if(view==='DEDICATIONS')return this.dedications();
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
      <h1>BRAIN<br><em>RACER<span class="title-dot">.</span></em></h1><h2>Guida. Pensa. Vinci.</h2>
      <p>Schiva gli ostacoli. Conquista il traguardo.<br>Metti alla prova la tua mente. Il record è tuo.</p>
      <div class="hero-tags"><span>${icons.bolt} Riflessi</span><b>+</b><span>✦ Conoscenza</span><b>=</b><span class="lime-text">Una corsa diversa.</span></div>
      ${welcome?`<form class="register" data-form="register"><label for="nickname">PRIMA DI PARTIRE, COME TI CHIAMI?</label><div class="input-row"><input id="nickname" name="nickname" placeholder="Il tuo nickname" minlength="3" maxlength="16" required autocomplete="nickname"><button type="submit" class="btn primary">In pista ${icons.arrow}</button></div><small>3–16 caratteri · lettere, numeri, _ e -</small></form>`:
      `<div class="welcome-back"><span class="avatar small">${esc(d.player.nickname.slice(0,2).toUpperCase())}</span><span>Bentornato, <strong>${esc(d.player.nickname)}.</strong> Pronto a superarti?</span></div>`}</div>${heroArt()}</section>
      <section class="mode-section"><div class="section-heading"><h2><span class="section-number">01</span> Scegli la tua sfida</h2><span>IL PROSSIMO TRAGUARDO INIZIA QUI</span></div>
      <div class="mode-grid"><button class="mode-card single" data-action="${welcome?'FOCUS_NAME':'START_SINGLE'}"><div class="mode-top"><span class="feature-icon">${icons.car}</span><span class="pill">1 GIOCATORE</span></div><div class="mode-bottom"><div><h3>Partita singola</h3><p>Tu, la strada e il tuo prossimo record.</p></div><span class="circle-arrow">${icons.arrow}</span></div><div class="mode-track"></div></button>
      <button class="mode-card multi" data-action="${welcome?'FOCUS_NAME':'NAV'}" data-page="MULTIPLAYER"><div class="mode-top"><span class="feature-icon">${icons.people}</span><span class="pill">2–6 GIOCATORI</span></div><div class="mode-bottom"><div><h3>Multiplayer</h3><p>Stessa pista. Stesse domande. Un campione.</p></div><span class="circle-arrow">${icons.arrow}</span></div><div class="mode-track"></div></button></div></section>
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
    const mine=(this.data.dedications||[]).find(d=>d.player_id===this.data.player.id);
    return this.intro('IL LIBRO DEGLI OSPITI','Per Irene e Daniele, con amore.','Una corsa insieme, un pensiero da conservare.')+
      `<section class="panel dedication-form"><form data-form="dedication"><label for="dedication">La tua dedica agli sposi</label>
      <textarea id="dedication" name="message" maxlength="800" rows="5" required placeholder="Cari Irene e Daniele…">${esc(mine?.message||'')}</textarea>
      <p>Fino a 800 caratteri. Il messaggio sarà visibile agli altri giocatori in questo libro, firmato con il tuo nickname. Puoi modificarlo e salvarlo di nuovo.</p>
      <button class="btn primary" type="submit">♥ Salva la dedica</button><span data-dedication-feedback role="status"></span></form></section>
      <h2 class="subheading">I vostri pensieri</h2><div data-guestbook class="guestbook">${this.dedicationEntries()}</div>`+this.back();
  }
  dedicationEntries() {
    const entries=this.data.dedications||[];
    return entries.length?entries.map(d=>`<article class="panel dedication-entry"><span class="dedication-heart">♥</span><p>${esc(d.message)}</p><small>— ${esc(d.nickname)} #${esc(d.tag)}</small></article>`).join(''):
      '<div class="empty-board"><h3>Il primo pensiero potrebbe essere il tuo.</h3><p>Lascia un ricordo per gli sposi.</p></div>';
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
      `<div class="help-grid">${[['01','Guida e sopravvivi.','Muoviti con ← → oppure A e D. Tieni premuto ↑, W o Shift per accelerare fino a 1,6 volte la velocità; rilascia per rallentare. Su smartphone usa i pulsanti o trascina il dito sulla pista e tieni premuto ACCELERA per aumentare la velocità. Parti con 3 vite: ogni urto ne costa una, poi hai 1,3 secondi di protezione.'],['02','Attraversa il traguardo.','Supera i gruppi di ostacoli fino al termine del percorso. Le stelle valgono +1, lo scudo assorbe un urto e il bonus tempo rallenta la strada per 4 secondi.'],['03','Pensa veloce.','Rispondi a 3 domande, con 15 secondi per ognuna. Risposta corretta: +1. Sbagliata o tempo scaduto: −2. I punteggi negativi sono possibili, ma gli errori al quiz non tolgono vite.']].map(([n,h,p])=>`<section class="panel"><span class="step-number">${n}</span><h2>${h}</h2><p>${p}</p></section>`).join('')}</div>
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
      <div class="touch-controls wedding-controls"><button data-steer="arrowleft" aria-label="Sterza a sinistra">←<span>SINISTRA</span></button><button data-steer="arrowup" data-accelerator aria-label="Tieni premuto per accelerare">↑<span>ACCELERA<small>×1,00</small></span></button><button data-steer="arrowright" aria-label="Sterza a destra">→<span>DESTRA</span></button></div><div class="wedding-plaque"><b>Irene <span>♥</span> Daniele</b><small data-power>Raccogli i bonus</small></div></section>
      <aside class="race-sidebar">${r?`<section class="panel opponents-panel"><span class="eyebrow">LA GARA IN DIRETTA</span><div data-opponents>${this.opponents()}</div><div class="deadline-note">Tempo gara <b data-countdown data-end="${r.deadline}"></b></div></section>`:
      `<section class="panel mission"><span class="eyebrow">LA TUA MISSIONE</span><span class="feature-icon lime">${icons.flag}</span><h2>Prima il traguardo.<br>Poi la sfida.</h2><p>Supera ${g.difficulty.groups} gruppi di ostacoli per sbloccare le 3 domande di questo livello.</p><div class="mini-record"><span>IL TUO RECORD</span><strong>${this.data.stats.best} <small>PT</small></strong></div></section>`}
      <section class="panel bonus-guide"><h3>Una marcia in più</h3><div><b class="lime-text">★</b><span>Stella<small>+1 punto</small></span></div><div><b class="cyan-text">⬡</b><span>Scudo<small>Assorbe un urto</small></span></div><div><b class="lavender-text">◷</b><span>Tempo lento<small>4 secondi per respirare</small></span></div></section>
      <div class="drive-controls"><span><kbd>←</kbd> <kbd>→</kbd> sterza · <kbd>↑</kbd> <kbd>W</kbd> accelera</span>${r?'':button('Ⅱ Pausa','PAUSE','secondary')} ${button(r?'Lascia la gara':'Termina partita',r?'CONFIRM_LEAVE':'CONFIRM_ABORT','ghost')}</div></aside></div>`;
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
    return `<div class="quiz-top"><span class="eyebrow">LIVELLO ${String(g.level).padStart(2,'0')} · SFIDA DI CONOSCENZA</span><span class="score-chip">${g.score} <small>PT</small></span></div>
      <section class="quiz-panel ${reveal?'revealed':''}"><div class="quiz-meta"><span class="pill">${esc(q.category)}</span><div class="question-steps">${[0,1,2].map(i=>`<i class="${i===g.qindex?'current':i<g.qindex?'complete':''}"></i>`).join('')}<span>${g.qindex+1} / 3</span></div></div>
      <div class="quiz-timing"><span>${reveal?'PROSSIMA TAPPA TRA':'TEMPO A DISPOSIZIONE'}</span><b data-countdown data-end="${g.deadline}"></b></div><div class="quiz-timer"><i data-timer-bar data-end="${g.deadline}" data-duration="${reveal?3:15}"></i></div>
      <span class="quiz-kicker">${title}</span><h1>${esc(q.question)}</h1>
      <div class="answer-grid">${q.answers.map((a,i)=>`<button class="answer ${reveal&&i===q.correct_index?'correct':''} ${reveal&&answer?.choice===i&&!answer.correct?'wrong':''}" data-action="ANSWER" data-choice="${i}" ${reveal||g.answered||!eligible?'disabled':''}><span class="answer-letter">${'ABCD'[i]}</span><span>${esc(a)}</span>${reveal&&i===q.correct_index?'<b>✓</b>':''}</button>`).join('')}</div>
      ${reveal?`<div class="quiz-feedback ${answer?.correct?'positive':''}" role="status"><strong>${eligible?(answer?.correct?'✓ +1 punto':answer?.choice===null?'◷ Tempo scaduto · −2 punti':'× −2 punti'):'Risultati della domanda'}</strong><p>Risposta corretta: <b>${esc(q.answers[q.correct_index])}</b>${q.explanation?'<br>'+esc(q.explanation):''}</p>${r?`<small>${g.correct_count} / ${g.eligible_count} risposte corrette</small>`:''}</div>`:
      `<div class="quiz-status" role="status">${!eligible?(g.phase==='DNF'?'DNF · Traguardo non raggiunto. Rientrerai al prossimo livello.':'Sei eliminato: segui la sfida come spettatore.'):
         g.answered?'✓ Risposta bloccata. In attesa degli altri giocatori…':'Ogni risposta conta. Fidati della tua prima intuizione.'}${r?`<small>${g.answer_count} / ${g.eligible_count} giocatori hanno risposto</small>`:''}</div>`}
      <div class="quiz-scoring"><span>✓ Corretta <b>+1</b></span><span>× Sbagliata o scaduta <b>−2</b></span><span>♥ Le vite restano al sicuro</span></div></section>`;
  }
  summary() {
    const g=this.data.game,delta=g.score-g.round_score;
    return `<section class="result-hero"><div class="result-symbol">${icons.flag}</div><span class="eyebrow">BEN FATTO, PILOTA</span><h1>Livello ${g.level} completato<span class="lime-text">.</span></h1><p>La prossima strada è un po' più veloce.<br>Il tuo cervello è già pronto.</p><div class="total-score">${g.score}<small>PUNTI TOTALI</small></div></section>
      <div class="summary-grid">${[['Stelle raccolte',g.round_stars],['Corrette',g.round_correct],['Sbagliate',g.round_wrong],['Punti del livello',(delta>0?'+':'')+delta],['Vite rimaste','♥'.repeat(g.lives)],['Record personale',this.data.stats.best]].map(([l,v])=>`<div class="stat-card"><span>${l}</span><strong>${v}</strong></div>`).join('')}</div>
      <div class="center-actions">${button('Continua al livello successivo '+icons.arrow,'NEXT_LEVEL')}${button('Concludi e salva','ABORT','ghost')}</div>`;
  }
  gameOver() {
    const g=this.data.game,rank=this.data.leaderboard.find(p=>p.player_id===this.data.player.id);
    return `<section class="result-hero"><span class="eyebrow">LA CORSA FINISCE. LA SFIDA CONTINUA.</span><h1>GAME <em>OVER.</em></h1><p>${g.score>=this.data.stats.best?'Il tuo record personale è qui.':'Un’altra corsa. Un nuovo traguardo.'}</p><div class="total-score">${g.score}<small>PUNTEGGIO FINALE</small></div><div class="result-chips"><span>Livello ${g.level}</span><span>Record ${this.data.stats.best} PT</span>${rank?`<span>#${rank.rank} in classifica personale</span>`:''}</div></section>
      <div class="center-actions">${button('Gioca ancora '+icons.arrow,'REPLAY')}${button('Torna al garage','HOME','secondary')}</div><div class="save-note">✓ Risultato salvato. Il prossimo record ti aspetta.</div>`;
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
    const now=(Date.now()+(this.serverOffset||0))/1000;
    this.root.querySelectorAll('[data-countdown]').forEach(el=>{el.textContent=`${Math.max(0,Math.ceil(Number(el.dataset.end)-now))}s`;});
    this.root.querySelectorAll('[data-timer-bar]').forEach(el=>{
      const fraction=Math.max(0,Math.min(1,(Number(el.dataset.end)-now)/Number(el.dataset.duration)));
      el.style.width=`${fraction*100}%`;el.classList.toggle('urgent',fraction<.25);
    });
    if(this.pending.length&&Date.now()-this.lastPacket>1700)this.flush();
  }
  click(event) {
    const el=event.target.closest('[data-action]');if(!el||el.disabled)return;
    this.audio.unlock();const action=el.dataset.action;
    if(action==='SOUND'){this.audio.toggle();el.textContent=this.audio.muted?'♪̸':'♫';el.setAttribute('aria-label',this.audio.muted?'Attiva audio':'Disattiva audio');return;}
    if(action==='FOCUS_NAME'){this.root.querySelector('#nickname')?.focus();return;}
    if(action==='PAUSE'){this.engine?.togglePause();el.textContent=this.engine?.paused?'▶ Riprendi':'Ⅱ Pausa';return;}
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
    if(action==='ANSWER'){
      const g=this.data.game;
      this.root.querySelectorAll('.answer').forEach(a=>a.disabled=true);el.classList.add('picked');
      this.send('ANSWER',{game_id:g.id,level:g.level,index:g.qindex,choice:Number(el.dataset.choice)});return;
    }
    this.send(action,action==='NAV'?{page:el.dataset.page}:{});
  }
  submit(event) {
    event.preventDefault();this.audio.unlock();const form=event.target;
    if(form.dataset.form==='register')this.send('REGISTER',{nickname:form.elements.nickname.value});
    if(form.dataset.form==='join')this.send('JOIN_ROOM',{code:form.elements.code.value});
    if(form.dataset.form==='dedication'){
      this.send('DEDICATE',{message:form.elements.message.value});
      this.dedicationSaving=true;
    }
  }
  destroy() {clearInterval(this.interval);this.engine?.destroy();}
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
