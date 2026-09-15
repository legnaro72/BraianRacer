const safeStorage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); return true; } catch { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch {} }
};
const makeId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

class ArcadeAudio {
  constructor() {
    this.muted = safeStorage.get('br:mute') !== 'false';
    this.onVisibility = () => {
      if(document.hidden)this.music?.pause();else this.startMusic();
    };
    document.addEventListener?.('visibilitychange',this.onVisibility);
  }
  startMusic() {
    if(this.muted || this.disposed || document.hidden)return;
    if(!this.music){
      this.music=new window.Audio('app/static/main.mp3');
      this.music.loop=true;this.music.volume=.22;this.music.preload='none';
      this.music.hidden=true;this.music.setAttribute('aria-hidden','true');
      document.body.append(this.music);
    }
    if(this.music.paused && !this.musicStarting){
      this.musicStarting=true;
      // Mobile browsers require the initial play to originate from a user gesture.
      this.music.play().catch(()=>{}).finally(()=>{this.musicStarting=false;});
    }
  }
  unlock() {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (Audio && !this.context) this.context = new Audio();
    this.context?.resume().catch(() => {});
    this.startMusic();
  }
  toggle() {
    this.muted = !this.muted; safeStorage.set('br:mute', String(this.muted));
    if(this.muted)this.music?.pause();else this.unlock();
  }
  destroy() {
    this.disposed=true;document.removeEventListener?.('visibilitychange',this.onVisibility);
    this.music?.pause();this.music?.remove();
    this.context?.close().catch(()=>{});
  }
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
    if(typeof Image!=='undefined' && typeof getComputedStyle!=='undefined') {
      this.coupleImage=new Image();
      const src=getComputedStyle(canvas).getPropertyValue('--couple-image').trim();
      if(src)this.coupleImage.src=src.replace(/^url\(["']?/, '').replace(/["']?\)$/, '');
    }
    this.emit = emit; this.audio = audio; this.cfg = data.difficulty;
    this.course = createCourse(data.seed, data.level, this.cfg);
    this.key = `br:drive:${data.id}:${data.level}`;
    let restored = null;
    try { restored = JSON.parse(safeStorage.get(this.key)); } catch {}
    this.state = restored || {t:0, real:0, x:.5, progress:data.progress, lives:data.lives,
      score:data.score, shield:data.shield, slowUntil:0, invulnerableUntil:-1,
      hit:[...data.hit], collected:[...data.collected], pending:[], done:false, started:false};
    this.keys = new Set(); this.particles = []; this.popups = []; this.lastFrame = 0;
    this.state.balloon_hit ||= [...(data.balloon_hit || [])];
    this.bouquets=[];this.lastBouquet=this.state.last_bouquet ?? -100;
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
      if (['ArrowLeft','ArrowRight','ArrowUp','a','A','d','D','w','W','f','F','Shift',' '].includes(e.key)) {
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
      if ((e.pointerType === 'touch' || e.pointerType === 'pen') && this.state.started) this.throwBouquet();
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
  sceneWidth() { return this.canvas.height ? 720*this.canvas.width/this.canvas.height : 480; }
  carScale() { return Math.min(1.55,Math.max(1,this.sceneWidth()/600)); }
  project(x,travel) {
    const depth=Math.max(0,(travel+.12)/.92), scale=.10+.90*depth*depth;
    return {x:this.sceneWidth()/2+(x-.5)*this.sceneWidth()*scale,
      y:158+440*depth*depth,scale};
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
    if (group.bonus === 'star') { s.score++; this.popup('+1', '#eab447'); }
    if (group.bonus === 'shield') { s.shield=true; this.popup('SCUDO', '#7ce7ff'); }
    if (group.bonus === 'slow') { s.slowUntil=s.real+4; this.popup('TEMPO LENTO', '#b5a0ff'); }
    this.audio.play(group.bonus); this.burst(s.x,.78,'#eab447',12); this.vibrate(15);
  }
  throwBouquet() {
    const s=this.state;
    if(s.done||this.paused||s.real-this.lastBouquet<.65)return;
    this.lastBouquet=s.real;s.last_bouquet=s.real;
    this.bouquets.push({x:s.x,travel:.8,shot_at:s.real,life:1.2});
    this.audio.play('star');
  }
  updateBouquets(dt) {
    const s=this.state;
    if(this.keys.has('f'))this.throwBouquet();
    for(const b of this.bouquets){
      b.travel-=dt*1.05;b.life-=dt;
      for(const g of this.course){
        if(!g.balloon||s.balloon_hit.includes(g.id)||b.life<=0)continue;
        const t=-.12+(s.t-g.spawn)*this.cfg.speed;
        if(t<0||t>.92)continue;
        if(Math.abs(t-b.travel)<.07&&Math.abs(this.laneX(g.balloonLane)-b.x)<40/this.sceneWidth()){
          b.life=0;s.balloon_hit.push(g.id);s.score+=2;
          this.event('BALLOON_POPPED',{group:g.id,shot_at:b.shot_at,at:s.real,course_t:s.t,aim:b.x});
          const p=this.project(this.laneX(g.balloonLane),t);
          this.burst(p.x/this.sceneWidth(),(p.y-72*p.scale)/720,'#ef6997',35);
          this.popup('♥ +2 PUNTI','#bf3e75');this.audio.play('correct');this.vibrate(20);break;
        }
      }
    }
    this.bouquets=this.bouquets.filter(b=>b.life>0&&b.travel>-.1);
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
    this.updateBouquets(dt);
    let direction = (this.keys.has('arrowright')||this.keys.has('d')?1:0)
                  -(this.keys.has('arrowleft')||this.keys.has('a')?1:0);
    if(this.dragging && this.target !== undefined) direction = Math.sign(this.target-s.x);
    let move=direction*dt*.85;
    if(this.dragging && Math.abs(move)>Math.abs(this.target-s.x)) move=this.target-s.x;
    const carMargin=Math.min(this.cfg.roadWidth/4,78*this.carScale()/this.sceneWidth());
    s.x=Math.max(.5-this.cfg.roadWidth/2+carMargin,Math.min(.5+this.cfg.roadWidth/2-carMargin,s.x+move));
    for(const g of this.course) {
      const y=-.12+(s.t-g.spawn)*this.cfg.speed;
      if(y < -.2 || y > 1.2) continue;
      let x=this.laneX(g.lane);
      if(g.kind==='car') x+=Math.sin(s.t*1.5+g.id)*.065;
      const visualRatio=480/this.sceneWidth();
      const halfW=(g.kind==='truck'?.057:.042)*visualRatio;
      const halfH=['car','truck'].includes(g.kind)?.082:.038;
      if(Math.abs(y-.8)<halfH+.075 && Math.abs(x-s.x)<halfW+.14*visualRatio*this.carScale()) this.hit(g);
      if(g.second!==null && Math.abs(y-.8)<.11 && Math.abs(this.laneX(g.second)-s.x)<(.04+.14*this.carScale())*visualRatio) this.hit(g);
      if(g.bonus && !s.collected.includes(g.id) && Math.abs(y-.8)<.095
           && Math.abs(this.laneX(g.bonusLane)-s.x)<.095*visualRatio) this.collect(g);
      if(s.done) break;
    }
    const progress=this.course.filter(g=>-.12+(s.t-g.spawn)*this.cfg.speed>1.12).length;
    if(progress>s.progress) s.progress=progress;
    if(s.progress>=this.cfg.groups && !s.done) {
      s.done=true; this.event('PROGRESS_UPDATE',{progress:s.progress});
      this.burst(.5,.5,'#eab447',90); this.audio.play('finish'); this.vibrate([30,30,60]);
      this.pendingFinish=performance.now()+800;
    }
  }
  roundRect(x,y,w,h,r,color) {
    const c=this.ctx; c.fillStyle=color; c.beginPath(); c.roundRect(x,y,w,h,r); c.fill();
  }
  car(x,y,color,player=false,truck=false) {
    if(player){this.weddingCar(x,y);return;}
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
  weddingCar(x,y) {
    const c=this.ctx;c.save();c.translate(x,y);c.scale(this.carScale(),this.carScale());
    c.fillStyle='#65485655';c.beginPath();c.ellipse(0,22,85,23,0,0,Math.PI*2);c.fill();
    this.roundRect(-76,-12,23,48,9,'#454253');this.roundRect(53,-12,23,48,9,'#454253');
    // Sculpted front of the convertible, with the couple above the windscreen.
    const body=c.createLinearGradient(0,-45,0,25);body.addColorStop(0,'#ffe4eb');body.addColorStop(.45,'#f9a7bf');body.addColorStop(1,'#c7557d');
    this.roundRect(-69,-42,138,72,20,body);
    c.fillStyle='#83bac3';c.beginPath();c.moveTo(-58,-40);c.lineTo(-43,-81);c.lineTo(43,-81);c.lineTo(58,-40);c.closePath();c.fill();
    c.strokeStyle='#fff3ec';c.lineWidth=5;c.stroke();
    for(const [x0,skin,hair] of [[-26,'#f5c3a0','#47302f'],[26,'#eeb68f','#eeb68f']]) {
      c.fillStyle=hair;c.beginPath();c.ellipse(x0,-83,22,29,0,0,Math.PI*2);c.fill();
      c.fillStyle=skin;c.beginPath();c.ellipse(x0,-82,17,23,0,0,Math.PI*2);c.fill();
      if(this.coupleImage?.complete && this.coupleImage.naturalWidth) {
        c.save();c.beginPath();c.ellipse(x0,-84,23,30,0,0,Math.PI*2);c.clip();
        const iw=this.coupleImage.naturalWidth,ih=this.coupleImage.naturalHeight;
        const crop=x0<0?[.115,.075,.405,.325]:[.45,.005,.315,.285];
        c.drawImage(this.coupleImage,crop[0]*iw,crop[1]*ih,crop[2]*iw,crop[3]*ih,x0-25,-115,50,64);c.restore();
      } else {c.fillStyle='#523b47';c.font='bold 17px sans-serif';c.textAlign='center';c.fillText('◡',x0,-74);}
    }
    // Lace shoulders and blue jacket under their recognizable faces.
    this.roundRect(-45,-61,39,23,8,'#fffaf0');this.roundRect(7,-61,37,23,8,'#24457a');
    c.fillStyle='#f7eadb';c.beginPath();c.moveTo(17,-60);c.lineTo(27,-43);c.lineTo(32,-60);c.fill();
    c.strokeStyle='#fff6e8';c.lineWidth=4;c.beginPath();c.moveTo(-54,-26);c.lineTo(0,5);c.lineTo(54,-26);c.stroke();
    c.fillStyle='#ee894b';for(const [xx,yy] of [[-10,-26],[0,-32],[10,-26],[0,-19]]){c.beginPath();c.arc(xx,yy,7,0,Math.PI*2);c.fill();}
    this.roundRect(-57,-13,26,15,7,'#fff5cd');this.roundRect(31,-13,26,15,7,'#fff5cd');
    this.roundRect(-59,15,118,8,4,'#fff3ea');this.roundRect(-28,9,56,20,5,'#fffaf2');
    c.fillStyle='#a13c68';c.font='bold 11px sans-serif';c.textAlign='center';c.fillText('I ♥ D',0,23);c.restore();
  }
  roadQuad(x1,x2,t1,t2,color) {
    const c=this.ctx,a=this.project(x1,t1),b=this.project(x2,t1),d=this.project(x1,t2),e=this.project(x2,t2);
    c.fillStyle=color;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.lineTo(e.x,e.y);c.lineTo(d.x,d.y);c.closePath();c.fill();
  }
  draw(wait, hidden) {
    const c=this.ctx, s=this.state, W=this.sceneWidth(),H=720;
    c.setTransform(this.canvas.width/W,0,0,this.canvas.height/H,0,0);
    c.clearRect(0,0,W,H);
    c.save();
    if(this.shake) c.translate(Math.sin(s.real*90)*this.shake*14,Math.cos(s.real*70)*this.shake*8);
    const sky=c.createLinearGradient(0,0,0,H);sky.addColorStop(0,'#a8ddf2');sky.addColorStop(.28,'#fff3d7');sky.addColorStop(1,'#9aca91');
    c.fillStyle=sky;c.fillRect(0,0,W,H);
    c.fillStyle='#fff0b4';c.beginPath();c.arc(W*.78,65,34,0,Math.PI*2);c.fill();
    for(let i=0;i<5;i++){c.fillStyle=i%2?'#aacba4':'#c1d9b3';c.beginPath();c.ellipse(W*(i/4),175,W*.27,65+i%2*22,0,0,Math.PI*2);c.fill();}
    c.fillStyle='#98c188';c.fillRect(0,185,W,H-185);
    const left=.5-this.cfg.roadWidth/2,right=.5+this.cfg.roadWidth/2;
    this.roadQuad(left,right,-.12,1.1,'#ccb9ad');
    const step=.075,shift=(s.t*this.cfg.speed)%step;
    // Perspective bands narrow to the vanishing point and move toward the viewer.
    for(let i=-1;i<17;i++){
      const t=-.12+i*step+shift, end=t+step;
      if(t<-.12)continue;
      this.roadQuad(left,right,t,end,i%2?'#ddcabc':'#e5d4c3');
      this.roadQuad(left-.012,left,t,end,i%2?'#ec94ae':'#fff5e8');
      this.roadQuad(right,right+.012,t,end,i%2?'#ec94ae':'#fff5e8');
      if(i%2)for(let lane=1;lane<3;lane++){
        const x=left+this.cfg.roadWidth*lane/3;this.roadQuad(x-.003,x+.003,t,end,'#fff9e7');
      }
    }
    const things=[];
    for(let i=0;i<11;i++){
      const t=-.12+((i*.13+s.t*this.cfg.speed*.65)%1.35);
      for(const side of [-1,1])things.push({t,type:'tree',x:.5+side*(this.cfg.roadWidth/2+.09),id:i});
    }
    for(const g of this.course){const t=-.12+(s.t-g.spawn)*this.cfg.speed;if(t>=-.12&&t<1.12){
      things.push({t,type:'group',g});
      if(g.balloon&&!s.balloon_hit.includes(g.id))things.push({t,type:'heart',x:this.laneX(g.balloonLane)});
    }}
    for(const b of this.bouquets)things.push({t:b.travel,type:'bouquet',x:b.x});
    const last=this.course[this.course.length-1],finish=-.12+(s.t-last.spawn-this.cfg.interval*.4)*this.cfg.speed;
    if(finish>=-.12&&finish<1.2)things.push({t:finish,type:'finish'});
    things.push({t:.8,type:'player'});
    things.sort((a,b)=>a.t-b.t);
    for(const thing of things){
      const t=thing.t;
      if(thing.type==='heart'||thing.type==='bouquet'){
        const p=this.project(thing.x,t);c.save();c.translate(p.x,p.y-72*p.scale);c.scale(p.scale,p.scale);
        if(thing.type==='heart'){
          c.strokeStyle='#a9788277';c.lineWidth=1.5;c.beginPath();c.moveTo(0,23);c.bezierCurveTo(12,35,-10,40,0,57);c.stroke();
          const g=c.createLinearGradient(-22,-25,20,22);g.addColorStop(0,'#ffb7cf');g.addColorStop(.45,'#ee598e');g.addColorStop(1,'#b93970');c.fillStyle=g;
          c.beginPath();c.moveTo(0,25);c.bezierCurveTo(-52,-4,-22,-42,0,-19);c.bezierCurveTo(22,-42,52,-4,0,25);c.fill();
          c.strokeStyle='#ffe6ed';c.lineWidth=3;c.beginPath();c.moveTo(-20,-9);c.quadraticCurveTo(-20,-22,-10,-19);c.stroke();
        }else{
          c.rotate(-.35);c.strokeStyle='#629465';c.lineWidth=5;c.beginPath();c.moveTo(0,19);c.lineTo(-6,-5);c.moveTo(0,19);c.lineTo(7,-5);c.stroke();
          for(const [xx,yy,col] of [[-8,-8,'#ff9e65'],[7,-10,'#ef759f'],[0,-19,'#ffc57b'],[0,-4,'#ffb1c7']]){c.fillStyle=col;c.beginPath();c.arc(xx,yy,8,0,Math.PI*2);c.fill();c.strokeStyle='#fff1db';c.lineWidth=1.5;c.stroke();}
          c.fillStyle='#fff2e4';c.fillRect(-6,9,12,5);
        }c.restore();continue;
      }
      if(thing.type==='finish'){
        for(let row=0;row<2;row++)for(let col=0;col<16;col++)this.roadQuad(left+col*this.cfg.roadWidth/16,left+(col+1)*this.cfg.roadWidth/16,t+row*.015,t+(row+1)*.015,(row+col)%2?'#fff8ec':'#7a526d');
        const f=this.project(.5,t);c.fillStyle='#93536d';c.textAlign='center';c.font=`bold ${Math.max(8,22*f.scale)}px sans-serif`;c.fillText('VIVA GLI SPOSI!',f.x,f.y-12*f.scale);continue;
      }
      if(thing.type==='player'){
        const p=this.project(s.x,.8);
        if(s.shield){c.strokeStyle='#50b9cf';c.lineWidth=5;c.beginPath();c.ellipse(p.x,p.y-38,88,91,0,0,Math.PI*2);c.stroke();}
        if(s.real>=s.invulnerableUntil||Math.floor(s.real*12)%2===0)this.weddingCar(p.x,p.y);
        continue;
      }
      if(thing.type==='tree'){
        const p=this.project(thing.x,t);c.save();c.translate(p.x,p.y);c.scale(p.scale,p.scale);
        c.fillStyle='#617d6844';c.beginPath();c.ellipse(9,4,36,10,0,0,Math.PI*2);c.fill();
        this.roundRect(-5,-58,10,60,3,'#aa8465');
        for(const [xx,yy,r] of [[0,-76,33],[-20,-52,25],[20,-52,25]]){c.fillStyle='#6ba77b';c.beginPath();c.arc(xx,yy,r,0,Math.PI*2);c.fill();}
        c.fillStyle='#9fcb95';c.beginPath();c.arc(-10,-83,22,0,Math.PI*2);c.fill();
        c.fillStyle=thing.id%2?'#f7a8b9':'#fff1c5';for(let f=0;f<5;f++){c.beginPath();c.arc(-24+f*11,-56+(f%2)*17,5,0,Math.PI*2);c.fill();}c.restore();continue;
      }
      const g=thing.g;
      const obstacle=(x,kind)=>{
        const p=this.project(x,t);c.save();c.translate(p.x,p.y);c.scale(p.scale,p.scale);
        c.fillStyle='#73535e44';c.beginPath();c.ellipse(5,5,30,9,0,0,Math.PI*2);c.fill();
        if(kind==='car'||kind==='truck')this.car(0,-25,kind==='car'?'#9b8bd1':'#71a7b3',false,kind==='truck');
        else if(kind==='cone'){
          this.roundRect(-22,-3,44,9,4,'#c57647');c.fillStyle='#ed9b56';c.beginPath();c.moveTo(0,-52);c.lineTo(18,0);c.lineTo(-18,0);c.fill();c.fillStyle='#fff3d0';c.fillRect(-10,-22,20,7);
        }else if(kind==='oil'){c.fillStyle='#5b5968';c.beginPath();c.ellipse(0,0,28,10,0,0,Math.PI*2);c.fill();}
        else{this.roundRect(-28,-33,56,31,5,'#e0a15c');c.fillStyle='#fff1cb';for(let k=0;k<3;k++)c.fillRect(-23+k*19,-30,8,24);}
        c.restore();
      };
      let x=this.laneX(g.lane);if(g.kind==='car')x+=Math.sin(s.t*1.5+g.id)*.065;
      obstacle(x,g.kind);if(g.second!==null)obstacle(this.laneX(g.second),'barrier');
      if(g.bonus&&!s.collected.includes(g.id)){
        const p=this.project(this.laneX(g.bonusLane),t);c.save();c.translate(p.x,p.y-18*p.scale);c.scale(p.scale,p.scale);
        c.fillStyle='#a67d4044';c.beginPath();c.ellipse(3,20,18,5,0,0,Math.PI*2);c.fill();
        c.fillStyle=g.bonus==='star'?'#ffd266':g.bonus==='shield'?'#88d5e3':'#c9b5ed';c.beginPath();c.arc(0,0,20,0,Math.PI*2);c.fill();c.strokeStyle='#fff7df';c.lineWidth=3;c.stroke();
        c.fillStyle='#845f53';c.font='bold 25px sans-serif';c.textAlign='center';c.fillText(g.bonus==='star'?'★':g.bonus==='shield'?'⬡':'◷',0,9);c.restore();
      }
    }
    for(const p of this.particles){c.globalAlpha=Math.min(1,p.life*2);c.fillStyle=p.color;c.fillRect(p.x*W,p.y*H,4,6);}c.globalAlpha=1;
    for(const p of this.popups){c.globalAlpha=p.ttl;c.fillStyle=p.color;c.font='900 27px sans-serif';c.textAlign='center';c.fillText(p.text,p.x*W,p.y*H);}c.globalAlpha=1;
    c.restore();
    let title='',sub='';
    if(wait>0){title=String(Math.ceil(wait));sub='PARTENZA TRA…';}
    else if(this.paused||hidden){title='PAUSA';sub=this.data.mode==='multi'?'Il tempo della gara continua':'Premi Spazio o Riprendi';}
    else if(s.done){title=s.lives>0?'TRAGUARDO!':'GAME OVER';sub=s.lives>0?'Preparati a pensare veloce.':'Ogni corsa ti rende più forte.';}
    if(title){c.fillStyle='#fff6e9e8';c.fillRect(0,0,W,H);c.textAlign='center';c.fillStyle='#eab447';
      c.font=`900 ${wait>0?140:42}px sans-serif`;c.fillText(title,W/2,H*.48);c.font='14px sans-serif';c.fillStyle='#77576a';c.fillText(sub,W/2,H*.56);}
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
