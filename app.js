/**
 * RotaPro — Complete Mobile Navigation App (Car, OBD-2 & Enhanced HUD Edition)
 * MCT YAZILIM — 2026 Optimized & Bug-Free
 */
'use strict';

const _killSplashNow = () => {
  try {
    const s = document.getElementById('splash');
    if (s && !s.classList.contains('hide')) {
      s.classList.add('hide');
      setTimeout(() => { try { s.remove(); } catch (_) {} }, 500);
    }
  } catch (_) {}
};

window.addEventListener('error', () => setTimeout(_killSplashNow, 50));
window.addEventListener('unhandledrejection', () => setTimeout(_killSplashNow, 50));
setTimeout(_killSplashNow, 6000);

/* ═══════ Utilities ═══════ */
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} },
  json(k, fb){ try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
};

async function fetchJSON(url, ms = 7000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OVERPASS_HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function fetchOverpass(q, ms = 8000) {
  let lastErr;
  for (const h of OVERPASS_HOSTS) {
    try { return await fetchJSON(h + '?data=' + encodeURIComponent(q), ms); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* ═══════ Config ═══════ */
class Config {
  constructor() {
    this.autoStart = true; this.autoCenter = true; this.rotateMode = true;
    this.soundOn = true; this.ttsOn = true; this.wakeOn = true;
    this.lightTheme = false; this.threshold = 10;
    this.showLights = false; this.showCams = true; this.showWorks = true;
    this.vehicle = 'benzin'; this.fuelPrice = 45; this.showFuel = true;
    this.carName = 'Aracım'; this.useOBD = false;
    this.load();
  }
  load() {
    const s = store.get('rp_cfg_v11');
    if (!s) return;
    try {
      const o = JSON.parse(s);
      this.autoStart   = o.as !== false;
      this.autoCenter  = o.ac !== false;
      this.rotateMode  = o.rot !== false;
      this.soundOn     = o.snd !== false;
      this.ttsOn       = o.tts !== false;
      this.wakeOn      = o.wk  !== false;
      this.lightTheme  = o.lt === true;
      this.threshold   = clamp(parseInt(o.thr, 10) || 10, 1, 50);
      this.showLights  = o.sl === true;
      this.showCams    = o.sc !== false;
      this.showWorks   = o.sw === true;
      this.vehicle     = ['benzin','dizel','lpg','elektrik'].includes(o.vh) ? o.vh : 'benzin';
      const fp = parseFloat(o.fp);
      this.fuelPrice   = Number.isFinite(fp) ? Math.max(0, fp) : 45;
      this.showFuel    = o.sf !== false;
      this.carName     = o.cn || 'Aracım';
      this.useOBD      = o.obd === true;
    } catch (e) {}
  }
  save(ac, rot, snd, tts, wk, lt, thr, x) {
    this.autoCenter = ac; this.rotateMode = rot;
    this.soundOn = snd; this.ttsOn = tts; this.wakeOn = wk;
    this.lightTheme = lt;
    this.threshold = clamp(parseInt(thr, 10) || 10, 1, 50);
    if (x) {
      this.showLights = !!x.lights;
      this.showCams    = !!x.cams;
      this.showWorks   = !!x.works;
      if (x.autoStart !== undefined) this.autoStart = !!x.autoStart;
      if (x.vehicle !== undefined) this.vehicle = x.vehicle;
      if (x.fuelPrice !== undefined) this.fuelPrice = parseFloat(x.fuelPrice) || 0;
      if (x.showFuel  !== undefined) this.showFuel  = !!x.showFuel;
      if (x.carName   !== undefined) this.carName   = x.carName.trim() || 'Aracım';
      if (x.useOBD    !== undefined) this.useOBD    = !!x.useOBD;
    }
    store.set('rp_cfg_v11', JSON.stringify({
      as: this.autoStart, ac: this.autoCenter, rot: this.rotateMode,
      snd: this.soundOn, tts: this.ttsOn, wk: this.wakeOn,
      lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel, cn: this.carName, obd: this.useOBD
    }));
  }
}

/* ═══════ SheetManager ═══════ */
class SheetManager {
  constructor(bg = 'sheet-bg', sh = 'sheet', hd = 'sheet-handle', op = 'btn-cfg', cl = 'btn-save') {
    this.ids = { op, cl, bg, sh };
    this.bg = $(bg); this.sheet = $(sh); this.handle =$(hd);
    this.isOpen = false;
    this.bindEvents();
  }
  bindEvents() {
    const cfgBtn = $(this.ids.op);
    if (cfgBtn) cfgBtn.addEventListener('click', () => this.open());
    const saveBtn = $(this.ids.cl);
    if (saveBtn) saveBtn.addEventListener('click', () => this.close());
    if (this.bg) this.bg.addEventListener('click', e => { if (e.target === this.bg) this.close(); });
  }
  open() {
    if (!this.bg || !this.sheet) return;
    this.bg.style.display = 'flex';
    void this.bg.offsetWidth;
    this.bg.classList.add('open');
    this.sheet.classList.add('open');
    this.isOpen = true;
  }
  close() {
    if (!this.bg || !this.sheet) return;
    this.sheet.classList.remove('open');
    this.bg.classList.remove('open');
    this.isOpen = false;
    setTimeout(() => { if (!this.isOpen && this.bg) this.bg.style.display = 'none'; }, 300);
  }
}

/* ═══════ Coğrafi Yard. & GPS Filtresi ═══════ */
function segProj(la, ln, a, b) {
  const rad = Math.PI / 180, kx = 111320 * Math.cos(la * rad), ky = 110540;
  const ax = (a[1] - ln) * kx, ay = (a[0] - la) * ky, bx = (b[1] - ln) * kx, by = (b[0] - la) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
  let t = L2 ? -(ax * dx + ay * dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const px = ax + t * dx, py = ay + t * dy;
  return { d: Math.hypot(px, py), p: [la + py / ky, ln + px / kx], brg: (Math.atan2(dx, dy) / rad + 360) % 360 };
}

class GPSFilter {
  constructor() { this.v = -1; }
  process(la, ln, acc, t, spd) {
    acc = Math.max(acc, 3);
    if (this.v < 0 || t - this.t > 20000 || hav(this.la, this.ln, la, ln) > 400) {
      this.la = la; this.ln = ln; this.v = acc * acc; this.t = t; return [la, ln];
    }
    const dt = Math.max(0, (t - this.t) / 1000);
    const gap = hav(this.la, this.ln, la, ln);
    if (gap > spd * dt * 1.5 + 3 * acc + 12 && (this.rej || 0) < 2) { this.rej = (this.rej || 0) + 1; this.t = t; return [this.la, this.ln]; }
    this.rej = 0;
    this.v += dt * Math.pow(Math.max(3, spd), 2);
    this.t = t;
    const k = this.v / (this.v + acc * acc);
    this.la += k * (la - this.la); this.ln += k * (ln - this.ln);
    this.v = (1 - k) * this.v;
    return [this.la, this.ln];
  }
}

/* ═══════ RotaMap ═══════ */
class RotaMap {
  constructor(appConfig) {
    this.cfg = appConfig;
    if (typeof L === 'undefined') return;
    try {
      this.map = L.map('map', {
        center: (() => { try { return JSON.parse(store.get('rp_last')) || [39.92, 32.85]; } catch (e) { return [39.92, 32.85]; } })(), zoom: 18, zoomControl: false,
        attributionControl: false, preferCanvas: true
      });

      this.tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxZoom: 19, minZoom: 3, crossOrigin: true, attribution: '&copy; OpenStreetMap'
      }).addTo(this.map);

      this.mapRot = $('map-rot');
      this.pos = null;
      this._targetHd = 0;
      this._renderMapAngle = 0;
      this._renderMarkerAngle = 0;
      this._hasHd = false;
      this._prevPos = null;
      this._lastMoveHdg = null;
      this._hd = 0;

      this._initMe();

      this.lightsL = L.layerGroup().addTo(this.map);
      this.camsL   = L.layerGroup().addTo(this.map);
      this.workL   = L.layerGroup().addTo(this.map);
      this.destMarkerL = L.layerGroup().addTo(this.map);

      setTimeout(() => { try { this.map.invalidateSize(); } catch (_) {} }, 250);
      window.addEventListener('resize', () => { try { this.map.invalidateSize(); } catch (_) {} });
    } catch (e) { console.error(e); }
  }

  setTheme(light) {
    document.body.classList.toggle('light-theme', !!light);
    const mt = document.getElementById('meta-theme');
    if (mt) mt.setAttribute('content', light ? '#f0f2f5' : '#0a0a0f');
  }

  _initMe() {
    this.following = this.cfg.autoCenter;
    this.disp = null;
    this.moving = false;
    this.meEl = null;
    const icon = L.divIcon({
      className: 'me-wrap', iconSize: [64, 64], iconAnchor: [32, 32],
      html: '<div class="me" id="me"><div class="me-halo"></div>' +
            '<div class="me-rot" id="me-rot"><div class="me-cone"></div>' +
            '<svg class="me-arrow" viewBox="0 0 24 24"><path d="M12 2L4 21l8-4.5L20 21 12 2z" fill="#4285F4" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg></div>' +
            '<div class="me-dot"></div></div>'
    });
    this.meMarker = L.marker([39.92, 32.85], { icon, interactive: false });
    this.accCircle = L.circle([39.92, 32.85], { radius: 0, stroke: false, fillColor: '#4285F4', fillOpacity: 0.15, interactive: false });
    this.btnRecenter = $('btn-recenter');
    if (this.btnRecenter) this.btnRecenter.addEventListener('click', () => this.follow());
    this.map.on('dragstart', () => this.unfollow());
    this._syncRecenter();
  }

  follow() { this.following = true; if (this.disp) this.map.setView(this.disp, Math.max(this.map.getZoom(), 17), { animate: true }); this._syncRecenter(); }
  unfollow() { this.following = false; this._syncRecenter(); }
  _syncRecenter() {
    if (this.btnRecenter) {
      this.btnRecenter.classList.toggle('show', !!this.pos);
      this.btnRecenter.classList.toggle('following', !!this.following);
    }
  }

  _blendHeading(c, a) {
    if (!this._hasHd) {
      this._targetHd = (c % 360 + 360) % 360; this._hasHd = true;
      if (this.meEl) this.meEl.classList.add('has-hd');
    } else {
      const diff = ((c - this._targetHd + 540) % 360) - 180;
      this._targetHd = ((this._targetHd + diff * a) % 360 + 360) % 360;
    }
    this._hd = this._targetHd;
  }

  snap(la, ln, brg) {
    this.pos = [la, ln];
    if (this.accCircle) this.accCircle.setLatLng(this.pos);
    if (brg != null && this._spd > 1.2) this._blendHeading(brg, 0.45);
  }

  pushFix(la, ln, ac, hdg, kmh) {
    if (this.init && Number.isFinite(ac) && ac > 300) return;
    this.pos = [la, ln];
    this._fixT = Date.now();
    this._spd = Math.max(0, kmh) / 3.6;
    if (!this.init) {
      this.init = true;
      this.disp = [la, ln];
      this.meMarker.setLatLng(this.disp).addTo(this.map);
      this.accCircle.setLatLng(this.disp).addTo(this.map);
      this.map.setView(this.disp, 18, { animate: false });
      this.meEl = $('me');
    }
    if (Number.isFinite(ac)) this.accCircle.setRadius(Math.min(ac, 120));
    this.accCircle.setLatLng(this.pos);
    this.moving = kmh > 3;
    if (this.meEl) this.meEl.classList.toggle('moving', this.moving);

    if (this._prevPos && kmh > 3) {
      const d = hav(this._prevPos[0], this._prevPos[1], la, ln);
      if (d >= 2) this._lastMoveHdg = bearingTo(this._prevPos[0], this._prevPos[1], la, ln);
    }
    this._prevPos = [la, ln];

    let candidate = null;
    if (Number.isFinite(hdg) && hdg >= 0 && kmh > 2.5) candidate = hdg;
    else if (this._lastMoveHdg !== null && kmh > 3) candidate = this._lastMoveHdg;
    if (candidate !== null) this._blendHeading(candidate, kmh > 25 ? 0.5 : 0.3);
    this._syncRecenter();
  }

  frame() {
    if (this.disp && this.pos) {
      let tgt = this.pos;
      const dla = tgt[0] - this.disp[0], dln = tgt[1] - this.disp[1];
      if (Math.abs(dla) > 1e-8 || Math.abs(dln) > 1e-8) {
        this.disp = [this.disp[0] + dla * 0.2, this.disp[1] + dln * 0.2];
        this.meMarker.setLatLng(this.disp);
        if (this.following) this.map.setView(this.disp, this.map.getZoom(), { animate: false });
      }
    }
    const shouldRotate = this.cfg.rotateMode && this.following && this._hasHd;
    const mapRotEl = this.mapRot || $('map-rot');
    const wantOff = shouldRotate ? Math.round(window.innerHeight * 0.2) : 0;
    this._renderOff = (this._renderOff || 0) + (wantOff - (this._renderOff || 0)) * 0.08;
    
    if (shouldRotate) {
      const targetMap = -this._targetHd;
      const diffMap = ((targetMap - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.14;
      if (mapRotEl) mapRotEl.style.transform = `translate3d(0, ${this._renderOff.toFixed(1)}px, 0) rotate(${this._renderMapAngle.toFixed(2)}deg)`;
    } else {
      const diffMap = ((0 - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.15;
      if (mapRotEl) mapRotEl.style.transform = `translate3d(0, ${this._renderOff.toFixed(1)}px, 0) rotate(${this._renderMapAngle.toFixed(2)}deg)`;
    }
  }

  setDestinationPin(la, ln, title = 'Seçilen Hedef') {
    this.destMarkerL.clearLayers();
    const pop = document.createElement('div'); pop.textContent = title;
    L.circleMarker([la, ln], { radius: 10, color: '#ffffff', weight: 2.5, fillColor: '#2d7aff', fillOpacity: 1.0 }).addTo(this.destMarkerL).bindPopup(pop).openPopup();
  }

  setPOIs(list, cfg) {
    try {
      this.lightsL.clearLayers(); this.camsL.clearLayers(); this.workL.clearLayers();
      for (const p of list) {
        let target = null;
        if (p.kind === 'light' && cfg.showLights) target = this.lightsL;
        else if (['work', 'pothole', 'accident', 'closed', 'oneway'].includes(p.kind) && cfg.showWorks) target = this.workL;
        else if (cfg.showCams || p.kind === 'cam') target = this.camsL;
        if (!target) continue;
        L.circleMarker([p.lat, p.lng], { radius: 7, color: '#ffffff', weight: 1.5, fillColor: '#dc3545', fillOpacity: 0.95 }).addTo(target);
      }
    } catch (_) {}
  }
}

/* ═══════ AppManager ═══════ */
class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.modesSheet = new SheetManager('modes-bg', 'modes-sheet', 'modes-handle', 'btn-modes', 'modes-close');
    this.destSheet = new SheetManager('dest-bg', 'dest-sheet', 'dest-handle', 'btn-dest', 'dest-close');
    this.hazardSheet = new SheetManager('hazard-bg', 'hazard-sheet', 'hazard-handle', 'btn-hazard', 'hazard-cancel');
    this.layersSheet = new SheetManager('layers-bg', 'layers-sheet', 'layers-handle', 'btn-layers', 'layers-close');
    this.map = new RotaMap(this.cfg);

    this.dom = {
      spdVal: $('spd-val'), spdBar: $('spd-bar'), speedDash:$('speed-dash'),
      limBadge: $('limit-badge'), limNum:$('limit-num'),
      ftDot: $('ft-dot'), ftGps: $('ft-gps'), ftClock:$('ft-clock'),
      isLoc: $('is-loc'), isTemp: $('is-temp'), isWind:$('is-wind'),
      hdrRoad: $('hdr-road'), dur:$('m-dur')
    };

    const loadedHazards = (() => { const h = store.json('rp_hazards', []); return Array.isArray(h) ? h : []; })();
    this.state = { lat: null, lng: null, spd: 0, startTime: Date.now(), poi: loadedHazards };
    this.map.setTheme(this.cfg.lightTheme);
    this.fx = new Features(this);
    this.bindUI();
    this.startClock();
    this.startSplash();
    this.startGPS();
    this.startLoop();

    setTimeout(() => { this.fx.refreshPOIs(); }, 600);
  }

  bindUI() {
    const save = () => {
      this.cfg.save(
        $('cfg-ac')?.checked, $('cfg-rot')?.checked, $('cfg-snd')?.checked,
        $('cfg-tts')?.checked, $('cfg-wk')?.checked, $('cfg-lt')?.checked,
        $('cfg-thr')?.value, { carName: $('cfg-car-name')?.value, useOBD:$('cfg-obd')?.checked }
      );
      this.map.setTheme(this.cfg.lightTheme);
    };

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr','cfg-car-name','cfg-obd'].forEach(id => {
      const el = $(id); if (el) el.addEventListener('change', save);
    });

    $('btn-open-modes')?.addEventListener('click', () => this.modesSheet.open());
    $('modes-ok-btn')?.addEventListener('click', () => this.modesSheet.close());$('btn-zoom-in')?.addEventListener('click', () => this.map.map?.zoomIn());
    $('btn-zoom-out')?.addEventListener('click', () => this.map.map?.zoomOut());
    $('btn-theme')?.addEventListener('click', () => {
      const light = !document.body.classList.contains('light-theme');
      this.map.setTheme(light); save();
    });

    const searchAddr = () => { const q = $('dest-q')?.value.trim(); if (q) this.fx.search(q, false); };$('dest-go')?.addEventListener('click', searchAddr);
    $('dest-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });$('dest-pick')?.addEventListener('click', () => { this.destSheet.close(); document.body.classList.add('picking'); this.map.unfollow(); });
    $('pick-no')?.addEventListener('click', () => document.body.classList.remove('picking'));$('pick-ok')?.addEventListener('click', () => { document.body.classList.remove('picking'); this.fx.onPick(); });
  }

  startClock() {
    setInterval(() => {
      const d = new Date();
      if (this.dom.ftClock) this.dom.ftClock.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      if (this.dom.dur) {
        const el = Math.floor((Date.now() - this.state.startTime) / 1000);
        this.dom.dur.textContent = `${String(Math.floor(el/60)).padStart(2,'0')}:${String(el%60).padStart(2,'0')}`;
      }
    }, 1000);
  }

  startSplash() {
    let progress = 0;
    const itv = setInterval(() => {
      progress += 5;
      if (progress >= 100) { clearInterval(itv); _killSplashNow(); }
    }, 50);
    $('splash')?.addEventListener('click', _killSplashNow);
  }

  startGPS() {
    if (!('geolocation' in navigator)) return;
    this._kf = new GPSFilter();
    navigator.geolocation.watchPosition(pos => {
      _killSplashNow();
      const { latitude: rla, longitude: rln, speed, heading, accuracy } = pos.coords;
      const acc = Number.isFinite(accuracy) ? accuracy : 50;
      const kmhRaw = (speed !== null && Number.isFinite(speed)) ? Math.max(0, speed * 3.6) : 0;
      const [la, ln] = this._kf.process(rla, rln, acc, pos.timestamp || Date.now(), kmhRaw / 3.6);
      
      let kmh = kmhRaw;
      if (this.cfg.useOBD && this.fx.obdCtrl?.connected && this.fx.obdCtrl.obdSpeed >= 0) {
        kmh = this.fx.obdCtrl.obdSpeed;
      }

      this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
      if (this.dom.ftDot) this.dom.ftDot.classList.add('on');
      if (this.dom.ftGps) this.dom.ftGps.textContent = `${this.cfg.carName} (Aktif)`;
      
      this.map.pushFix(la, ln, acc, heading, kmh);
      this.fx.onFix(la, ln, kmh, pos.coords.altitude, heading, acc);
      this.render();
    }, () => {}, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  }

  render() {
    const spd = Math.round(this.state.spd);
    if (this.dom.spdVal) this.dom.spdVal.textContent = spd;
    if (this.dom.spdBar) this.dom.spdBar.style.transform = `scaleX(${clamp(spd / 120, 0, 1)})`;
  }

  startLoop() {
    const loop = () => { this.map.frame(); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

/* ═══════ Müzik Kumandası ═══════ */
class MusicController {
  constructor() {
    this.playing = false;
    $('mw-play')?.addEventListener('click', () => { this.playing = !this.playing; $('mw-play').textContent = this.playing ? '⏸' : '▶'; });
  }
}

/* ═══════ OBD-2 Bluetooth Entegrasyonu ═══════ */
class OBDController {
  constructor(features) {
    this.fx = features; this.device = null; this.server = null; this.characteristic = null;
    this.connected = false; this.obdSpeed = -1;
  }
  async connect() {
    if (!('bluetooth' in navigator)) return toast('Bluetooth desteklenmiyor.');
    try {
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }, { namePrefix: 'OBD' }, { namePrefix: 'ELM' }]
      });
      this.server = await this.device.gatt.connect();
      const service = await this.server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb');
      this.characteristic = await service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb');
      this.connected = true;
      toast('✅ OBD-2 Bağlandı!');
      if ($('obd-status-text'))$('obd-status-text').textContent = 'Bağlandı';
      this.fx.cfg.useOBD = true;
      if ($('cfg-obd'))$('cfg-obd').checked = true;
    } catch (_) { toast('OBD bağlantısı başarısız.'); }
  }
}

/* ═══════ Features Sınıfı (Tüm Fonksiyonlar Korundu) ═══════ */
class Features {
  constructor(app) {
    this.app = app; this.cfg = app.cfg; this.rm = app.map;
    this.s = { max: 0, sum: 0, n: 0, dist: 0 };
    this.prev = null; this.hd = null; this.limit = null;
    this.route = null; this.dest = null; this.pendingDest = null;
    this.routeL = L.layerGroup().addTo(this.rm.map);
    this.music = new MusicController();
    this.obdCtrl = new OBDController(this);

    $('btn-hud')?.addEventListener('click', () => this.toggleHUD());$('btn-exit-hud')?.addEventListener('click', () => this.toggleHUD());
    $('btn-connect-obd')?.addEventListener('click', () => this.obdCtrl.connect());$('nb-x')?.addEventListener('click', () => this.clearRoute());
  }

  toggleHUD() {
    const isHud = document.body.classList.toggle('hud-mode');
    toast(isHud ? 'HUD Modu Aktif (Ön Cam Görünümü)' : 'Normal Mod');
  }

  onFix(la, ln, kmh, alt, hdg, acc) {
    const s = this.s;
    if (this.prev) {
      const dd = hav(this.prev[0], this.prev[1], la, ln);
      if (dd > 3 && dd < 500 && kmh > 1) s.dist += dd;
    }
    this.prev = [la, ln];
    s.max = Math.max(s.max, kmh);
    if ($('ss-max'))$('ss-max').textContent = Math.round(s.max);
    if ($('ss-trip'))$('ss-trip').textContent = (s.dist / 1000).toFixed(1);
    if (this.route) this.navTick(la, ln);
  }

  async search(q, nearby) {
    const res = $('dest-res'); if (!res) return;
    res.innerHTML = `<div style="text-align:center;padding:12px;color:var(--text-secondary)">🔍 Aranıyor...</div>`;
    try {
      const list = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=tr&q=${encodeURIComponent(q)}`, 7000);
      if (!list || !list.length) { res.innerHTML = `<div style="text-align:center;padding:12px;">Sonuç bulunamadı.</div>`; return; }
      res.innerHTML = '';
      list.forEach(it => {
        const b = document.createElement('button');
        b.className = 'dest-row';
        b.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);">${esc(it.display_name)}</div>`;
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(+it.lat, +it.lon, it.display_name); });
        res.appendChild(b);
      });
    } catch (_) { res.innerHTML = `<div style="text-align:center;padding:12px;color:var(--red);">Arama hatası.</div>`; }
  }

  onPick() {
    const c = this.rm.map.getCenter();
    this.setDestination(c.lat, c.lng, 'Seçilen Konum');
  }

  setDestination(la, ln, name) {
    this.dest = { la, ln, name };
    this.rm.setDestinationPin(la, ln, name);
    this.fetchRoute(true);
  }

  async fetchRoute(first) {
    const d = this.dest; if (!d) return;
    const a = this.app.state;
    let sl = a.lat, sn = a.lng;
    if (sl == null) { const c = this.rm.map.getCenter(); sl = c.lat; sn = c.lng; }
    const q = `${sn},${sl};${d.ln},${d.la}?overview=full&geometries=geojson&steps=true`;
    try {
      const j = await fetchJSON('https://router.project-osrm.org/route/v1/driving/' + q, 8000);
      if (j.code === 'Ok' && j.routes && j.routes[0]) {
        this.buildRoute(j.routes[0]);
        if (first) {
          this.rm.map.fitBounds(L.latLngBounds(this.route.pts), { padding: [70, 150], maxZoom: 17 });
          toast(`Rota hazır: ${Math.round(this.route.dist / 1000)} km`);
        }
      }
    } catch (_) { toast('Rota hesaplanamadı.'); }
  }

  buildRoute(r) {
    const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    this.routeL.clearLayers();
    L.polyline(pts, { color: '#2d7aff', weight: 7, opacity: 1 }).addTo(this.routeL);
    this.route = { pts, cum, dist: r.distance, dur: r.duration, idx: 0 };
    const nb = $('nav-banner'); if (nb) nb.style.display = 'flex';
  }

  navTick(la, ln) {
    const r = this.route; if (!r || la == null) return;
    let best = r.idx, bd = 1e12;
    for (let i = r.idx; i < Math.min(r.pts.length, r.idx + 100); i++) {
      const d = hav(la, ln, r.pts[i][0], r.pts[i][1]);
      if (d < bd) { bd = d; best = i; }
    }
    r.idx = best;
    const remain = Math.max(0, r.cum[r.cum.length - 1] - r.cum[best]);
    if (remain < 35) { toast('🏁 Hedefe vardınız!'); this.clearRoute(); }
    if ($('nb-dist'))$('nb-dist').textContent = remain >= 1000 ? (remain / 1000).toFixed(1) + ' km' : Math.round(remain) + ' m';
  }

  clearRoute() {
    this.route = null; this.dest = null;
    this.routeL.clearLayers(); this.rm.destMarkerL.clearLayers();
    const nb = $('nav-banner'); if (nb) nb.style.display = 'none';
  }

  refreshPOIs() { this.rm.setPOIs(this.app.state.poi, this.cfg); }
}

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });