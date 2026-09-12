const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

class ArcadeAudio {
  constructor() { this.muted = safeStorage.get('br:mute') !== 'false'; }
  unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio && !this.context) this.context = new Audio();
    this.context?.resume().catch(() => {});
  }
  toggle() { this.muted = !this.muted; safeStorage.set('br:mute', String(this.muted)); this.unlock(); }
  play(kind) {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const frequencies = {star:880, shield:600, slow:260, collision:90, finish:1046,
                         correct:784, wrong:150, countdown:440, start:880, victory:1174};
    const ctx = this.context, oscillator = ctx.createOscillator(), gain = ctx.createGain();
    oscillator.type = ['collision', 'wrong'].includes(kind) ? 'sawtooth' : 'sine';
    oscillator.frequency.setValueAtTime(frequencies[kind] || 440, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime((frequencies[kind] || 440) * 1.4, ctx.currentTime + .14);
    gain.gain.setValueAtTime(.065, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .22);
    oscillator.connect(gain); gain.connect(ctx.destination);
    oscillator.start(); oscillator.stop(ctx.currentTime + .23);
  }
}

class DrivingEngine {
  constructor(canvas, data, emit, audio) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.data = data;
    this.emit = emit; this.audio = audio; this.cfg = data.difficulty;
    this.course = createCourse(data.seed, data.level, this.cfg);
    this.key = `br:drive:${data.id}:${data.level}`;
    let restored = null;
    try { restored = JSON.parse(safeStorage.get(this.key)); } catch {}
    this.state = restored || {t:0, real:0, x:.5, progress:data.progress, lives:data.lives,
      score:data.score, shield:data.shield, slowUntil:0, invulnerableUntil:-1,
      hit:[...data.hit], collected:[...data.collected], pending:[], done:false, started:false};
    this.keys = new Set(); this.particles = []; this.popups = []; this.lastFrame = 0;
    this.state.acceleration = Math.max(1, Math.min(this.cfg.maxAcceleration || 1.6, this.state.acceleration || 1));
    this.frame = 0; this.lastSend = 0; this.shake = 0; this.countdown = null;
    this.offset = data.serverNow * 1000 - Date.now(); this.paused = false;
    this.pendingFinish = null; this.dragging = false;
    if (this.state.done && this.state.lives > 0 && !this.state.pending.some(e=>e.event_type==='LEVEL_COMPLETED')) {
      this.pendingFinish = performance.now() + 500;
    }
    if (!restored && data.progress > 0) {
      // Recover the official checkpoint if browser storage is unavailable.
      this.state.t = this.course[data.progress - 1].spawn + 1.26 / this.cfg.speed;
      this.state.real = this.state.t;
    }
    this.onKeyDown = e => {
      if (['INPUT','TEXTAREA'].includes(e.target.tagName)) return;
      if (['ArrowLeft','ArrowRight','ArrowUp','a','A','d','D','w','W','Shift',' '].includes(e.key)) {
        e.preventDefault(); this.audio.unlock();
        if (e.key === ' ' && !e.repeat) this.togglePause(); else this.keys.add(e.key.toLowerCase());
      }
    };
    this.onKeyUp = e => this.keys.delete(e.key.toLowerCase());
    this.onBlur = () => { this.keys.clear(); this.dragging = false; this.persist(); };
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    this.down = e => { e.preventDefault(); canvas.focus(); this.audio.unlock();
      this.dragging = true; canvas.setPointerCapture(e.pointerId); this.steer(e); };
    this.move = e => { if (this.dragging) { e.preventDefault(); this.steer(e); } };
    this.up = () => { this.dragging = false; };
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    this.resize = new ResizeObserver(() => this.resizeCanvas());
    this.resize.observe(canvas); this.resizeCanvas();
    this.frame = requestAnimationFrame(t => this.loop(t));
  }
  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
  }
  steer(e) {
    const rect = this.canvas.getBoundingClientRect();
    this.target = Math.max(.1, Math.min(.9, (e.clientX - rect.left) / rect.width));
  }
  togglePause() { if (this.data.mode === 'single') { this.paused = !this.paused; this.keys.clear(); } }
  sync(data) {
    this.data = data;
    const acks = new Set(data.acks || []);
    this.state.pending = this.state.pending.filter(e => !acks.has(e.event_id));
    if (!this.state.pending.length) {
      this.state.lives = data.lives; this.state.score = data.score; this.state.shield = data.shield;
    }
  }
  event(kind, payload = {}) {
    this.state.pending.push({event_id:makeId(), event_type:kind, timestamp:Date.now(), payload});
    this.persist();
  }
  send() {
    if (this.state.pending.length) this.emit(this.state.pending.slice(0,120));
    this.persist();
  }
  persist() { safeStorage.set(this.key, JSON.stringify(this.state)); }
  laneX(lane, t = this.state.t) {
    const curve = this.data.level >= 4 ? Math.sin(t * .12) * .025 : 0;
    return .5 + (lane - 1) * this.cfg.roadWidth / 3 + curve;
  }
  popup(text, color) { this.popups.push({text, color, ttl:1, x:this.state.x, y:.7}); }
  burst(x, y, color, count=20) {
    for(let i=0;i<count;i++) this.particles.push({x,y,vx:(Math.random()-.5)*.55,
      vy:(Math.random()-.5)*.65,life:.4+Math.random()*.5,color});
  }
  vibrate(pattern) { try { navigator.vibrate?.(pattern); } catch {} }
  hit(group) {
    const s = this.state;
    if (s.real < s.invulnerableUntil || s.hit.includes(group.id)) return;
    s.hit.push(group.id); s.invulnerableUntil = s.real + 1.3;
    this.event('COLLISION', {group:group.id, at:s.real});
    if (s.shield) { s.shield = false; this.popup('SCUDO USATO', '#7ce7ff'); this.audio.play('shield'); }
    else { s.lives--; this.popup('−1 VITA', '#ff718c'); this.audio.play('collision'); this.shake=.35;
      this.burst(s.x,.8,'#ff9a66',28); this.vibrate([50,30,50]); }
    if (s.lives <= 0) { s.done = true; this.send(); }
  }
  collect(group) {
    const s = this.state;
    s.collected.push(group.id); this.event('BONUS_COLLECTED', {group:group.id});
    if (group.bonus === 'star') { s.score++; this.popup('+1', '#ceff5f'); }
    if (group.bonus === 'shield') { s.shield=true; this.popup('SCUDO', '#7ce7ff'); }
    if (group.bonus === 'slow') { s.slowUntil=s.real+4; this.popup('TEMPO LENTO', '#b5a0ff'); }
    this.audio.play(group.bonus); this.burst(s.x,.78,'#ceff5f',12); this.vibrate(15);
  }
  loop(timestamp) {
    const dt = Math.min(.035, Math.max(0,(timestamp-(this.lastFrame || timestamp))/1000));
    this.lastFrame = timestamp;
    const now = (Date.now()+this.offset)/1000;
    const wait = this.data.start_at - now;
    if (wait > 0) {
      const number = Math.ceil(wait);
      if (number !== this.countdown) { this.countdown=number; this.audio.play('countdown'); }
    } else if (!this.state.started) {
      this.state.started=true; this.event('GAME_STARTED'); this.audio.play('start');
    }
    const hidden = document.hidden;
    if (wait <= 0 && !hidden && !this.paused && !this.state.done) this.update(dt);
    if (this.pendingFinish && timestamp > this.pendingFinish) {
      this.pendingFinish=null; this.event('LEVEL_COMPLETED'); this.send();
    }
    for (const p of this.particles) { p.x+=p.vx*dt; p.y+=p.vy*dt; p.life-=dt; }
    this.particles=this.particles.filter(p=>p.life>0).slice(-180);
    for (const p of this.popups) { p.ttl-=dt; p.y-=dt*.13; }
    this.popups=this.popups.filter(p=>p.ttl>0);
    this.shake=Math.max(0,this.shake-dt);
    this.draw(wait, hidden);
    if (timestamp - this.lastSend > 850) {
      this.lastSend=timestamp;
      if (!this.state.done && this.state.started) this.event('PROGRESS_UPDATE',{progress:this.state.progress});
      this.send();
    }
    this.frame=requestAnimationFrame(t=>this.loop(t));
  }
  update(dt) {
    const s=this.state;
    const accelerating = this.keys.has('arrowup') || this.keys.has('w') || this.keys.has('shift');
    const targetSpeed = accelerating ? (this.cfg.maxAcceleration || 1.6) : 1;
    // Exponential response is stable at different frame rates and eases on release.
    s.acceleration = targetSpeed + (s.acceleration - targetSpeed) * Math.exp(-5 * dt);
    s.real+=dt; s.t+=dt*s.acceleration*(s.real<s.slowUntil?.62:1);
    let direction = (this.keys.has('arrowright')||this.keys.has('d')?1:0)
                  -(this.keys.has('arrowleft')||this.keys.has('a')?1:0);
    if(this.dragging && this.target !== undefined) direction = Math.sign(this.target-s.x);
    let move=direction*dt*.85;
    if(this.dragging && Math.abs(move)>Math.abs(this.target-s.x)) move=this.target-s.x;
    s.x=Math.max(.5-this.cfg.roadWidth/2+.045,Math.min(.5+this.cfg.roadWidth/2-.045,s.x+move));
    for(const g of this.course) {
      const y=-.12+(s.t-g.spawn)*this.cfg.speed;
      if(y < -.2 || y > 1.2) continue;
      let x=this.laneX(g.lane);
      if(g.kind==='car') x+=Math.sin(s.t*1.5+g.id)*.065;
      const halfW=g.kind==='truck'?.057:.042;
      const halfH=['car','truck'].includes(g.kind)?.082:.038;
      if(Math.abs(y-.8)<halfH+.052 && Math.abs(x-s.x)<halfW+.032) this.hit(g);
      if(g.second!==null && Math.abs(y-.8)<.09 && Math.abs(this.laneX(g.second)-s.x)<.075) this.hit(g);
      if(g.bonus && !s.collected.includes(g.id) && Math.abs(y-.8)<.067
           && Math.abs(this.laneX(g.bonusLane)-s.x)<.067) this.collect(g);
      if(s.done) break;
    }
    const progress=this.course.filter(g=>-.12+(s.t-g.spawn)*this.cfg.speed>1.12).length;
    if(progress>s.progress) s.progress=progress;
    if(s.progress>=this.cfg.groups && !s.done) {
      s.done=true; this.event('PROGRESS_UPDATE',{progress:s.progress});
      this.burst(.5,.5,'#ceff5f',90); this.audio.play('finish'); this.vibrate([30,30,60]);
      this.pendingFinish=performance.now()+800;
    }
  }
  roundRect(x,y,w,h,r,color) {
    const c=this.ctx; c.fillStyle=color; c.beginPath(); c.roundRect(x,y,w,h,r); c.fill();
  }
  car(x,y,color,player=false,truck=false) {
    const c=this.ctx, w=truck?53:39, h=truck?105:74;
    c.save(); c.translate(x,y);
    this.roundRect(-w/2-5,-h/2+10,7,18,2,'#03050b');
    this.roundRect(w/2-2,-h/2+10,7,18,2,'#03050b');
    this.roundRect(-w/2-5,h/2-23,7,18,2,'#03050b');
    this.roundRect(w/2-2,h/2-23,7,18,2,'#03050b');
    c.shadowColor=player?'#f6b5ce':'transparent'; c.shadowBlur=player?16:0;
    this.roundRect(-w/2,-h/2,w,h,8,color); c.shadowBlur=0;
    this.roundRect(-w/2+4,-h/2+16,w-8,18,4,'#102331');
    this.roundRect(-w/2+5,h/2-19,w-10,10,3,'#13232c');
    this.roundRect(-w/2+4,-h/2+3,8,5,2,'#edfff8');
    this.roundRect(w/2-12,-h/2+3,8,5,2,'#edfff8');
    this.roundRect(-w/2+3,h/2-6,8,3,1,'#ff526b');
    this.roundRect(w/2-11,h/2-6,8,3,1,'#ff526b');
    if(player) {
      // Wedding ribbons and bouquet, with two passengers behind the windshield.
      c.strokeStyle='#d781a8';c.lineWidth=2;c.beginPath();
      c.moveTo(-w/2+3,-h/2+3);c.lineTo(0,-h/2+15);c.lineTo(w/2-3,-h/2+3);c.stroke();
      for(const [fx,fy] of [[-4,-26],[3,-26],[0,-30]]) {
        c.fillStyle='#f3a8c2';c.beginPath();c.arc(fx,fy,3.5,0,Math.PI*2);c.fill();
      }
      c.fillStyle='#f5d1b0';for(const px of [-7,7]){c.beginPath();c.arc(px,-12,4,0,Math.PI*2);c.fill();}
      c.fillStyle='#ffffff';c.beginPath();c.moveTo(-11,-10);c.lineTo(-14,-2);c.lineTo(-2,-2);c.fill();
      c.fillStyle='#18222d';c.fillRect(3,-8,8,7);
      c.fillStyle='#b66089';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText('♥',0,11);
      this.roundRect(-16,h/2-2,32,10,2,'#fff5f9');
      c.fillStyle='#87536e';c.font='bold 7px sans-serif';c.fillText('I & D',0,h/2+5);
      c.strokeStyle='#ad9daf';c.lineWidth=1;
      for(const px of [-11,11]){c.beginPath();c.moveTo(px,h/2+8);c.lineTo(px+Math.sin(this.state.t*10+px)*3,h/2+20);c.stroke();
        this.roundRect(px-3,h/2+18,6,9,2,'#b7c6d0');}
    }
    c.restore();
  }
  draw(wait, hidden) {
    const c=this.ctx, s=this.state, W=480,H=720;
    c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);
    c.clearRect(0,0,W,H);
    c.save();
    if(this.shake) c.translate(Math.sin(s.real*90)*this.shake*14,Math.cos(s.real*70)*this.shake*8);
    c.fillStyle='#09111a'; c.fillRect(0,0,W,H);
    const roadW=this.cfg.roadWidth*W, left=(W-roadW)/2;
    c.fillStyle='#181e28'; c.fillRect(left,0,roadW,H);
    const glow=c.createLinearGradient(0,0,W,0);
    glow.addColorStop(0,'#112631');glow.addColorStop(.25,'#18212c');glow.addColorStop(.75,'#18212c');glow.addColorStop(1,'#122931');
    c.fillStyle=glow;c.fillRect(left,0,roadW,H);
    // Quiet asphalt grain: procedural, fixed, and inexpensive.
    c.fillStyle='#26303d';
    for(let i=0;i<75;i++){const x=left+((i*173)%roadW),y=(i*47+s.t*95)%H;c.fillRect(x,y,1,3);}
    const scroll=s.t*this.cfg.speed*H;
    for(let lane=1;lane<3;lane++) {
      c.fillStyle='#526275';
      for(let j=-1;j<12;j++) c.fillRect(left+roadW*lane/3-1,(j*88+scroll%88),2,35);
    }
    for(let y=-64;y<H+64;y+=64) {
      const yy=y+scroll%64;
      c.fillStyle=(Math.floor(y/64)%2)?'#6ddbec':'#255269';
      c.fillRect(left-4,yy,4,34); c.fillRect(left+roadW,yy,4,34);
      c.fillStyle='#172d35'; c.fillRect(5,yy+10,Math.max(5,left-16),18); c.fillRect(left+roadW+12,yy+10,26,18);
    }
    c.shadowBlur=12;c.shadowColor='#62ddf3';c.fillStyle='#5cd2e2';
    c.fillRect(left-1,0,1,H);c.fillRect(left+roadW,0,1,H);c.shadowBlur=0;
    // Road signs and roadside lights vary by course position.
    c.fillStyle='#447267'; c.font='bold 10px monospace'; c.textAlign='center';
    c.fillText(String(this.data.level).padStart(2,'0'),left/2,((scroll*.7)%700));
    for(const g of this.course) {
      const y=(-.12+(s.t-g.spawn)*this.cfg.speed)*H;
      if(y < -120 || y > H+100) continue;
      let x=this.laneX(g.lane)*W;
      if(g.kind==='car') x+=Math.sin(s.t*1.5+g.id)*.065*W;
      const obstacle=(xx,kind)=>{
        if(kind==='car'||kind==='truck') this.car(xx,y,kind==='car'?'#a091d0':'#667f94',false,kind==='truck');
        else if(kind==='cone') {
          this.roundRect(xx-20,y+14,40,7,3,'#c15a37'); c.fillStyle='#ff9b52';c.beginPath();
          c.moveTo(xx,y-25);c.lineTo(xx+15,y+16);c.lineTo(xx-15,y+16);c.fill();
          c.fillStyle='#fff0ca';c.fillRect(xx-8,y-2,16,6);
        } else if(kind==='oil') {
          c.fillStyle='#071016';c.beginPath();c.ellipse(xx,y,27,18,.3,0,Math.PI*2);c.fill();
          c.strokeStyle='#655179';c.lineWidth=2;c.beginPath();c.ellipse(xx,y,17,8,.3,0,Math.PI*2);c.stroke();
        } else {
          this.roundRect(xx-27,y-15,54,30,4,'#e6a457');
          c.fillStyle='#333142';for(let i=0;i<3;i++)c.fillRect(xx-22+i*19,y-11,8,22);
        }
      };
      obstacle(x,g.kind); if(g.second!==null)obstacle(this.laneX(g.second)*W,'barrier');
      if(g.bonus&&!s.collected.includes(g.id)) {
        const bx=this.laneX(g.bonusLane)*W;
        const color=g.bonus==='star'?'#ceff5f':g.bonus==='shield'?'#78e7ff':'#baa2ff';
        c.shadowColor=color;c.shadowBlur=18;c.fillStyle=color;c.beginPath();c.arc(bx,y,17,0,Math.PI*2);c.fill();c.shadowBlur=0;
        c.fillStyle='#122021';c.font='bold 22px sans-serif';c.textAlign='center';c.fillText(g.bonus==='star'?'★':g.bonus==='shield'?'⬡':'◷',bx,y+8);
      }
    }
    const last=this.course[this.course.length-1];
    const finishY=(-.12+(s.t-last.spawn-this.cfg.interval*.4)*this.cfg.speed)*H;
    if(finishY> -60) {
      for(let row=0;row<2;row++)for(let col=0;col<16;col++) {
        c.fillStyle=(row+col)%2?'#e4ecf0':'#10141c';c.fillRect(left+col*roadW/16,finishY+row*18,roadW/16,18);
      }
      c.font='bold 15px sans-serif';c.textAlign='center';c.fillStyle='#ceff5f';c.fillText('TRAGUARDO',W/2,finishY-12);
    }
    if(s.shield) {c.strokeStyle='#78e7ff';c.lineWidth=2;c.shadowColor='#78e7ff';c.shadowBlur=20;
      c.beginPath();c.ellipse(s.x*W,.8*H,34,53,0,0,Math.PI*2);c.stroke();c.shadowBlur=0;}
    if(s.real>=s.invulnerableUntil || Math.floor(s.real*12)%2===0) this.car(s.x*W,.8*H,'#fff4ec',true);
    for(const p of this.particles){c.globalAlpha=Math.min(1,p.life*2);c.fillStyle=p.color;c.fillRect(p.x*W,p.y*H,4,6);}c.globalAlpha=1;
    for(const p of this.popups){c.globalAlpha=p.ttl;c.fillStyle=p.color;c.font='900 27px sans-serif';c.textAlign='center';c.fillText(p.text,p.x*W,p.y*H);}c.globalAlpha=1;
    c.restore();
    let title='',sub='';
    if(wait>0){title=String(Math.ceil(wait));sub='PARTENZA TRA…';}
    else if(this.paused||hidden){title='PAUSA';sub=this.data.mode==='multi'?'Il tempo della gara continua':'Premi Spazio o Riprendi';}
    else if(s.done){title=s.lives>0?'TRAGUARDO!':'GAME OVER';sub=s.lives>0?'Preparati a pensare veloce.':'Ogni corsa ti rende più forte.';}
    if(title){c.fillStyle='#080e18c9';c.fillRect(0,0,W,H);c.textAlign='center';c.fillStyle='#ceff5f';
      c.font=`900 ${wait>0?140:42}px sans-serif`;c.fillText(title,W/2,H*.48);c.font='14px sans-serif';c.fillStyle='#edf0f4';c.fillText(sub,W/2,H*.56);}
    const root=this.canvas.closest('.race-layout');
    if(root){root.querySelector('[data-local-score]').textContent=s.score;
      root.querySelector('[data-local-lives]').textContent='♥'.repeat(Math.max(0,s.lives))+'♡'.repeat(Math.max(0,3-s.lives));
      root.querySelector('[data-local-progress]').textContent=`${s.progress} / ${this.cfg.groups}`;
      root.querySelector('[data-local-bar]').style.width=`${s.progress/this.cfg.groups*100}%`;
      root.querySelector('[data-power]').textContent=s.shield?'⬡ Scudo attivo':s.real<s.slowUntil?'◷ Tempo lento':'Raccogli i bonus sul percorso';}
    const accelerator=root?.querySelector('[data-accelerator]');
    if(accelerator){accelerator.classList.toggle('accelerating',s.acceleration>1.05);
      accelerator.querySelector('small').textContent=`×${s.acceleration.toFixed(2).replace('.',',')}`;}
  }
  destroy() {
    this.persist(); cancelAnimationFrame(this.frame); this.resize.disconnect();
    window.removeEventListener('keydown',this.onKeyDown);window.removeEventListener('keyup',this.onKeyUp);window.removeEventListener('blur',this.onBlur);
    this.canvas.removeEventListener('pointerdown',this.down);this.canvas.removeEventListener('pointermove',this.move);
    this.canvas.removeEventListener('pointerup',this.up);this.canvas.removeEventListener('pointercancel',this.up);
  }
}
