/**
 * RotaPro Architecture (Iteration 5 - Bugfix)
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
const store = {
  get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
};
async function fetchJSON(url, ms=8000){
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try{
    const r = await fetch(url, {signal: ac.signal});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}
// Noktanın (la,ln) bir yol geometrisine metre cinsinden uzaklığı
function distToPolyline(la, ln, geom){
  if(!geom || !geom.length) return Infinity;
  const k = Math.cos(la*Math.PI/180), m = 111320;
  const P = g => [(g.lon-ln)*k*m, (g.lat-la)*m];
  if(geom.length === 1){ const [x,y] = P(geom[0]); return Math.hypot(x,y); }
  let best = Infinity;
  for(let i=0;i<geom.length-1;i++){
    const [ax,ay] = P(geom[i]), [bx,by] = P(geom[i+1]);
    const dx=bx-ax, dy=by-ay, l2=dx*dx+dy*dy;
    const t = l2 ? clamp(-(ax*dx+ay*dy)/l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(ax+t*dx, ay+t*dy));
  }
  return best;
}
function parseMaxspeed(s){
  if(!s) return null;
  const n = parseInt(s, 10);
  if(!(n > 0)) return null;           // "none", "walk", "TR:urban" vb.
  return /mph/i.test(s) ? Math.round(n*1.609) : n;
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bearing = (a1,b1,a2,b2) => {
  const R = Math.PI/180, y = Math.sin((b2-b1)*R)*Math.cos(a2*R);
  const x = Math.cos(a1*R)*Math.sin(a2*R) - Math.sin(a1*R)*Math.cos(a2*R)*Math.cos((b2-b1)*R);
  return (Math.atan2(y,x)/R + 360) % 360;
};
const POI_LABEL = {cam:'radar / hız kamerası', light:'trafik ışığı', rail:'hemzemin geçit', bump:'kasis / yavaşlatıcı', stop:'dur levhası'};
const POI_RANGE = {cam:500, rail:400, hz:600, inc:600, bump:200, light:200, stop:120};
const WARN_SVG = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const INFO_SVG = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';

/* ─── CLASS: Config ─── */
class Config {
  constructor() {
    this.autoCenter = true;
    this.rotateMode = true;
    this.soundOn = true;
    this.wakeOn = true;
    this.lightTheme = false;
    this.threshold = 10;
    this.tomtomKey = '';
    this.showLights = true;
    this.showCams = true;
    this.showFlow = true;
    this.load();
  }
  load() {
    const s = store.get('rp6');
    if (s) {
      try {
        const o = JSON.parse(s);
        this.autoCenter = o.ac !== false;
        this.rotateMode = o.rot !== false;
        this.soundOn = o.snd !== false;
        this.wakeOn = o.wk !== false;
        this.lightTheme = o.lt === true;
        this.threshold = clamp(parseInt(o.thr,10) || 10, 1, 50);
        this.tomtomKey = typeof o.tk === 'string' ? o.tk.trim() : '';
        this.showLights = o.sl !== false;
        this.showCams = o.sc !== false;
        this.showFlow = o.sf !== false;
      } catch(e) {}
    }
  }
  save(ac, rot, snd, wk, lt, thr, x) {
    this.autoCenter = ac; this.rotateMode = rot; this.soundOn = snd; this.wakeOn = wk; this.lightTheme = lt;
    this.threshold = clamp(parseInt(thr,10) || 10, 1, 50);
    if (x) { this.tomtomKey = (x.key || '').trim(); this.showLights = !!x.lights; this.showCams = !!x.cams; this.showFlow = !!x.flow; }
    store.set('rp6', JSON.stringify({ ac, rot, snd, wk, lt, thr: this.threshold,
      tk: this.tomtomKey, sl: this.showLights, sc: this.showCams, sf: this.showFlow }));
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
    document.addEventListener('touchcancel', e => this.onDragEnd(e));

    this.handle.addEventListener('mousedown', e => this.onDragStart(e));
    document.addEventListener('mousemove', e => this.onDragMove(e));
    document.addEventListener('mouseup', e => this.onDragEnd(e));

    this.bg.addEventListener('click', e => { if(e.target===this.bg) this.close(); });
    document.addEventListener('keydown', e => { if(e.key==='Escape' && this.isOpen) this.close(); });
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
    setTimeout(() => { if(!this.isOpen) this.bg.style.display = 'none'; }, 520);
  }

  pointY(e) {
    if(e.touches && e.touches[0]) return e.touches[0].clientY;
    if(e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return e.clientY;
  }
  onDragStart(e) {
    if(!this.isOpen) return;
    this.dragging = true;
    this.currentY = 0;
    this.startY = this.pointY(e);
    this.sheet.classList.add('dragging');
  }
  onDragMove(e) {
    if(!this.dragging) return;
    const y = this.pointY(e);
    this.currentY = Math.max(0, y - this.startY);
    this.sheet.style.transform = `translateY(${this.currentY}px)`;
    const opacity = 1 - (this.currentY / window.innerHeight);
    this.bg.style.backgroundColor = `rgba(0,0,0,${Math.max(0, opacity * 0.6)})`;
    if(this.currentY > 0 && e.cancelable) e.preventDefault();
  }
  onDragEnd() {
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
    this.map = L.map('map', {center:[39.92,32.85], zoom:18, zoomControl:false, attributionControl:false, preferCanvas:true});
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {maxZoom:19}).addTo(this.map);
    this.uMk = null; this.uCr = null; this.rLine = null; this.rPts = [];
    this.arrowEl = null; this.rot = 0;
    this.lightsL = L.layerGroup().addTo(this.map);
    this.camsL = L.layerGroup().addTo(this.map);
    this.incL = L.layerGroup().addTo(this.map);
    this.hzL = L.layerGroup().addTo(this.map);
    this.flowL = null; this.flowKey = '';
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

  // En kısa yoldan dön (359° -> 1° geçişinde ters tur atmasın)
  setArrowRotation(target) {
    const cur = ((this.rot % 360) + 360) % 360;
    const delta = ((target - cur + 540) % 360) - 180;
    this.rot += delta;
    
    const mapBox = document.getElementById('map-box');
    // We check if AppManager is ready and has config. If not, default to no rotate map
    const rotateMode = (window.RotaProApp && window.RotaProApp.cfg) ? window.RotaProApp.cfg.rotateMode : false;
    
    if (rotateMode) {
      if(this.arrowEl) this.arrowEl.style.transform = `rotate(0deg)`;
      if(mapBox) mapBox.style.transform = `perspective(1000px) rotateX(45deg) rotateZ(${-this.rot}deg)`;
    } else {
      if(this.arrowEl) this.arrowEl.style.transform = `rotate(${this.rot}deg)`;
      if(mapBox) mapBox.style.transform = `none`;
    }
  }

  updateUser(la, ln, ac, hdg, rotateMode) {
    const target = (rotateMode && Number.isFinite(hdg)) ? hdg : 0;

    if(!this.uMk) {
      const html = `<svg class="nav-arrow" viewBox="0 0 24 24"><path d="M12 2L2 22l10-4 10 4L12 2z" fill="#2d7aff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      this.uMk = L.marker([la,ln], {icon:L.divIcon({className:'', html, iconSize:[32,32], iconAnchor:[16,16]}), interactive:false, keyboard:false}).addTo(this.map);
      this.uCr = L.circle([la,ln], {radius:20, color:'#2d7aff', fillColor:'#2d7aff', fillOpacity:0.1, weight:1.5, interactive:false}).addTo(this.map);
      const el = this.uMk.getElement();
      this.arrowEl = el ? el.querySelector('svg') : null;
    } else {
      this.uMk.setLatLng([la,ln]); this.uCr.setLatLng([la,ln]);
    }
    if(ac) this.uCr.setRadius(clamp(ac, 8, 200));
    this.setArrowRotation(target);
  }

  addRoutePoint(la, ln) {
    this.rPts.push([la,ln]);
    if(this.rPts.length > 1) {
      if(!this.rLine) this.rLine = L.polyline(this.rPts, {color:'#2d7aff', weight:4, opacity:0.8, interactive:false}).addTo(this.map);
      else this.rLine.setLatLngs(this.rPts);
    }
  }
  clearRoute() {
    this.rPts = [];
    if(this.rLine) { this.map.removeLayer(this.rLine); this.rLine = null; }
  }
  center(la, ln) {
    this.map.setView([la,ln], 18, {animate:true, duration:0.4});
  }
  addHazard(la, ln, type, ts = Date.now()) {
    const ico = {'Kaza':'💥','Çalışma':'🚧','Heyelan':'⛰️','Diğer':'⚠️'}[type] || '⚠️';
    const left = ts + 1800000 - Date.now();
    if (left <= 0) return;
    const mk = L.marker([la,ln], {icon:L.divIcon({className:'',
      html:`<div class="hz-dot" style="font-size:14px; text-shadow:0 0 4px rgba(0,0,0,0.5)">${ico}</div>`,
      iconSize:[24,24], iconAnchor:[12,12]}), interactive:true, keyboard:false}).addTo(this.hzL);
    mk.bindPopup(`<b>${esc(type)}</b><br>Bildirildi: ${new Date(ts).toLocaleTimeString('tr-TR')}`);
    setTimeout(() => this.hzL.removeLayer(mk), left);
  }

  poiIcon(kind) {
    const m = {light:['🚦','poi-light'], cam:['📷','poi-cam'], stop:['🛑','poi-stop'], bump:['〰️','poi-bump'], rail:['🚂','poi-rail']}[kind];
    return L.divIcon({className:'', html:`<div class="poi ${m[1]}">${m[0]}</div>`, iconSize:[22,22], iconAnchor:[11,11]});
  }
  setPOIs(list, cfg) {
    this.lightsL.clearLayers(); this.camsL.clearLayers();
    for (const p of list) {
      const isLight = p.kind === 'light';
      if (isLight ? !cfg.showLights : !cfg.showCams) continue;
      L.marker([p.lat,p.lng], {icon:this.poiIcon(p.kind), interactive:false, keyboard:false}).addTo(isLight ? this.lightsL : this.camsL);
    }
  }
  setIncidents(list) {
    this.incL.clearLayers();
    for (const i of list) {
      L.marker([i.lat,i.lng], {icon:L.divIcon({className:'', html:`<div class="poi poi-inc">${i.emoji}</div>`, iconSize:[24,24], iconAnchor:[12,12]}), keyboard:false})
        .bindPopup(`<b>${esc(i.title)}</b>${i.desc ? '<br>'+esc(i.desc) : ''}`).addTo(this.incL);
    }
  }
  setFlow(key, on) {
    if (!(on && key)) {
      if (this.flowL) { this.map.removeLayer(this.flowL); this.flowL = null; this.flowKey = ''; }
      return;
    }
    if (this.flowL && this.flowKey === key) return;
    if (this.flowL) this.map.removeLayer(this.flowL);
    this.flowKey = key;
    this.flowL = L.tileLayer(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${encodeURIComponent(key)}`, {maxZoom:19, opacity:0.85}).addTo(this.map);
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
      dist:0, start:null, end:null, prev:null, prevT:null, tracking:false, gpsOn:false,
      smoothV:0, poi:[], incs:[], flow:null, ahead:null, dataAge:null, lastTK:'', gpsErr:'', hudMode:false, wasOver:false
    };

    this.timers = { lim:null, wx:null, geo:null, poi:null };
    this.busy = { lim:false, wx:false, geo:false, poi:false, inc:false, flow:false };
    this.cache = { lim:{ts:0,la:0,ln:0}, wx:{ts:0, code:null}, geo:{ts:0}, poi:{ts:0,la:0,ln:0}, inc:{ts:0}, flow:{ts:0} };
    this.wakeLock = null;
    this.watchId = null;
    this.audio = null;
    this.lastB = 0;
    this.hazards = [];
    this.alerted = new Set();

    this.bindUI();
    this.startClock();

    $('o-center').checked = this.cfg.autoCenter;
    $('o-rotate').checked = this.cfg.rotateMode;
    $('o-sound').checked = this.cfg.soundOn;
    $('o-wake').checked = this.cfg.wakeOn;
    $('o-theme').checked = this.cfg.lightTheme;
    $('o-thr').value = this.cfg.threshold;
    $('o-tt').value = this.cfg.tomtomKey;
    $('o-lights').checked = this.cfg.showLights;
    $('o-cams').checked = this.cfg.showCams;
    $('o-flow').checked = this.cfg.showFlow;
    this.applyTheme();
    this.restoreHazards();
    this.applyLayers();

    setTimeout(()=>this.map.map.invalidateSize(), 300);
    window.addEventListener('resize', ()=>this.map.map.invalidateSize());

    this.render();
    this.checkAutoStart();
  }

  applyTheme() {
    document.body.classList.toggle('light-theme', this.cfg.lightTheme);
  }

  bindUI() {
    this.map.map.on('dragstart', () => { 
      this.cfg.autoCenter = false; $('o-center').checked = false; 
      this.cfg.rotateMode = false; $('o-rotate').checked = false;
      this.map.setArrowRotation(this.state.hdg || 0); // Update map rotation to default
    });

    $('btn-theme').addEventListener('click', () => {
      this.cfg.lightTheme = !this.cfg.lightTheme;
      this.cfg.save(this.cfg.autoCenter, this.cfg.rotateMode, this.cfg.soundOn, this.cfg.wakeOn, this.cfg.lightTheme, this.cfg.threshold);
      this.applyTheme();
      $('o-theme').checked = this.cfg.lightTheme;
    });

    $('btn-save').addEventListener('click', () => {
      this.cfg.save( $('o-center').checked, $('o-rotate').checked, $('o-sound').checked, $('o-wake').checked, $('o-theme').checked, $('o-thr').value,
        { key:$('o-tt').value, lights:$('o-lights').checked, cams:$('o-cams').checked, flow:$('o-flow').checked } );
      $('o-thr').value = this.cfg.threshold;
      this.applyTheme();
      if(this.cfg.wakeOn && this.state.tracking) this.reqWake(); else this.relWake();
      this.applyLayers();
      if(this.cfg.soundOn) this.unlockAudio();
      if(this.state.lat != null) this.map.updateUser(this.state.lat, this.state.lng, this.state.acc, this.state.hdg, this.cfg.rotateMode);
      this.render();
    });

    $('btn-loc').addEventListener('click', () => {
      if(this.state.lat != null) {
        this.map.center(this.state.lat, this.state.lng);
        this.cfg.autoCenter = true; $('o-center').checked = true;
      }
    });

    const hzBtn = $('btn-hz'), hzMenu = $('hz-menu');
    hzBtn.addEventListener('click', () => {
      const isVis = hzMenu.style.display === 'flex';
      hzMenu.style.display = isVis ? 'none' : 'flex';
      hzBtn.classList.toggle('active', !isVis);
    });

    document.querySelectorAll('.hz-opt').forEach(btn => {
      btn.addEventListener('click', (e) => {
        hzMenu.style.display = 'none'; hzBtn.classList.remove('active');
        if(this.state.lat != null) {
          const type = e.target.dataset.type;
          this.addHazardReport(type);
          this.setTip('warn', `${type} tehlikesi işaretlendi.`, WARN_SVG);
          this.state.lastTK = 'hazard';
          setTimeout(() => { if(this.state.lastTK==='hazard') { this.state.lastTK=''; this.render(); } }, 3000);
        }
      });
    });

    document.addEventListener('click', e => {
      if(!hzBtn.contains(e.target) && !hzMenu.contains(e.target)) {
        hzMenu.style.display = 'none'; hzBtn.classList.remove('active');
      }
    });



    // Tarayıcılar sesi ancak kullanıcı etkileşiminden sonra açar
    const unlock = () => this.unlockAudio();
    document.addEventListener('click', unlock, {once:true});
    document.addEventListener('touchend', unlock, {once:true});

    document.addEventListener('visibilitychange', () => {
      if(document.visibilityState === 'visible' && this.state.tracking && this.cfg.wakeOn) this.reqWake();
    });
  }

  toggleTracking(forceStart = false) {
    if (forceStart) {
      this.state.tracking = true;
    } else {
      this.state.tracking = !this.state.tracking;
    }

    if(this.state.tracking) {
      if(this.watchId == null) this.startGPS();
      this.reqWake();
      this.map.clearRoute();
      Object.assign(this.state, {start:Date.now(), end:null, dist:0, maxSpd:0, avgSpd:0, sumSpd:0, spdN:0, prev:null, prevT:null});
      if(this.state.lat != null) this.map.addRoutePoint(this.state.lat, this.state.lng);
    } else {
      this.state.end = Date.now();
      this.relWake();
    }
    this.render();
  }

  startGPS() {
    if(this.watchId != null) return;               // çift watchPosition engeli
    if(!navigator.geolocation) { this.gpsFail('Bu cihaz konum servisini desteklemiyor.'); return; }
    if(window.isSecureContext === false) { this.gpsFail('Konum için güvenli bağlantı (HTTPS) gerekli.'); return; }

    this.state.gpsErr = '';
    this.watchId = navigator.geolocation.watchPosition(
      p => this.onGPS(p),
      e => {
        if(e.code === 1) {
          navigator.geolocation.clearWatch(this.watchId); this.watchId = null;
          this.gpsFail('Konum izni reddedildi. Tarayıcı ayarlarından izin verin.');
        } else if(e.code === 2) {
          this.state.gpsErr = 'Konum alınamıyor. Açık alanda deneyin.'; this.render();
        }
        // code 3 (zaman aşımı): watchPosition kendiliğinden denemeye devam eder
      },
      {enableHighAccuracy:true, maximumAge:1500, timeout:15000}
    );
    this.state.gpsOn = true;
    $('ft-dot').classList.add('on'); $('ft-gps').textContent='Konum Bekleniyor'; $('ft-gps').style.color='var(--amber)';
  }

  gpsFail(msg) {
    this.state.gpsOn = false;
    this.state.gpsErr = msg;
    $('ft-dot').classList.remove('on'); $('ft-gps').textContent='GPS Kapalı'; $('ft-gps').style.color='var(--red)';
    this.render();
  }

  onGPS(p) {
    const {latitude:la, longitude:ln, speed:sp, heading:hd, altitude:al, accuracy:ac} = p.coords;
    const st = this.state;
    const now = p.timestamp || Date.now();

    if(st.gpsErr) st.gpsErr = '';
    $('ft-gps').textContent='GPS Aktif'; $('ft-gps').style.color='var(--green)';

    st.lat=la; st.lng=ln; st.acc=ac; st.alt=(al!=null && Number.isFinite(al)) ? Math.round(al) : null;

    // Hız: cihaz hızı yoksa konum farkından hesapla
    let raw;
    if(sp != null && Number.isFinite(sp) && sp >= 0) raw = sp * 3.6;
    else if(st.prev && st.prevT && now - st.prevT > 500) raw = hav(st.prev[0], st.prev[1], la, ln) * 1000 / ((now - st.prevT)/1000) * 3.6;
    else raw = st.smoothV;
    if(raw < 2 && ac > 20) raw = 0;
    if(raw > 400) raw = st.smoothV;                // anlamsız sıçramaları ele
    st.smoothV = st.smoothV * 0.3 + raw * 0.7;
    st.spd = Math.round(st.smoothV);

    // Yön: hareketsizken GPS NaN verir; son geçerli yönü koru
    if(hd != null && Number.isFinite(hd) && st.spd >= 3) st.hdg = hd;

    // İstatistikler yalnızca sürüş kaydı açıkken
    if(st.tracking) {
      if(st.spd > st.maxSpd) st.maxSpd = st.spd;
      if(st.spd > 0) {
        st.sumSpd += st.spd; st.spdN++;
        st.avgSpd = Math.round(st.sumSpd / st.spdN);
      }
      if(st.prev && ac <= 100) {
        const d = hav(st.prev[0], st.prev[1], la, ln);
        if(d > 0.002 && d < 2) st.dist += d;
      }
      if(ac <= 100) this.map.addRoutePoint(la, ln);
    }
    st.prev = [la,ln]; st.prevT = now;

    this.map.updateUser(la, ln, ac, st.hdg, this.cfg.rotateMode);
    if(this.cfg.autoCenter) this.map.center(la, ln);

    this.computeAhead();
    this.fetchServices(la, ln);
    this.render();
  }

  setStatus(id, ok, txt) {
    const el = $(id); if(!el) return;
    el.textContent = txt;
    el.className = 'm-status ' + (ok ? 'ok' : 'err');
  }

  fetchServices(la, ln) {
    const now = Date.now();
    this.fetchTraffic(la, ln, now);

    // Yol hız sınırı (Overpass)
    if(!this.timers.lim && !this.busy.lim && (now-this.cache.lim.ts > 12000 || hav(la,ln,this.cache.lim.la,this.cache.lim.ln) > 0.15)) {
      this.cache.lim = {ts:now, la, ln};            // başarısız olsa da art arda denemesin
      this.timers.lim = setTimeout(async () => {
        this.timers.lim = null; this.busy.lim = true;
        try{
          const q = `[out:json][timeout:6];way(around:30,${la},${ln})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)$"][maxspeed];out tags geom;`;
          const j = await fetchJSON('https://overpass-api.de/api/interpreter?data='+encodeURIComponent(q), 9000);
          let best = null, bestD = Infinity;
          for(const el of (j.elements || [])) {
            const v = parseMaxspeed(el.tags && el.tags.maxspeed);
            if(!v) continue;
            const d = distToPolyline(la, ln, el.geometry);
            if(d < bestD) { bestD = d; best = v; }
          }
          this.state.lim = best;                     // en yakın yolun limiti (yoksa null)
          this.state.dataAge = Date.now();
          this.setStatus('st-lim', true, 'Aktif');
        }catch(e){ this.setStatus('st-lim', false, 'Hata'); }
        finally{ this.busy.lim = false; }
      }, 800);
    }

    // Hava durumu (Open-Meteo)
    if(!this.timers.wx && !this.busy.wx && (now-this.cache.wx.ts > 180000)) {
      this.cache.wx.ts = now - 120000;               // hata olursa 60 sn sonra tekrar dene
      this.timers.wx = setTimeout(async () => {
        this.timers.wx = null; this.busy.wx = true;
        try{
          const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`);
          this.cache.wx = {ts:Date.now(), code:j.current.weather_code};
          $('is-temp').textContent = Math.round(j.current.temperature_2m)+'°C';
          $('is-wind').textContent = Math.round(j.current.wind_speed_10m)+' km/s';
          this.setStatus('st-wx', true, 'Aktif');
        }catch(e){ this.setStatus('st-wx', false, 'Hata'); }
        finally{ this.busy.wx = false; }
      }, 1500);
    }

    // Adres çözümleme (Nominatim, en fazla 45 sn'de bir)
    if(!this.timers.geo && !this.busy.geo && (now-this.cache.geo.ts > 45000)) {
      this.cache.geo.ts = now - 30000;               // hata olursa 15 sn sonra tekrar dene
      this.timers.geo = setTimeout(async () => {
        this.timers.geo = null; this.busy.geo = true;
        try{
          const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}&zoom=17&addressdetails=1&accept-language=tr`);
          this.cache.geo.ts = Date.now();
          if(j.address){
            const p = [];
            if(j.address.road) p.push(j.address.road);
            const sub = j.address.suburb || j.address.neighbourhood;
            if(sub) p.push(sub);
            $('is-loc').textContent = p.join(', ') || 'Bölge Saptandı';
            $('hdr-road').textContent = j.address.road || 'Navigasyon Sistemi';
          }
          this.setStatus('st-geo', true, 'Aktif');
        }catch(e){ this.setStatus('st-geo', false, 'Hata'); }
        finally{ this.busy.geo = false; }
      }, 2000);
    }
  }

  /* ── Trafik katmanları ── */
  applyLayers() {
    const c = this.cfg;
    this.map.setFlow(c.tomtomKey, c.showFlow);
    this.map.setPOIs(this.state.poi, c);
    if (!c.tomtomKey) { this.state.incs = []; this.map.setIncidents([]); this.state.flow = null; }
    this.cache.inc.ts = 0; this.cache.flow.ts = 0;
    const el = $('st-trf');
    if (el) { el.textContent = c.tomtomKey ? 'Bekliyor' : 'Anahtar yok'; el.className = 'm-status'; }
    if (this.state.lat != null) this.fetchServices(this.state.lat, this.state.lng);
  }

  addHazardReport(type) {
    const h = {la:this.state.lat, ln:this.state.lng, type, ts:Date.now()};
    this.hazards.push(h); this.saveHazards();
    this.map.addHazard(h.la, h.ln, type, h.ts);
  }
  saveHazards() {
    const now = Date.now();
    this.hazards = this.hazards.filter(h => now - h.ts < 1800000);
    store.set('rp_hz', JSON.stringify(this.hazards));
  }
  restoreHazards() {
    let arr = [];
    try { arr = JSON.parse(store.get('rp_hz') || '[]'); } catch(e) {}
    const now = Date.now();
    this.hazards = (Array.isArray(arr) ? arr : []).filter(h => h && Number.isFinite(h.la) && Number.isFinite(h.ln) && now - h.ts < 1800000);
    this.hazards.forEach(h => this.map.addHazard(h.la, h.ln, h.type, h.ts));
  }

  fetchTraffic(la, ln, now) {
    const c = this.cfg;

    // 1) OSM noktaları: trafik ışığı, radar, dur, kasis, hemzemin geçit
    const moved = hav(la, ln, this.cache.poi.la, this.cache.poi.ln);
    if ((c.showLights || c.showCams) && !this.busy.poi && !this.timers.poi &&
        (now - this.cache.poi.ts > 90000 || (moved > 0.5 && now - this.cache.poi.ts > 20000))) {
      this.cache.poi = {ts:now, la, ln};
      this.timers.poi = setTimeout(async () => {
        this.timers.poi = null; this.busy.poi = true;
        try {
          const ar = `(around:1200,${la},${ln})`;
          const q = `[out:json][timeout:10];(node${ar}[highway=traffic_signals];node${ar}[highway=speed_camera];node${ar}[enforcement=maxspeed];node${ar}[highway=stop];node${ar}[traffic_calming~"^(bump|hump|table|cushion)$"];node${ar}[railway=level_crossing];);out 400;`;
          const j = await fetchJSON('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), 12000);
          const list = [], seen = new Set();
          for (const el of (j.elements || [])) {
            if (el.lat == null || seen.has(el.id)) continue;
            seen.add(el.id);
            const t = el.tags || {};
            const kind = (t.highway === 'speed_camera' || t.enforcement === 'maxspeed') ? 'cam'
                       : t.highway === 'traffic_signals' ? 'light'
                       : t.highway === 'stop' ? 'stop'
                       : t.railway === 'level_crossing' ? 'rail' : 'bump';
            list.push({id:el.id, kind, lat:el.lat, lng:el.lon});
          }
          this.state.poi = list;
          this.map.setPOIs(list, this.cfg);
        } catch(e) {}
        finally { this.busy.poi = false; }
      }, 1200);
    }

    if (!c.tomtomKey) return;
    const key = encodeURIComponent(c.tomtomKey);

    // 2) Canlı kazalar ve yol olayları (TomTom Incident Details)
    if (!this.busy.inc && now - this.cache.inc.ts > 90000) {
      this.cache.inc.ts = now; this.busy.inc = true;
      (async () => {
        try {
          const d = 0.06, bb = [ln-d, la-d, ln+d, la+d].map(v => v.toFixed(5)).join(',');
          const f = '{incidents{type,geometry{type,coordinates},properties{iconCategory,events{description},from,to}}}';
          const j = await fetchJSON(`https://api.tomtom.com/traffic/services/5/incidentDetails?key=${key}&bbox=${bb}&fields=${encodeURIComponent(f)}&language=tr-TR&timeValidityFilter=present`, 10000);
          const CAT = {1:['💥','Kaza'],2:['🌫️','Sis'],3:['⚠️','Tehlikeli koşul'],4:['🌧️','Yağış'],5:['🧊','Buzlanma'],6:['🚗','Yoğunluk'],
                       7:['🚧','Şerit kapalı'],8:['⛔','Yol kapalı'],9:['🚧','Yol çalışması'],10:['💨','Rüzgâr'],11:['🌊','Su baskını'],14:['🚙','Arızalı araç']};
          const list = [];
          for (const it of (j.incidents || [])) {
            const g = it.geometry || {}, p = it.properties || {};
            let co = g.coordinates; if (g.type !== 'Point' && Array.isArray(co)) co = co[0];
            if (!Array.isArray(co) || co.length < 2) continue;
            const cat = CAT[p.iconCategory] || ['⚠️','Trafik olayı'];
            const ev = (p.events && p.events[0] && p.events[0].description) || '';
            list.push({lat:co[1], lng:co[0], emoji:cat[0], title:cat[1], desc:[ev, p.from && p.to ? `${p.from} → ${p.to}` : ''].filter(Boolean).join(' · ')});
          }
          this.state.incs = list;
          this.map.setIncidents(list);
          this.setStatus('st-trf', true, 'Aktif');
        } catch(e) { this.setStatus('st-trf', false, 'Hata'); }
        finally { this.busy.inc = false; }
      })();
    }

    // 3) Bulunduğunuz yolun anlık akış hızı → yoğunluk
    if (!this.busy.flow && now - this.cache.flow.ts > 20000) {
      this.cache.flow.ts = now; this.busy.flow = true;
      (async () => {
        try {
          const j = await fetchJSON(`https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?key=${key}&point=${la},${ln}&unit=KMPH`, 8000);
          const f = j.flowSegmentData;
          this.state.flow = f ? {cur:f.currentSpeed, free:f.freeFlowSpeed, closed:!!f.roadClosure} : null;
          this.setStatus('st-trf', true, 'Aktif');
        } catch(e) { this.setStatus('st-trf', false, 'Hata'); }
        finally { this.busy.flow = false; }
      })();
    }
  }

  // Gidiş yönünüzde, menzil içindeki en yakın uyarı noktası
  computeAhead() {
    const s = this.state; s.ahead = null;
    if (s.lat == null || s.hdg == null || s.spd < 5) return;
    const now = Date.now();
    const cands = s.poi.map(p => ({k:p.kind, id:'p'+p.id, lat:p.lat, lng:p.lng, label:POI_LABEL[p.kind]}));
    this.hazards.forEach(h => { if (now - h.ts < 1800000) cands.push({k:'hz', id:'h'+h.ts, lat:h.la, lng:h.ln, label:h.type.toLowerCase()+' bildirimi'}); });
    s.incs.forEach(i => cands.push({k:'inc', id:'i'+i.lat+','+i.lng, lat:i.lat, lng:i.lng, label:i.title.toLowerCase()}));
    let best = null;
    for (const c of cands) {
      const d = hav(s.lat, s.lng, c.lat, c.lng) * 1000;
      if (d > (POI_RANGE[c.k] || 200) || d < 8) continue;
      let diff = Math.abs(bearing(s.lat, s.lng, c.lat, c.lng) - s.hdg); if (diff > 180) diff = 360 - diff;
      if (diff > 40) continue;
      if (!best || d < best.d) best = {k:c.k, id:c.id, d, label:c.label};
    }
    if (!best) return;
    best.warn = best.k !== 'light' && best.k !== 'stop';
    s.ahead = best;
    if (best.warn && !this.alerted.has(best.id)) {
      if (this.alerted.size > 300) this.alerted.clear();
      this.alerted.add(best.id);
      if (navigator.vibrate) navigator.vibrate(80);
    }
  }

  render() {
    const s = this.state, v = s.spd, lim = s.lim;
    $('spd-val').textContent = v;

    const ARC = 356.05;
    const pct = clamp(v/220, 0, 1);
    $('g-bar').setAttribute('stroke-dashoffset', ARC*(1-pct));
    // İğne -120° (yayın başı) ile +120° (yayın sonu) arasında döner
    $('g-needle-group').style.transform = `rotate(${-120 + pct*240}deg)`;

    if(lim) { $('limit-badge').classList.remove('off'); $('limit-num').textContent = lim; }
    else { $('limit-badge').classList.add('off'); $('limit-num').textContent = '--'; }

    const thr = 1 + this.cfg.threshold/100;
    const over = !!(lim && v > lim * thr);
    const warn = !!(lim && v > lim && !over);

    $('ovr').classList.toggle('on', over);

    const needle = $('g-needle'), bar = $('g-bar');
    const gaugeSvg = $('gauge-svg'), limitBadge = $('limit-badge');

    if(over) {
      gaugeSvg.classList.remove('pulsing-warn');
      limitBadge.classList.add('pulsing-danger');
      if(!this.state.wasOver) {
        if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
        this.state.wasOver = true;
      }
      bar.setAttribute('stroke','url(#grd-red)'); needle.setAttribute('stroke','#ef4444');
      $('spd-val').style.color='var(--red)';
      if(this.cfg.soundOn) this.beep();
    } else if(warn) {
      gaugeSvg.classList.add('pulsing-warn');
      limitBadge.classList.remove('pulsing-danger');
      this.state.wasOver = false;
      bar.setAttribute('stroke','url(#grd-warn)'); needle.setAttribute('stroke','#f59e0b');
      $('spd-val').style.color='var(--amber)';
    } else {
      gaugeSvg.classList.remove('pulsing-warn');
      limitBadge.classList.remove('pulsing-danger');
      this.state.wasOver = false;
      bar.setAttribute('stroke','url(#grd-blue)'); needle.setAttribute('stroke','#2d7aff');
      $('spd-val').style.color='';
    }

    $('ss-max').textContent = s.maxSpd;
    $('ss-avg').textContent = s.avgSpd;
    $('ss-trip').textContent = s.dist.toFixed(1);

    if(s.start) {
      const el = Math.max(0, Math.floor(((s.end || Date.now()) - s.start)/1000));
      const h = Math.floor(el/3600), m = Math.floor(el%3600/60), sec = el%60;
      $('m-dur').textContent = h ? h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0') : String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
    } else $('m-dur').textContent = '00:00';

    $('m-alt').textContent = s.alt!=null ? s.alt : '--';
    if(s.hdg!=null && Number.isFinite(s.hdg)) {
      const dirs = ['K','KD','D','GD','G','GB','B','KB'];
      $('m-dir').textContent = dirs[Math.round(s.hdg/45)%8];
    }
    $('m-acc').textContent = s.acc!=null ? Math.round(s.acc) : '--';

    const lv = s.acc==null ? 0 : s.acc<5 ? 4 : s.acc<15 ? 3 : s.acc<35 ? 2 : 1;
    $('ft-bars').querySelectorAll('.ft-bar').forEach((b,i) => b.style.background = i<lv?'var(--green)':'var(--text-tertiary)');

    if(s.dataAge) {
      const sec = Math.floor((Date.now()-s.dataAge)/1000);
      $('ft-fresh').textContent = sec<60 ? sec+'s' : Math.floor(sec/60)+'dk';
    }

    const fl = s.flow, tv = $('m-trf');
    if (fl && fl.free > 0) {
      const r = fl.closed ? 0 : fl.cur / fl.free;
      const [txt, col] = fl.closed ? ['Kapalı','var(--red)'] : r >= .85 ? ['Akıcı','var(--green)'] : r >= .6 ? ['Yavaş','var(--amber)'] : r >= .35 ? ['Yoğun','var(--red)'] : ['Durma','var(--red)'];
      tv.textContent = txt; tv.style.color = col;
    } else { tv.textContent = '--'; tv.style.color = ''; }

    this.updateTip(over, warn, v);
  }

  updateTip(over, warn, v) {
    const wc = this.cache.wx.code, wet = wc!=null && (wc>=51 || (wc>=40&&wc<=48));
    if(this.state.lastTK==='hazard') return;     // bildirim onayı 3 sn görünsün
    let t='', tx='', ic=INFO_SVG;

    if(this.state.gpsErr){
      t='danger'; tx=this.state.gpsErr; ic=WARN_SVG;
    }else if(over){
      t='danger'; tx=`Limit aşıldı: ${v} km/s (Yasal Sınır: ${this.state.lim} km/s). Lütfen yavaşlayın.`; ic=WARN_SVG;
    }else if(warn){
      t='warn'; tx=`Hız sınırının üzerindesiniz. Limit: ${this.state.lim} km/s`;
    }else if(this.state.ahead){
      const ah = this.state.ahead;
      t = ah.warn ? 'warn' : ''; ic = ah.warn ? WARN_SVG : INFO_SVG;
      tx = `Önde ${ah.label}: ${Math.max(10, Math.round(ah.d/10)*10)} m`;
    }else if(wet && v>30){
      t='warn'; tx='Riskli hava koşulları (Yağış/Sis). Takip mesafenizi koruyun.';
    }else if(v>120){
      t='warn'; tx='Yüksek sürat! Yol ve çevre koşullarına dikkat ediniz.';
    }else if(this.state.lim && v>0 && v<=this.state.lim*.85){
      t=''; tx='Sürüş yasal sınırlar içerisinde güvenle devam ediyor.';
      ic='<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
    }else if(v>0){ t=''; tx='Sürüş parametreleri aktif.'; }
    else if(this.state.gpsOn && this.state.lat!=null){ t=''; tx='Konum kilitlendi, hareket verisi bekleniyor.'; }
    else if(this.state.gpsOn){ t=''; tx='Konum aranıyor…'; }
    else{ t=''; tx='Başlamak için ekrana dokunup konum iznini verin.'; }

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

  unlockAudio() {
    try{
      if(!this.audio) this.audio = new (window.AudioContext||window.webkitAudioContext)();
      if(this.audio.state === 'suspended') this.audio.resume();
    }catch(e){}
  }
  beep() {
    if(Date.now() - this.lastB < 5000) return;
    if(!this.audio || this.audio.state !== 'running') return;   // henüz etkileşim yoksa sessiz geç
    this.lastB = Date.now();
    try{
      const c = this.audio, o = c.createOscillator(), g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = 800; o.type = 'sine';
      g.gain.setValueAtTime(0.08, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
      o.start(); o.stop(c.currentTime + 0.35);
    }catch(e){}
  }

  startClock() {
    const tk = () => $('ft-clock').textContent = new Date().toLocaleTimeString('tr-TR',{hour:'2-digit',minute:'2-digit'});
    tk(); setInterval(tk, 15000);
    setInterval(() => { if(this.state.tracking || this.state.dataAge) this.render(); }, 1000);
  }

  async reqWake() {
    if(!('wakeLock' in navigator) || !this.cfg.wakeOn || this.wakeLock) return;
    try {
      const wl = await navigator.wakeLock.request('screen');
      this.wakeLock = wl;
      wl.addEventListener('release', () => { if(this.wakeLock === wl) this.wakeLock = null; });
    }catch(e){}
  }
  relWake() {
    const wl = this.wakeLock; this.wakeLock = null;
    if(wl) { try{ wl.release(); }catch(e){} }
  }

  checkAutoStart() {
    let s=false;
    const go = () => { if(s)return; s=true; this.toggleTracking(true); };
    if(navigator.permissions) {
      navigator.permissions.query({name:'geolocation'}).then(r => {
        if(r.state==='granted') go(); else this.toggleTracking(true);
      }).catch(() => this.toggleTracking(true));
    } else {
      this.toggleTracking(true);
    }
  }
}

// Bootstrap
window.RotaProApp = new AppManager();

// PWA: çevrimdışı açılış için service worker
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
