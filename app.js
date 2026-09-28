/**
 * RotaPro Architecture (Iteration 4 - Modularized)
 * Core Logic separated into app.js
 */

/* ─── UTILITIES ─── */
const $ = id => document.getElementById(id);
const clamp = (v,lo,hi) => Math.max(lo, Math.min(hi,v));
const hav = (a,b,c,d) => {
  const R=6371, dr=Math.PI/180;
  const x = Math.sin((c-a)*dr/2)**2 + Math.cos(a*dr)*Math.cos(c*dr)*Math.sin((d-b)*dr/2)**2;
  return R*2*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
};

/* ─── CLASS: Config ─── */
class Config {
  constructor() {
    this.autoCenter = true;
    this.rotateMode = true;
    this.soundOn = true;
    this.wakeOn = true;
    this.threshold = 10;
    this.load();
  }
  load() {
    const s = localStorage.getItem('rp6');
    if (s) {
      try {
        const o = JSON.parse(s);
        this.autoCenter = o.ac !== false;
        this.rotateMode = o.rot !== false;
        this.soundOn = o.snd !== false;
        this.wakeOn = o.wk !== false;
        this.threshold = o.thr || 10;
      } catch(e) {}
    }
  }
  save(ac, rot, snd, wk, thr) {
    this.autoCenter = ac; this.rotateMode = rot; this.soundOn = snd; this.wakeOn = wk; this.threshold = thr;
    localStorage.setItem('rp6', JSON.stringify({ ac, rot, snd, wk, thr }));
  }
}

/* ─── CLASS: SheetManager (Bottom Sheet Physics) ─── */
class SheetManager {
  constructor() {
    this.bg = $('sheet-bg');
    this.sheet = $('sheet');
    this.handle = $('sheet-handle');
    this.isOpen = false;
    this.startY = 0; this.currentY = 0; this.dragging = false;
    this.bindEvents();
  }
  bindEvents() {
    $('btn-cfg').addEventListener('click', () => this.open());
    $('btn-save').addEventListener('click', () => this.close());
    
    this.handle.addEventListener('touchstart', e => this.onDragStart(e), {passive:true});
    document.addEventListener('touchmove', e => this.onDragMove(e), {passive:false});
    document.addEventListener('touchend', e => this.onDragEnd(e));
    
    this.handle.addEventListener('mousedown', e => this.onDragStart(e));
    document.addEventListener('mousemove', e => this.onDragMove(e));
    document.addEventListener('mouseup', e => this.onDragEnd(e));
    
    this.bg.addEventListener('click', e => { if(e.target===this.bg) this.close(); });
  }
  open() {
    this.bg.style.display = 'flex';
    void this.bg.offsetWidth; 
    this.bg.classList.add('open');
    this.sheet.classList.add('open');
    this.isOpen = true;
  }
  close() {
    this.sheet.classList.remove('open');
    this.bg.classList.remove('open');
    this.isOpen = false;
    setTimeout(() => { if(!this.isOpen) this.bg.style.display = 'none'; }, 400);
  }
  
  onDragStart(e) {
    if(!this.isOpen) return;
    this.dragging = true;
    this.startY = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    this.sheet.classList.add('dragging');
  }
  onDragMove(e) {
    if(!this.dragging) return;
    const y = e.type.includes('mouse') ? e.clientY : e.touches[0].clientY;
    this.currentY = Math.max(0, y - this.startY);
    this.sheet.style.transform = `translateY(${this.currentY}px)`;
    const opacity = 1 - (this.currentY / window.innerHeight);
    this.bg.style.backgroundColor = `rgba(0,0,0,${Math.max(0, opacity * 0.6)})`;
    if(this.currentY > 0) e.preventDefault();
  }
  onDragEnd(e) {
    if(!this.dragging) return;
    this.dragging = false;
    this.sheet.classList.remove('dragging');
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    
    if(this.currentY > 120) this.close();
    this.currentY = 0;
  }
}

/* ─── CLASS: RotaMap ─── */
class RotaMap {
  constructor() {
    this.map = L.map('map', {center:[39.92,32.85], zoom:15, zoomControl:false, attributionControl:false, preferCanvas:true});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(this.map);
    this.uMk = null; this.uCr = null; this.rLine = null; this.rPts = [];
    this.initGauge();
  }
  initGauge() {
    const g=$('ticks'), R=85;
    for(let i=0;i<=22;i++){
      const a=(150+i*(240/22))*Math.PI/180, r1=R-(i%5===0?8:4), r2=R+1;
      const l=document.createElementNS('http://www.w3.org/2000/svg','line');
      l.setAttribute('x1',100+Math.cos(a)*r1); l.setAttribute('y1',100+Math.sin(a)*r1);
      l.setAttribute('x2',100+Math.cos(a)*r2); l.setAttribute('y2',100+Math.sin(a)*r2);
      l.setAttribute('stroke','#fff'); l.setAttribute('stroke-width',i%5===0?'2':'1');
      l.setAttribute('stroke-linecap','round'); g.appendChild(l);
    }
  }
  
  updateUser(la, ln, ac, hdg, rotateMode) {
    const rotDeg = (rotateMode && hdg != null && !isNaN(hdg)) ? hdg : 0;
    
    const arrowSVG = `
      <svg class="nav-arrow" viewBox="0 0 24 24" style="transform: rotate(${rotDeg}deg);">
        <path d="M12 2L2 22l10-4 10 4L12 2z" fill="var(--accent)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    `;
    
    if(!this.uMk) {
      this.uMk = L.marker([la,ln], {icon:L.divIcon({className:'',
        html: arrowSVG, iconSize:[32,32], iconAnchor:[16,16]})}).addTo(this.map);
      this.uCr = L.circle([la,ln], {radius:20, color:'#2d7aff', fillColor:'#2d7aff', fillOpacity:0.1, weight:1.5}).addTo(this.map);
    } else {
      this.uMk.setLatLng([la,ln]); this.uCr.setLatLng([la,ln]);
      this.uMk.setIcon(L.divIcon({className:'', html: arrowSVG, iconSize:[32,32], iconAnchor:[16,16]}));
      if(ac) this.uCr.setRadius(clamp(ac, 8, 200));
    }
  }
  
  addRoutePoint(la, ln) {
    this.rPts.push([la,ln]);
    if(this.rPts.length > 1) {
      if(!this.rLine) this.rLine = L.polyline(this.rPts, {color:'#2d7aff', weight:4, opacity:0.8}).addTo(this.map);
      else this.rLine.setLatLngs(this.rPts);
    }
  }
  clearRoute() {
    this.rPts = [];
    if(this.rLine) { this.map.removeLayer(this.rLine); this.rLine = null; }
  }
  center(la, ln) {
    this.map.setView([la,ln], this.map.getZoom(), {animate:true, duration:0.4});
  }
  addHazard(la, ln) {
    const ts = Date.now();
    const mk = L.marker([la,ln], {icon:L.divIcon({className:'',
      html:`<div class="hz-dot"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>`,
      iconSize:[24,24], iconAnchor:[12,12]})}).addTo(this.map);
    setTimeout(() => this.map.removeLayer(mk), 1800000);
  }
}

/* ─── CLASS: AppManager ─── */
class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.map = new RotaMap();
    
    this.state = {
      lat:null, lng:null, spd:0, hdg:null, alt:null, acc:null,
      lim:null, maxSpd:0, avgSpd:0, sumSpd:0, spdN:0,
      dist:0, start:null, prev:null, tracking:false, gpsOn:false,
      smoothV:0, dataAge:null, lastTK:''
    };
    
    this.timers = { lim:null, wx:null, geo:null };
    this.cache = { lim:{ts:0,la:0,ln:0}, wx:{ts:0, code:null}, geo:{ts:0} };
    this.wakeLock = null;

    this.bindUI();
    this.startClock();
    
    $('o-center').checked = this.cfg.autoCenter;
    $('o-rotate').checked = this.cfg.rotateMode;
    $('o-sound').checked = this.cfg.soundOn;
    $('o-wake').checked = this.cfg.wakeOn;
    $('o-thr').value = this.cfg.threshold;
    
    setTimeout(()=>this.map.map.invalidateSize(), 300);
    window.addEventListener('resize', ()=>this.map.map.invalidateSize());
    
    this.checkAutoStart();
  }
  
  bindUI() {
    this.map.map.on('dragstart', () => { this.cfg.autoCenter = false; $('o-center').checked = false; });
    
    $('btn-save').addEventListener('click', () => {
      this.cfg.save( $('o-center').checked, $('o-rotate').checked, $('o-sound').checked, $('o-wake').checked, parseInt($('o-thr').value)||10 );
      if(this.cfg.wakeOn && this.state.gpsOn) this.reqWake(); else this.relWake();
      this.render(); 
    });
    
    $('btn-loc').addEventListener('click', () => {
      if(this.state.lat) {
        this.map.center(this.state.lat, this.state.lng);
        this.cfg.autoCenter = true; $('o-center').checked = true;
      }
    });
    
    $('btn-hz').addEventListener('click', () => {
      if(this.state.lat) {
        this.map.addHazard(this.state.lat, this.state.lng);
        this.setTip('warn', 'Tehlike noktası işaretlendi.', '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>');
      }
    });
    
    $('btn-go').addEventListener('click', () => this.toggleTracking());
    
    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible' && this.state.gpsOn && this.cfg.wakeOn) this.reqWake();
    });
  }
  
  toggleTracking() {
    this.state.tracking = !this.state.tracking;
    const btn = $('btn-go');
    
    if(this.state.tracking) {
      if(!this.state.gpsOn) this.startGPS();
      this.reqWake();
      this.map.clearRoute();
      Object.assign(this.state, {start:Date.now(), dist:0, maxSpd:0, avgSpd:0, sumSpd:0, spdN:0, smoothV:0});
      
      $('go-lbl').textContent = 'Durdur';
      btn.classList.replace('act-start', 'act-stop');
      btn.querySelector('svg').innerHTML = '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>';
    } else {
      $('go-lbl').textContent = 'Başlat';
      btn.classList.replace('act-stop', 'act-start');
      btn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
    this.render();
  }

  startGPS() {
    if(!navigator.geolocation) return;
    this.watchId = navigator.geolocation.watchPosition(
      p => this.onGPS(p), 
      e => { if(e.code===1) this.setTip('danger','Konum izni reddedildi.',''); },
      {enableHighAccuracy:true, maximumAge:1500, timeout:10000}
    );
    this.state.gpsOn = true;
    $('ft-dot').classList.add('on'); $('ft-gps').textContent='GPS Aktif'; $('ft-gps').style.color='var(--green)';
  }
  
  onGPS(p) {
    const {latitude:la, longitude:ln, speed:sp, heading:hd, altitude:al, accuracy:ac} = p.coords;
    this.state.lat=la; this.state.lng=ln; this.state.acc=ac; this.state.alt=al!=null?Math.round(al):null; this.state.hdg=hd;
    
    let raw = (sp != null && sp >= 0) ? sp * 3.6 : 0;
    if(raw < 2 && ac > 20) raw = 0;
    this.state.smoothV = this.state.smoothV * 0.3 + raw * 0.7;
    this.state.spd = Math.round(this.state.smoothV);
    
    if(this.state.spd > this.state.maxSpd) this.state.maxSpd = this.state.spd;
    if(this.state.spd > 0) {
      this.state.sumSpd += this.state.spd; this.state.spdN++;
      this.state.avgSpd = Math.round(this.state.sumSpd / this.state.spdN);
    }
    
    if(this.state.prev) {
      const d = hav(this.state.prev[0], this.state.prev[1], la, ln);
      if(d > 0.002 && d < 2) this.state.dist += d;
    }
    this.state.prev = [la,ln];
    
    if(this.state.tracking) this.map.addRoutePoint(la, ln);
    this.map.updateUser(la, ln, ac, hdg, this.cfg.rotateMode);
    if(this.cfg.autoCenter) this.map.center(la, ln);
    
    this.fetchServices(la, ln);
    this.render();
  }

  fetchServices(la, ln) {
    if(!this.timers.lim && (Date.now()-this.cache.lim.ts > 12000 || hav(la,ln,this.cache.lim.la,this.cache.lim.ln) > 0.15)) {
      this.timers.lim = setTimeout(async () => {
        this.timers.lim = null;
        try{
          const q = `[out:json][timeout:5];way(around:30,${la},${ln})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)$"][maxspeed];out tags 1;`;
          const r = await fetch('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q));
          if(!r.ok) throw 0; const j = await r.json();
          this.cache.lim = {ts:Date.now(), la, ln};
          if(j.elements?.length && j.elements[0].tags?.maxspeed) {
            const v = parseInt(j.elements[0].tags.maxspeed);
            if(v > 0) { this.state.lim = v; this.state.dataAge = Date.now(); return; }
          }
          this.state.lim = null;
        }catch(e){}
      }, 800);
    }
    
    if(!this.timers.wx && (Date.now()-this.cache.wx.ts > 180000)) {
      this.timers.wx = setTimeout(async () => {
        this.timers.wx = null;
        try{
          const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`);
          if(!r.ok) throw 0; const j = await r.json();
          this.cache.wx = {ts:Date.now(), code:j.current.weather_code};
          $('is-temp').textContent = Math.round(j.current.temperature_2m)+'°C';
          $('is-wind').textContent = Math.round(j.current.wind_speed_10m)+' km/s';
        }catch(e){}
      }, 1500);
    }
    
    if(!this.timers.geo && (Date.now()-this.cache.geo.ts > 45000)) {
      this.timers.geo = setTimeout(async () => {
        this.timers.geo = null;
        try{
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&zoom=17&addressdetails=1`,{headers:{'Accept-Language':'tr'}});
          const j = await r.json(); this.cache.geo.ts = Date.now();
          if(j.address){
            const p = [];
            if(j.address.road) p.push(j.address.road);
            if(j.address.suburb||j.address.neighbourhood) p.push(j.address.suburb||j.address.neighbourhood);
            $('is-loc').textContent = p.join(', ') || 'Bölge Saptandı';
            $('hdr-road').textContent = j.address.road || 'Navigasyon Sistemi';
          }
        }catch(e){}
      }, 2000);
    }
  }

  render() {
    const v = this.state.spd, lim = this.state.lim;
    $('spd-val').textContent = v;
    
    const ARC = 356.05;
    const pct = clamp(v/220, 0, 1);
    $('g-bar').setAttribute('stroke-dashoffset', ARC*(1-pct));
    
    const needleRot = -150 + (pct * 240);
    $('g-needle-group').setAttribute('transform', `rotate(${needleRot} 100 100)`);

    if(lim) { $('limit-badge').classList.remove('off'); $('limit-num').textContent = lim; }
    else { $('limit-badge').classList.add('off'); $('limit-num').textContent = '--'; }

    const thr = 1 + this.cfg.threshold/100;
    const over = lim && v > lim * thr;
    const warn = lim && v > lim && !over;
    
    $('ovr').classList.toggle('on', over);

    if(over) {
      $('g-bar').setAttribute('stroke','url(#grd-red)'); 
      $('g-needle').setAttribute('stroke','url(#grd-red)');
      $('spd-val').style.color='var(--red)';
      if(this.cfg.soundOn) this.beep();
    } else if(warn) {
      $('g-bar').setAttribute('stroke','url(#grd-warn)'); 
      $('g-needle').setAttribute('stroke','url(#grd-warn)');
      $('spd-val').style.color='var(--amber)';
    } else {
      $('g-bar').setAttribute('stroke','url(#grd-blue)'); 
      $('g-needle').setAttribute('stroke','url(#grd-blue)');
      $('spd-val').style.color='';
    }

    $('ss-max').textContent = this.state.maxSpd;
    $('ss-avg').textContent = this.state.avgSpd;
    $('ss-trip').textContent = this.state.dist.toFixed(1);

    if(this.state.start) {
      const el = Math.floor((Date.now()-this.state.start)/1000);
      const h = Math.floor(el/3600), m = Math.floor(el%3600/60), s = el%60;
      $('m-dur').textContent = h ? h+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0') : String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
    }
    
    $('m-alt').textContent = this.state.alt!=null ? this.state.alt : '--';
    if(this.state.hdg!=null) {
      const dirs = ['K','KD','D','GD','G','GB','B','KB'];
      $('m-dir').textContent = dirs[Math.round(this.state.hdg/45)%8];
    }
    $('m-acc').textContent = this.state.acc!=null ? Math.round(this.state.acc) : '--';

    const lv = this.state.acc==null ? 0 : this.state.acc<5 ? 4 : this.state.acc<15 ? 3 : this.state.acc<35 ? 2 : 1;
    $('ft-bars').querySelectorAll('.ft-bar').forEach((b,i) => b.style.background = i<lv?'var(--green)':'var(--text-tertiary)');

    if(this.state.dataAge) {
      const sec = Math.floor((Date.now()-this.state.dataAge)/1000);
      $('ft-fresh').textContent = sec<60 ? sec+'s' : Math.floor(sec/60)+'m';
    }

    this.updateTip(over, warn, v);
  }

  updateTip(over, warn, v) {
    const wc = this.cache.wx.code, wet = wc!=null && (wc>=51 || (wc>=40&&wc<=48));
    let t='', tx='', ic='<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';

    if(over){
      t='danger'; tx=`Limit aşıldı: ${v} km/s (Yasal Sınır: ${this.state.lim} km/s). Lütfen yavaşlayın.`;
      ic='<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
    }else if(warn){
      t='warn'; tx=`Yasal sınıra çok yakınsınız. Limit: ${this.state.lim} km/s`;
    }else if(wet && v>30){
      t='warn'; tx='Riskli hava koşulları (Yağış/Sis). Takip mesafenizi koruyun.';
    }else if(v>120){
      t='warn'; tx='Yüksek sürat! Yol ve çevre koşullarına dikkat ediniz.';
    }else if(this.state.lim && v>0 && v<=this.state.lim*.85){
      t=''; tx='Sürüş yasal sınırlar içerisinde güvenle devam ediyor.';
      ic='<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
    }else if(v>0){ t=''; tx='Sürüş parametreleri aktif.'; }
    else if(this.state.gpsOn){ t=''; tx='Konum kilitlendi, hareket verisi bekleniyor.'; }
    else{ t=''; tx='Sistemi başlatmak için "Başlat" dokunun.'; }

    const k = t+tx; if(k===this.state.lastTK) return; this.state.lastTK = k;
    this.setTip(t,tx,ic);
  }

  setTip(type, txt, svg) {
    const tip = $('tip');
    tip.style.display = txt ? 'flex' : 'none';
    tip.className = 'panel ' + type;
    $('tip-t').textContent = txt;
    $('tip-icon').innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
  }

  lastB = 0;
  beep() {
    if(Date.now() - this.lastB < 5000) return; this.lastB = Date.now();
    try{
      const c = new(window.AudioContext||window.webkitAudioContext)();
      const o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 800; o.type = 'sine';
      g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
      o.start(); o.stop(c.currentTime + 0.35); setTimeout(() => c.close(), 500);
    }catch(e){}
  }

  startClock() {
    const tk = () => $('ft-clock').textContent = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    tk(); setInterval(tk, 15000);
    setInterval(() => { if(this.state.start && this.state.gpsOn) this.render(); }, 1000);
  }

  async reqWake() {
    if(!('wakeLock' in navigator) || !this.cfg.wakeOn) return;
    try { this.wakeLock = await navigator.wakeLock.request('screen'); this.wakeLock.addEventListener('release',()=>this.wakeLock=null); }catch(e){}
  }
  relWake() { if(this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; } }

  checkAutoStart() {
    let s=false;
    const go = () => { if(s)return; s=true; this.startGPS(); };
    if(navigator.permissions) {
      navigator.permissions.query({name:'geolocation'}).then(r => {
        if(r.state==='granted') go(); else document.addEventListener('click', go, {once:true});
      }).catch(() => document.addEventListener('click', go, {once:true}));
    } else document.addEventListener('click', go, {once:true});
  }
}

// Bootstrap
window.RotaProApp = new AppManager();
