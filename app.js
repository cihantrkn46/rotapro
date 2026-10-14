/**
 * RotaPro v11.0 — Complete Mobile Navigation App
 * MCT YAZILIM
 */
'use strict';

const _killSplashNow = () => {
  try {
    const s = document.getElementById('splash');
    if (s && s.parentNode && !s.classList.contains('hide')) {
      s.classList.add('hide');
      setTimeout(() => { try { s.remove(); } catch (_) {} }, 900);
    }
  } catch (_) {}
};
window.addEventListener('error', (e) => {
  console.error('[RotaPro] Hata:', e.message, '@', e.filename, ':', e.lineno);
  setTimeout(_killSplashNow, 60);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[RotaPro] Promise hatası:', e.reason);
  setTimeout(_killSplashNow, 60);
});
setTimeout(_killSplashNow, 12000);

/* ═══════ TTS Voice Preload & Mobile Kick ═══════ */
let _cachedVoices = null;
let _voiceLoadRetries = 0;
function _loadVoices(force = false) {
  if (!('speechSynthesis' in window)) return;
  try {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) { _cachedVoices = v; _voiceLoadRetries = 0; return; }
    const maxRetries = force ? 40 : 20;
    if (_voiceLoadRetries < maxRetries) {
      _voiceLoadRetries++;
      setTimeout(() => _loadVoices(false), 250);
    }
  } catch (e) {}
}
if ('speechSynthesis' in window) {
  _loadVoices();
  try { window.speechSynthesis.onvoiceschanged = () => { _voiceLoadRetries = 0; _loadVoices(true); }; } catch (e) {}
  const _voiceKick = () => { 
    _voiceLoadRetries = 0; 
    _loadVoices(true); 
    try { if (window.speechSynthesis.paused) window.speechSynthesis.resume(); } catch(e){}
  };
  document.addEventListener('touchend', _voiceKick, { once: true, passive: true });
  document.addEventListener('click',    _voiceKick, { once: true, passive: true });
}

/* ═══════ Utilities ═══════ */
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hav = (a, b, c, d) => {
  const R = 6371, dr = Math.PI / 180;
  const x = Math.sin((c - a) * dr / 2) ** 2 +
            Math.cos(a * dr) * Math.cos(c * dr) * Math.sin((d - b) * dr / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
};

async function fetchJSON(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

const OVERPASS_EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const _ovpPenalty = [0, 0, 0];
const _ovpNextOk  = [0, 0, 0];

async function fetchOverpass(q, ms = 9000) {
  const now = Date.now();
  let lastErr;
  const order = [0, 1, 2].sort((a, b) => _ovpNextOk[a] - _ovpNextOk[b]);
  for (const i of order) {
    if (_ovpNextOk[i] > now) { lastErr = lastErr || new Error('throttled'); continue; }
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), ms);
    try {
      const r = await fetch(OVERPASS_EPS[i], {
        method: 'POST',
        body: 'data=' + encodeURIComponent(q),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
        signal: ac.signal
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const data = await r.json();
      _ovpPenalty[i] = 0; _ovpNextOk[i] = 0;
      return data;
    } catch (e) {
      lastErr = e;
      _ovpPenalty[i] = Math.min(40000, _ovpPenalty[i] ? _ovpPenalty[i] * 2 : 5000);
      _ovpNextOk[i]  = Date.now() + _ovpPenalty[i];
    } finally { clearTimeout(t); }
  }
  throw lastErr || new Error('Overpass: tüm uçlar başarısız');
}

function distToPolyline(la, ln, geom) {
  if (!geom || !geom.length) return Infinity;
  const k = Math.cos(la * Math.PI / 180), m = 111320;
  const P = g => [(g.lon - ln) * k * m, (g.lat - la) * m];
  if (geom.length === 1) { const [x, y] = P(geom[0]); return Math.hypot(x, y); }
  let best = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const [ax, ay] = P(geom[i]), [bx, by] = P(geom[i + 1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(-(ax * dx + ay * dy) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

const TR_DEFAULTS = {
  motorway: 120, motorway_link: 90, trunk: 110, trunk_link: 90,
  primary: 90, primary_link: 70, secondary: 80, secondary_link: 60,
  tertiary: 70, tertiary_link: 60, residential: 50, living_street: 30,
  unclassified: 60, service: 30, track: 30, road: 50, walk: 20, pedestrian: 20
};
function parseMaxspeed(s, road) {
  if (!s) return road ? (TR_DEFAULTS[road] ?? null) : null;
  const str = String(s).trim().toLowerCase();
  const n = parseInt(str, 10);
  if (/^\d+/.test(str) && n > 0) return /mph/.test(str) ? Math.round(n * 1.609) : n;
  const z = str.includes(':') ? str.split(':').pop() : str;
  if (/^\d+$/.test(z)) return parseInt(z, 10);
  return TR_DEFAULTS[str] ?? (road ? TR_DEFAULTS[road] : null) ?? null;
}

const bearing = (a1, b1, a2, b2) => {
  const R = Math.PI / 180, y = Math.sin((b2 - b1) * R) * Math.cos(a2 * R);
  const x = Math.cos(a1 * R) * Math.sin(a2 * R) -
            Math.sin(a1 * R) * Math.cos(a2 * R) * Math.cos((b2 - b1) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
};

const POI_LABEL = { cam: 'radar', light: 'trafik ışığı', work: 'yol çalışması', pothole: 'çukur uyarısı', accident: 'kaza uyarısı' };
const POI_RANGE = { cam: 500, light: 200, work: 400, pothole: 300, accident: 400 };

const FUEL_TABLES = {
  benzin:   { 0: 0.7, 20: 1.8, 40: 2.5, 60: 3.2, 80: 4.2, 100: 6.0, 120: 8.5, 140: 12.0, 160: 16.0 },
  dizel:    { 0: 0.6, 20: 1.5, 40: 2.1, 60: 2.8, 80: 3.6, 100: 5.2, 120: 7.4, 140: 10.5, 160: 14.0 },
  lpg:      { 0: 0.9, 20: 2.2, 40: 3.1, 60: 4.0, 80: 5.2, 100: 7.5, 120: 10.6, 140: 15.0, 160: 20.0 },
  elektrik: { 0: 0.3, 20: 2.0, 40: 3.0, 60: 4.2, 80: 6.0, 100: 9.0, 120: 13.5, 140: 19.0, 160: 26.0 }
};
const FUEL_UNIT    = { benzin: 'L', dizel: 'L', lpg: 'L', elektrik: 'kWh' };
const CO2_PER_UNIT = { benzin: 2.31, dizel: 2.68, lpg: 1.51, elektrik: 0.40 };

function fuelRateAt(vehicle, v) {
  const t = FUEL_TABLES[vehicle] || FUEL_TABLES.benzin;
  const keys = Object.keys(t).map(Number).sort((a, b) => a - b);
  if (v <= keys[0]) return t[keys[0]];
  if (v >= keys[keys.length - 1]) return t[keys[keys.length - 1]];
  for (let i = 0; i < keys.length - 1; i++) {
    if (v >= keys[i] && v <= keys[i + 1]) {
      const k = (v - keys[i]) / (keys[i + 1] - keys[i]);
      return t[keys[i]] * (1 - k) + t[keys[i + 1]] * k;
    }
  }
  return t[keys[0]];
}

/* ═══════ Config ═══════ */
class Config {
  constructor() {
    this.autoStart = true; this.autoCenter = true; this.rotateMode = true;
    this.soundOn = true; this.ttsOn = true; this.wakeOn = true;
    this.lightTheme = false; this.threshold = 10;
    this.showLights = false; this.showCams = true; this.showWorks = false;
    this.vehicle = 'benzin'; this.fuelPrice = 45; this.showFuel = true;
    this.load();
  }
  load() {
    const s = store.get('rp8');
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
      this.fuelPrice = Number.isFinite(fp) ? Math.max(0, fp) : 45;
      this.showFuel    = o.sf !== false;
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
      if (x.vehicle !== undefined && ['benzin','dizel','lpg','elektrik'].includes(x.vehicle)) this.vehicle = x.vehicle;
      if (x.fuelPrice !== undefined) {
        const fp = parseFloat(x.fuelPrice);
        this.fuelPrice = Number.isFinite(fp) ? Math.max(0, fp) : 0;
      }
      if (x.showFuel  !== undefined) this.showFuel  = !!x.showFuel;
    }
    store.set('rp8', JSON.stringify({
      as: this.autoStart, ac: this.autoCenter, rot: this.rotateMode,
      snd: this.soundOn, tts: this.ttsOn, wk: this.wakeOn,
      lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel
    }));
  }
}

/* ═══════ SheetManager ═══════ */
class SheetManager {
  constructor(bg = 'sheet-bg', sh = 'sheet', hd = 'sheet-handle', op = 'btn-cfg', cl = 'btn-save') {
    this.ids = { op, cl, bg, sh };
    this.bg = $(bg); this.sheet = $(sh); this.handle = $(hd);
    this.isOpen = false; this.startY = 0; this.currentY = 0; this.dragging = false;
    this._onMove = e => this.onDragMove(e);
    this._onEnd = () => this.onDragEnd();
    this._onCancel = () => this._cancelDrag();
    this.bindEvents();
  }
  bindEvents() {
    const cfgBtn = $(this.ids.op);
    if (cfgBtn) cfgBtn.addEventListener('click', () => this.open());
    const saveBtn = $(this.ids.cl);
    if (saveBtn) saveBtn.addEventListener('click', () => this.close());
    if (this.handle) {
      const start = e => this.onDragStart(e);
      this.handle.addEventListener('touchstart', start, { passive: true });
      this.handle.addEventListener('mousedown', start);
    }
    if (this.bg) this.bg.addEventListener('click', e => { if (e.target === this.bg) this.close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && this.isOpen) this.close(); });
  }
  attachDrag() {
    try {
      document.addEventListener('touchmove', this._onMove, { passive: false });
      document.addEventListener('touchend', this._onEnd);
      document.addEventListener('touchcancel', this._onCancel);
      document.addEventListener('mousemove', this._onMove);
      document.addEventListener('mouseup', this._onEnd);
    } catch (_) {}
  }
  detachDrag() {
    try {
      document.removeEventListener('touchmove', this._onMove);
      document.removeEventListener('touchend', this._onEnd);
      document.removeEventListener('touchcancel', this._onCancel);
      document.removeEventListener('mousemove', this._onMove);
      document.removeEventListener('mouseup', this._onEnd);
    } catch (_) {}
  }
  open() {
    if (!this.bg || !this.sheet) return;
    this.bg.style.display = 'flex';
    void this.bg.offsetWidth;
    this.bg.classList.add('open');
    this.sheet.classList.add('open');
    this.isOpen = true;
    this.attachDrag();
  }
  close() {
    if (!this.bg || !this.sheet) return;
    this.detachDrag();
    this.sheet.classList.remove('open');
    this.sheet.classList.remove('dragging');
    this.bg.classList.remove('open');
    this.isOpen = false;
    this.dragging = false;
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    setTimeout(() => { if (!this.isOpen && this.bg) this.bg.style.display = 'none'; }, 400);
  }
  pointY(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return e.clientY;
  }
  onDragStart(e) {
    if (!this.isOpen) return;
    this.dragging = true; this.currentY = 0;
    this.startY = this.pointY(e);
    this.sheet.classList.add('dragging');
  }
  onDragMove(e) {
    if (!this.dragging) return;
    const y = this.pointY(e);
    this.currentY = Math.max(0, y - this.startY);
    this.sheet.style.transform = `translateZ(0) translateY(${this.currentY}px)`;
    const opacity = 1 - (this.currentY / window.innerHeight);
    this.bg.style.backgroundColor = `rgba(0,0,0,${Math.max(0, opacity * 0.5)})`;
    if (this.currentY > 0 && e.cancelable) e.preventDefault();
  }
  onDragEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    this.sheet.classList.remove('dragging');
    const cancelled = this.currentY > 100;
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    this.currentY = 0;
    if (cancelled) this.close();
  }
  _cancelDrag() {
    if (!this.dragging) return;
    this.dragging = false;
    this.sheet.classList.remove('dragging');
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    this.currentY = 0;
  }
}

/* ═══════ RotaMap ═══════ */
class RotaMap {
  constructor() {
    if (typeof L === 'undefined') {
      console.warn('[RotaMap] Leaflet bekleniyor...');
      return;
    }
    try {
      this.map = L.map('map', {
        center: [39.92, 32.85], zoom: 18, zoomControl: false,
        attributionControl: true, preferCanvas: true,
        touchZoom: 'center', scrollWheelZoom: 'center', doubleClickZoom: 'center',
        zoomSnap: 0.5, zoomDelta: 0.5,
        updateWhenIdle: false, updateWhenZooming: true,
        zoomAnimation: true, fadeAnimation: true,
        inertia: true, inertiaDeceleration: 3400, easeLinearity: 0.2
      });
      this.map.attributionControl.setPrefix('');
      this._poiRenderer = L.canvas({ padding: 0.5, tolerance: 5 });

      this.tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxZoom: 19, maxNativeZoom: 19, minZoom: 3,
        keepBuffer: 4, updateWhenIdle: false, updateWhenZooming: true,
        crossOrigin: true, attribution: '© OpenStreetMap'
      }).addTo(this.map);
      this.tl.bringToBack();

      this.light = false;
      document.body.classList.add('dark-map');

      this.uMk = null; this.uCr = null;
      this.rLine = null; this.rPts = []; this.rLast = null;
      this.arrowEl = null;
      this.fix = null; this.pos = null;
      this.hd = 0; this.hdT = 0; this.following = false; this.rotate = true;
      this.userZ = null; this.progZ = false; this.zooming = false; this.lastZ = 0;
      this._lastPanPos = null; this.onUserPan = null;
      this._lowPower = false; this.navActive = false; this.trailOn = false;
      this._trailBuf = [];
      this._navLine1 = null; this._navLine2 = null; this._navDestMarker = null;

      this.mapRot = $('map-rot');
      this.carEl = $('car');
      this._size = this.map.getSize();
      this._halfSize = this._size.divideBy(2);
      this._lastFrameT = 0;
      this._smoothHd = 0;

      this.map.on('zoomstart', () => { this.zooming = true; });
      this.map.on('zoomend', () => {
        if (!this.progZ && this.following) this.userZ = this.map.getZoom();
        this.progZ = false; this.zooming = false;
      });

      this.bindPan();

      this.lightsL = L.layerGroup().addTo(this.map);
      this.camsL   = L.layerGroup().addTo(this.map);
      this.workL   = L.layerGroup().addTo(this.map);
      this.navL    = L.layerGroup().addTo(this.map);
    } catch (e) {
      console.error('[RotaMap] Başlatma hatası:', e);
    }
  }

  invalidateSize() {
    try {
      if (this.map) {
        this.map.invalidateSize();
        this._size = this.map.getSize();
        this._halfSize = this._size.divideBy(2);
      }
    } catch (_) {}
  }

  setTheme(light) {
    if (this.light === light) return;
    this.light = light;
    document.body.classList.toggle('dark-map', !light);
  }

  bindPan() {
    const box = $('map-box');
    if (!box) return;
    const pts = new Map();
    box.addEventListener('pointerdown', e => { pts.set(e.pointerId, [e.clientX, e.clientY]); }, { passive: true });
    box.addEventListener('pointermove', e => {
      if (pts.size === 1 && pts.has(e.pointerId) && this.following) {
        const d = pts.get(e.pointerId);
        if (Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 14) {
          pts.clear();
          if (this.onUserPan) this.onUserPan();
        }
      }
    }, { passive: true });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
      box.addEventListener(t, e => pts.delete(e.pointerId), { passive: true }));
  }

  setMode(follow, rotate) {
    if (!this.map) return;
    const wasFollowing = this.following;
    this.following = !!follow;
    this.rotate = !!rotate;
    document.body.classList.toggle('follow', this.following);
    document.body.classList.remove('tilt');
    if (this.uCr && this.pos) this.updCircle();
    if (wasFollowing && !this.following && this.uMk && this.pos) {
      this.uMk.setLatLng(this.pos);
    }
    if (wasFollowing !== this.following && this.mapRot) {
      this.mapRot.classList.add('anim');
      clearTimeout(this._at);
      this._at = setTimeout(() => this.mapRot.classList.remove('anim'), 500);
    }
    if (this.following) {
      this.map.dragging.disable();
      this.lastZ = 0; this._lastPanPos = null;
    } else {
      this.map.dragging.enable();
    }
  }

  recenter() { this.userZ = null; this._lastPanPos = null; }

  wantZoom(kmh) {
    if (this.userZ != null) return this.userZ;
    const want = kmh < 25 ? 18.5 : kmh < 60 ? 18 : kmh < 95 ? 17 : kmh < 130 ? 16 : 15;
    const cur = this.map ? this.map.getZoom() : 18, now = Date.now();
    if (Math.abs(want - cur) > 0.4 && now - this.lastZ > 5000) { this.lastZ = now; return want; }
    return cur;
  }

  pushFix(la, ln, ac, hdg, kmh, snap) {
    if (!this.map) return;
    if (!this.uMk) {
      const html = '<svg class="nav-arrow" viewBox="0 0 24 24"><path d="M12 2L2 22l10-4 10 4L12 2z" fill="#4285F4" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      this.uMk = L.marker([la, ln], {
        icon: L.divIcon({ className: 'user-mk', html, iconSize: [32, 32], iconAnchor: [16, 16] }),
        interactive: false, keyboard: false
      }).addTo(this.map);

      this.uCr = L.circle([la, ln], {
        radius: 20, color: '#4285F4', fillColor: '#4285F4',
        fillOpacity: 0.08, weight: 1, interactive: false, renderer: this._poiRenderer
      });

      this.arrowEl = null;
      this.pos = [la, ln];
      this.hd = Number.isFinite(hdg) ? hdg : 0;
      this._smoothHd = this.hd;
      this.map.setView([la, ln], 18, { animate: false });
    }
    if (Number.isFinite(hdg)) this.hdT = hdg;
    this.fix = { la, ln, t: Date.now(), v: Math.max(0, kmh) / 3.6, snap: !!snap };
    this.acc = ac;
    this.updCircle();
  }

  updCircle() {
    if (!this.map || !this.uCr) return;
    const show = !this.following && this.acc >= 15;
    const has = this.map.hasLayer(this.uCr);
    if (show) {
      this.uCr.setRadius(clamp(this.acc, 8, 200));
      this.uCr.setLatLng(this.pos);
      if (!has) this.uCr.addTo(this.map);
    } else if (has) this.map.removeLayer(this.uCr);
  }

  frame(t) {
    const f = this.fix;
    if (!f || !this.uMk || !this.pos || !this.map) return;

    const baseMs = this._lowPower ? 50 : 16;
    const throttleMs = f.v * 3.6 > 5 ? baseMs : baseMs * 2;
    if (t - this._lastFrameT < throttleMs) return;

    const dt = this._lastFrameT ? Math.min(0.1, (t - this._lastFrameT) / 1000) : 0.033;
    this._lastFrameT = t;

    if (!this.arrowEl) {
      const el = this.uMk.getElement();
      if (el) this.arrowEl = el.querySelector('svg');
    }

    let la = f.la, ln = f.ln;
    const k = f.snap ? 1 - Math.exp(-dt * 18) : 1 - Math.exp(-dt * 8);
    this.pos[0] += (la - this.pos[0]) * k;
    this.pos[1] += (ln - this.pos[1]) * k;

    const dh = ((this.hdT - this.hd + 540) % 360) - 180;
    const hK = f.snap ? 1 - Math.exp(-dt * 14) : 1 - Math.exp(-dt * 5);
    const hMax = f.snap ? 360 * dt : 180 * dt;
    this.hd = (this.hd + clamp(dh * hK, -hMax, hMax) + 360) % 360;

    const renderDh = ((this.hd - this._smoothHd + 540) % 360) - 180;
    this._smoothHd = (this._smoothHd + renderDh * (1 - Math.exp(-dt * 10)) + 360) % 360;

    if (this.trailOn) this.addRoutePoint(this.pos[0], this.pos[1], !!f.snap);

    const rot = this.following && this.rotate;
    const hdR = Math.round(this._smoothHd * 10) / 10;

    if (this.mapRot) this.mapRot.style.transform = rot ? `rotate(${-hdR}deg)` : 'none';
    if (this.arrowEl) this.arrowEl.style.transform = `rotate(${Math.round(hdR)}deg)`;

    if (!this.following && t - (this._mt || 0) > 500) {
      this._mt = t;
      this.uMk.setLatLng(this.pos);
    }

    if (this.following && !this.zooming) {
      const z = this.wantZoom(f.v * 3.6);
      if (Math.abs(z - this.map.getZoom()) > 0.3) {
        this.progZ = true;
        this.map.setView(this.pos, z, { animate: true, duration: 0.6 });
        return;
      }
      const ctr = this.map.latLngToContainerPoint(this.pos);
      const dx = ctr.x - this._halfSize.x, dy = ctr.y - this._halfSize.y;
      if (Math.abs(dx) >= 16 || Math.abs(dy) >= 16) {
        this.map.setView(this.pos, this.map.getZoom(), { animate: false });
      }
    }
  }

  addRoutePoint(la, ln, snap = false) {
    if (!this.map) return;
    this._trailBuf.push([la, ln]);
    if (this._trailBuf.length > 3) this._trailBuf.shift();
    let sla = la, sln = ln;
    if (this._trailBuf.length === 3) {
      sla = (this._trailBuf[0][0] + this._trailBuf[1][0] * 2 + this._trailBuf[2][0] * 3) / 6;
      sln = (this._trailBuf[0][1] + this._trailBuf[1][1] * 2 + this._trailBuf[2][1] * 3) / 6;
    }
    this.rPts.push([sla, sln]);
    if (!this.rLine) {
      this.rLine = L.polyline([this.rPts[0]], {
        color: '#4285F4', weight: 4, opacity: 0.8,
        interactive: false, renderer: this._poiRenderer,
        lineCap: 'round', lineJoin: 'round'
      }).addTo(this.map);
    } else {
      this.rLine.addLatLng([sla, sln]);
    }
  }

  clearRoute() {
    this.rPts = [];
    this.rLast = null;
    this._trailBuf = [];
    if (this.rLine && this.map) { 
      try { this.map.removeLayer(this.rLine); } catch(_) {}
      this.rLine = null; 
    }
  }

  drawNav(pts, dest) {
    if (!this.map) return;
    if (pts && pts.length > 1) {
      this.navActive = true;
      if (!this._navLine1) {
        this._navLine1 = L.polyline(pts, { color: '#ffffff', weight: 9, opacity: 0.95, interactive: false, renderer: this._poiRenderer }).addTo(this.navL);
        this._navLine2 = L.polyline(pts, { color: '#4285F4', weight: 5, interactive: false, renderer: this._poiRenderer }).addTo(this.navL);
      } else {
        this._navLine1.setLatLngs(pts);
        this._navLine2.setLatLngs(pts);
      }
    } else {
      this.navActive = false;
      if (this._navLine1) {
        try { this.navL.removeLayer(this._navLine1); this.navL.removeLayer(this._navLine2); } catch(_) {}
        this._navLine1 = null; this._navLine2 = null;
      }
    }
    if (dest) {
      if (this._navDestMarker) {
        this._navDestMarker.setLatLng(dest);
      } else {
        this._navDestMarker = L.marker(dest, {
          interactive: false, keyboard: false,
          icon: L.divIcon({ className: '', html: '<div style="font-size:28px;line-height:1">📍</div>', iconSize: [28, 28], iconAnchor: [14, 26] })
        }).addTo(this.navL);
      }
    } else if (this._navDestMarker) {
      try { this.navL.removeLayer(this._navDestMarker); } catch(_) {}
      this._navDestMarker = null;
    }
  }

  setPOIs(list, cfg) {
    if (!this.map) return;
    try {
      this.lightsL.clearLayers();
      this.camsL.clearLayers();
      this.workL.clearLayers();
      for (const p of list) {
        let target = null;
        if (p.kind === 'light') { if (cfg.showLights) target = this.lightsL; }
        else if (p.kind === 'work' || p.kind === 'pothole' || p.kind === 'accident') { if (cfg.showWorks) target = this.workL; }
        else { if (cfg.showCams) target = this.camsL; }
        if (!target) continue;
        L.circleMarker([p.lat, p.lng], {
          renderer: this._poiRenderer, radius: 5,
          color: '#ffffff', weight: 1.5,
          fillColor: '#dc3545', fillOpacity: 0.9, interactive: false
        }).addTo(target);
      }
    } catch (_) {}
  }
}

/* ═══════ AppManager ═══════ */
class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.destSheet = new SheetManager('dest-bg', 'dest-sheet', 'dest-handle', 'btn-dest', 'dest-close');
    this.hazardSheet = new SheetManager('hazard-bg', 'hazard-sheet', 'hazard-handle', 'btn-hazard', 'hazard-cancel');
    this.map = new RotaMap();

    this.dom = {};
    const domIds = ['spd-val','spd-bar','speed-dash','limit-badge','limit-num',
      'ovr','ss-max','ss-avg','ss-trip','m-dur','m-alt','m-dir','m-acc','m-trf','m-fuel','m-fuel-lbl',
      'ft-bars','ft-clock','ft-dot','ft-gps','tip','tip-t','tip-icon','nav-banner','nb-arrow',
      'nb-dist','nb-txt','nb-eta','is-temp','is-wind','is-loc','hdr-road','splash','splash-status',
      'dest-clear','st-lim','st-wx','st-trf','st-geo','boot-msg','btn-theme','dest-q','dest-go',
      'dest-res','dest-pick','pick-bar','pick-ok','pick-no','nb-x','btn-hazard','btn-refresh-status',
      'btn-clear-hazards','btn-trail','car-beam','car-dot','car-pulse', 'btn-zoom-in', 'btn-zoom-out'];
    for (const id of domIds) this.dom[id] = $(id);
    this.dom.ftBars = this.dom['ft-bars'] ? Array.from(this.dom['ft-bars'].querySelectorAll('.ft-bar')) : [];

    this.state = {
      lat: null, lng: null, spd: 0, hdg: null, alt: null, acc: null,
      lim: null, limTs: 0, maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0,
      dist: 0, start: null, end: null, prev: null, prevT: null,
      tracking: false, gpsOn: false, smoothV: 0, poi: [], ahead: null,
      dataAge: null, lastTK: '', gpsErr: '', wasOver: false,
      roadCond: '--', roadCondCode: null,
      fuelTotal: 0, fuelCost: 0, fuelCO2: 0, avgFuel: 0,
      trailActive: false, startTime: null
    };

    this._speechQueue = [];
    this._isSpeaking = false;
    this._lastSpokenTime = 0;
    this._speakLast = '';

    this.timers = { lim: null, wx: null, geo: null, poi: null };
    this.busy   = { lim: false, wx: false, geo: false, poi: false };
    this.cache = {
      lim: { ts: 0, la: 0, ln: 0 },
      wx:  { ts: 0, code: null, la: null, ln: null },
      geo: { ts: 0, la: null, ln: null },
      poi: { ts: 0, la: 0, ln: 0 }
    };

    this.wakeLock = null;
    this.watchId = null;
    this.audio = null;
    this.lastB = 0;
    this.nav = null;
    this.alerted = new Map();

    this._tabActive = typeof document.hasFocus === 'function' ? document.hasFocus() : true;
    this._lastRenderSpd = null;
    this._lastRenderLim = null;
    this._rafId = 0;
    this._lastMapFrame = 0;
    this._dirty = true;

    this.syncFormFromConfig();
    this.bindUI();
    this.bindNav();
    this.startClock();
    this.startDurationTimer();
    this.applyTheme();
    this.syncMode();

    try {
      const savedHazards = JSON.parse(store.get('rp_hazards') || '[]');
      if (savedHazards.length) {
        this.state.poi = this.state.poi.concat(savedHazards);
        this.map.setPOIs(this.state.poi, this.cfg);
      }
    } catch (e) {}

    setTimeout(() => { try { this.map.invalidateSize(); } catch (e) {} }, 300);
    window.addEventListener('resize', () => { try { this.map.invalidateSize(); } catch (e) {} }, { passive: true });
    window.addEventListener('orientationchange', () => { setTimeout(() => { try { this.map.invalidateSize(); } catch (e) {} }, 200); }, { passive: true });
    window.addEventListener('pagehide', () => this._shutdown(), { passive: true });
    window.addEventListener('focus', () => { this._tabActive = true; this.reqWake(); }, { passive: true });
    window.addEventListener('blur',  () => { this._tabActive = false; }, { passive: true });
    document.addEventListener('visibilitychange', () => {
      this._tabActive = document.visibilityState === 'visible';
      if (this._tabActive) this.reqWake();
    }, { passive: true });

    this._doRender();
    this.initBatterySaver();
    this.startFrameLoop();
    this.startSplash();
    this.bindFirstGesture();

    setTimeout(() => {
      this.startGPS();
      if (this.cfg.soundOn) this.unlockAudio();
    }, 250);
  }

  _shutdown() {
    try {
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this.stopClock();
      this.relWake();
      if (this.watchId != null) { navigator.geolocation.clearWatch(this.watchId); this.watchId = null; }
      if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); }
    } catch (_) {}
  }

  syncFormFromConfig() {
    const setEl = (id, val) => { const el = $(id); if (el) el.value = val; };
    const setChk = (id, val) => { const el = $(id); if (el) el.checked = !!val; };

    setChk('cfg-as', this.cfg.autoStart);
    setChk('cfg-ac', this.cfg.autoCenter);
    setChk('cfg-rot', this.cfg.rotateMode);
    setChk('cfg-snd', this.cfg.soundOn);
    setChk('cfg-tts', this.cfg.ttsOn);
    setChk('cfg-wk', this.cfg.wakeOn);
    setChk('cfg-lt', this.cfg.lightTheme);
    setEl('cfg-thr', this.cfg.threshold);
    setChk('cfg-lights', this.cfg.showLights);
    setChk('cfg-cams', this.cfg.showCams);
    setChk('cfg-works', this.cfg.showWorks);
    setEl('cfg-vehicle', this.cfg.vehicle);
    setEl('cfg-fuel-price', this.cfg.fuelPrice);
    setChk('cfg-show-fuel', this.cfg.showFuel);
  }

  readFormToConfig() {
    const getChk = id => { const el = $(id); return el ? el.checked : false; };
    const getEl = id => { const el = $(id); return el ? el.value : ''; };

    this.cfg.save(getChk('cfg-ac'), getChk('cfg-rot'), getChk('cfg-snd'), getChk('cfg-tts'), getChk('cfg-wk'), getChk('cfg-lt'), getEl('cfg-thr'), {
      autoStart: getChk('cfg-as'),
      lights: getChk('cfg-lights'),
      cams: getChk('cfg-cams'),
      works: getChk('cfg-works'),
      vehicle: getEl('cfg-vehicle'),
      fuelPrice: getEl('cfg-fuel-price'),
      showFuel: getChk('cfg-show-fuel')
    });
  }

  bindUI() {
    const saveAndApply = () => {
      this.readFormToConfig();
      this.applyTheme();
      this.syncMode();
      this.map.setPOIs(this.state.poi, this.cfg);
      this.updateFuelDisplay();
    };

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr',
     'cfg-lights','cfg-cams','cfg-works','cfg-vehicle','cfg-fuel-price','cfg-show-fuel'].forEach(id => {
      const el = $(id);
      if (el) { el.addEventListener('change', saveAndApply); el.addEventListener('input', saveAndApply); }
    });

    const themeBtn = this.dom['btn-theme'];
    if (themeBtn) {
      themeBtn.addEventListener('click', () => {
        this.cfg.lightTheme = !this.cfg.lightTheme;
        this.cfg.save(this.cfg.autoCenter, this.cfg.rotateMode, this.cfg.soundOn, this.cfg.ttsOn, this.cfg.wakeOn, this.cfg.lightTheme, this.cfg.threshold);
        this.syncFormFromConfig();
        this.applyTheme();
      });
    }

    const locBtn = $('btn-loc');
    if (locBtn) {
      locBtn.addEventListener('click', () => {
        const next = !this.map.following;
        this.cfg.save(next, this.cfg.rotateMode, this.cfg.soundOn, this.cfg.ttsOn, this.cfg.wakeOn, this.cfg.lightTheme, this.cfg.threshold);
        this.syncMode();
        if (next) this.map.recenter();
      });
    }

    const trailBtn = this.dom['btn-trail'];
    if (trailBtn) {
      trailBtn.addEventListener('click', () => {
        this.state.trailActive = !this.state.trailActive;
        this.map.trailOn = this.state.trailActive;
        trailBtn.classList.toggle('active', this.state.trailActive);
        if (this.state.trailActive) {
          this.state.startTime = Date.now();
          this.beep('info');
          this.speak('Sürüş kaydı başladı', true);
        } else {
          this.map.clearRoute();
          this.speak('Sürüş kaydı durduruldu', true);
        }
      });
    }

    // Zoom In / Out Bağlantıları
    const zIn = this.dom['btn-zoom-in'];
    const zOut = this.dom['btn-zoom-out'];
    if (zIn && this.map.map) {
      zIn.addEventListener('click', () => { this.map.map.zoomIn(); this.beep('info'); });
    }
    if (zOut && this.map.map) {
      zOut.addEventListener('click', () => { this.map.map.zoomOut(); this.beep('info'); });
    }

    document.querySelectorAll('.hazard-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (this.state.lat == null || this.state.lng == null) {
          alert('GPS konumu bekleniyor.');
          this.hazardSheet.close();
          return;
        }
        const hazardType = btn.getAttribute('data-type');
        const kindMap = { cam: 'cam', pothole: 'pothole', work: 'work', accident: 'accident' };
        const newHazard = { lat: this.state.lat, lng: this.state.lng, kind: kindMap[hazardType] || 'work', timestamp: Date.now() };

        this.state.poi.push(newHazard);
        this.map.setPOIs(this.state.poi, this.cfg);

        try {
          const savedHazards = JSON.parse(store.get('rp_hazards') || '[]');
          savedHazards.push(newHazard);
          store.set('rp_hazards', JSON.stringify(savedHazards));
        } catch (e) {}

        this.hazardSheet.close();
        this.beep('info');
        const labels = { cam: 'Seyyar radar', pothole: 'Çukur uyarısı', work: 'Yol çalışması', accident: 'Kaza uyarısı' };
        this.speak((labels[hazardType] || 'Özel tehlike') + ' haritaya eklendi', true);
      });
    });

    const clearHazardsBtn = this.dom['btn-clear-hazards'];
    if (clearHazardsBtn) {
      clearHazardsBtn.addEventListener('click', () => {
        if (confirm('Eklenen tüm tehlike noktaları silinsin mi?')) {
          store.set('rp_hazards', '[]');
          this.state.poi = this.state.poi.filter(p => !p.timestamp);
          this.map.setPOIs(this.state.poi, this.cfg);
          alert('Tehlikeler temizlendi.');
        }
      });
    }

    const refreshStatusBtn = this.dom['btn-refresh-status'];
    if (refreshStatusBtn) {
      refreshStatusBtn.addEventListener('click', () => {
        if (this.state.lat == null || this.state.lng == null) { alert('GPS konumu alınamadı.'); return; }
        ['st-lim','st-wx','st-trf','st-geo'].forEach(id => { const el = $(id); if (el) { el.textContent = 'Kontrol ediliyor...'; el.className = 'm-status'; } });
        const now = Date.now();
        this.fetchSpeedLimit(this.state.lat, this.state.lng, now);
        this.fetchWeather(this.state.lat, this.state.lng, now);
        this.fetchRoadGeo(this.state.lat, this.state.lng, now);
        this.fetchPOIs(this.state.lat, this.state.lng, now);
        this.speak('Sistem durumları güncelleniyor', false);
      });
    }

    this.map.onUserPan = () => {
      if (this.cfg.autoCenter) {
        this.cfg.save(false, this.cfg.rotateMode, this.cfg.soundOn, this.cfg.ttsOn, this.cfg.wakeOn, this.cfg.lightTheme, this.cfg.threshold);
        this.syncMode();
      }
    };
  }

  applyTheme() {
    this.map.setTheme(this.cfg.lightTheme);
    document.body.classList.toggle('light-theme', this.cfg.lightTheme);
  }

  syncMode() {
    this.map.setMode(this.cfg.autoCenter, this.cfg.rotateMode);
    const lBtn = $('btn-loc'); if (lBtn) lBtn.classList.toggle('active', this.cfg.autoCenter);
    const rBtn = $('map-rot'); if (rBtn) rBtn.classList.toggle('active', this.cfg.rotateMode);
  }

  startClock() {
    if (this._clockTimer) clearInterval(this._clockTimer);
    const tick = () => {
      const d = new Date();
      const el = $('ft-clock');
      if (el) el.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
    };
    tick();
    this._clockTimer = setInterval(tick, 10000);
  }
  stopClock() { if (this._clockTimer) clearInterval(this._clockTimer); this._clockTimer = null; }

  startDurationTimer() {
    this._durationTimer = setInterval(() => {
      if (!this.state.startTime) return;
      const elapsed = Date.now() - this.state.startTime;
      const totalSec = Math.floor(elapsed / 1000);
      const hrs = Math.floor(totalSec / 3600);
      const mins = Math.floor((totalSec % 3600) / 60);
      const secs = totalSec % 60;
      const el = this.dom['m-dur'];
      if (el) {
        el.textContent = hrs > 0 ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }, 1000);
  }

  startSplash() {
    this._splashStart = Date.now();
    const st = $('splash-status');
    const barFill = document.querySelector('.sp-bar-fill');
    const pctEl = document.querySelector('.sp-pct');
    const ringFill = document.querySelector('.sp-ring-fill');
    
    const msgs = ['GPS modülü başlatılıyor...', 'Harita motorları yükleniyor...', 'Yol katmanları hazırlanıyor...', 'Konum servisleri aktifleştiriliyor...', 'Hava durumu alınıyor...', 'Navigasyon hazırlanıyor...', 'Sürüş asistanı hazır!'];
    let idx = 0;
    this._splashMsgTimer = setInterval(() => {
      idx = Math.min(idx + 1, msgs.length - 1);
      if (st) { st.textContent = msgs[idx]; if (idx === msgs.length - 1) st.classList.add('ok'); }
    }, 700);

    const splashDuration = 5000;
    const animateSplash = () => {
      const elapsed = Date.now() - this._splashStart;
      const rawP = clamp(elapsed / splashDuration, 0, 1);
      const p = 1 - Math.pow(1 - rawP, 2.5);
      if (barFill) barFill.style.transform = `scaleX(${p})`;
      if (pctEl) pctEl.textContent = Math.round(p * 100) + '%';
      if (ringFill) ringFill.style.strokeDashoffset = 402 - (402 * p);
      if (rawP < 1 && !this._splashTimer) this._splashRAF = requestAnimationFrame(animateSplash);
    };
    this._splashRAF = requestAnimationFrame(animateSplash);
    this._splashForceTimer = setTimeout(() => this.killSplash(), splashDuration + 800);
  }

  killSplash() {
    if (this._splashTimer) return;
    const elapsed = Date.now() - (this._splashStart || Date.now());
    if (elapsed < 5000) {
      if (!this._splashDeferred) this._splashDeferred = setTimeout(() => this.killSplash(), 5000 - elapsed);
      return;
    }
    this._splashTimer = true;
    if (this._splashMsgTimer) clearInterval(this._splashMsgTimer);
    clearTimeout(this._splashForceTimer);
    if (this._splashRAF) cancelAnimationFrame(this._splashRAF);
    setTimeout(_killSplashNow, 400);
  }

  bindFirstGesture() {
    const unlock = () => { this.unlockAudio(); this.reqWake(); };
    ['click', 'touchstart', 'pointerdown'].forEach(ev => document.addEventListener(ev, unlock, { once: true, passive: true }));
  }

  unlockAudio() {
    if (this.audio) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) { this.audio = new AC(); if (this.audio.state === 'suspended') this.audio.resume(); }
    } catch (e) {}
  }

  beep(type = 'warn') {
    if (!this.cfg.soundOn) return;
    const now = Date.now();
    if (now - this.lastB < 350) return;
    this.lastB = now;
    try {
      this.unlockAudio();
      if (!this.audio) return;
      const ctx = this.audio;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);

      if (type === 'warn') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(880, ctx.currentTime); osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.25, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
        osc.start(); osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'info') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(587.33, ctx.currentTime); osc.frequency.setValueAtTime(784, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.18, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
        osc.start(); osc.stop(ctx.currentTime + 0.16);
      } else if (type === 'success') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(523.25, ctx.currentTime); osc.frequency.setValueAtTime(659.25, ctx.currentTime + 0.08); osc.frequency.setValueAtTime(783.99, ctx.currentTime + 0.16);
        gain.gain.setValueAtTime(0.2, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.28);
        osc.start(); osc.stop(ctx.currentTime + 0.28);
      }
    } catch (e) {}
  }

  speak(txt, force = false) {
    if (!this.cfg.ttsOn || !('speechSynthesis' in window)) return;
    const now = Date.now();
    if (!force && this._speakLast === txt && now - this._lastSpokenTime < 10000) return;

    if (force) {
      this._speechQueue = [txt];
      try { window.speechSynthesis.cancel(); } catch(e) {}
      this._isSpeaking = false;
    } else {
      if (!this._speechQueue.includes(txt)) this._speechQueue.push(txt);
    }
    this._processSpeechQueue();
  }

  _processSpeechQueue() {
    if (this._isSpeaking || !this._speechQueue.length) return;
    if (!('speechSynthesis' in window)) return;
    const synth = window.speechSynthesis;
    const txt = this._speechQueue.shift();
    this._speakLast = txt;
    this._lastSpokenTime = Date.now();
    this._isSpeaking = true;

    try {
      if (synth.paused) synth.resume();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'tr-TR'; u.rate = 1.08; u.pitch = 1.0;
      if (_cachedVoices && _cachedVoices.length) {
        const tr = _cachedVoices.find(v => v.lang && v.lang.replace('_','-').toLowerCase().includes('tr'));
        if (tr) u.voice = tr;
      }
      u.onend = () => { this._isSpeaking = false; setTimeout(() => this._processSpeechQueue(), 150); };
      u.onerror = () => { this._isSpeaking = false; setTimeout(() => this._processSpeechQueue(), 150); };
      synth.speak(u);
    } catch (e) { this._isSpeaking = false; }
  }

  async reqWake() {
    if (!this.cfg.wakeOn || this.wakeLock) return;
    try {
      if ('wakeLock' in navigator) {
        this.wakeLock = await navigator.wakeLock.request('screen');
        this.wakeLock.addEventListener('release', () => { this.wakeLock = null; });
      }
    } catch (e) {}
  }

  relWake() {
    try { if (this.wakeLock) { this.wakeLock.release(); this.wakeLock = null; } } catch (e) {}
  }

  initBatterySaver() {
    if ('getBattery' in navigator) {
      navigator.getBattery().then(b => {
        const check = () => { this._lowPower = !b.charging && b.level < 0.2; if (this.map) this.map._lowPower = this._lowPower; };
        check(); b.addEventListener('levelchange', check); b.addEventListener('chargingchange', check);
      }).catch(() => {});
    }
  }

  startGPS() {
    if (!('geolocation' in navigator)) { this.setGPSErr('GPS desteklenmiyor'); return; }
    this.watchId = navigator.geolocation.watchPosition(pos => this.onGPS(pos), err => this.onGPSErr(err), { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  }

  onGPS(pos) {
    const { latitude: la, longitude: ln, speed, heading, altitude, accuracy } = pos.coords;
    const now = Date.now();
    this.killSplash();

    this.state.gpsOn = true; this.state.gpsErr = ''; this._weakSince = 0;
    this.setGPSStatus(true, accuracy);
    if (!this.state.startTime) this.state.startTime = now;

    const rawKmh = speed != null && speed >= 0 ? speed * 3.6 : 0;
    const kmh = rawKmh < 2 ? 0 : rawKmh;

    if (this.state.lat != null && this.state.lng != null) {
      const dM = hav(this.state.lat, this.state.lng, la, ln) * 1000;
      const dT = (now - (this.state.prevT || now)) / 1000;
      if (dM > 0.5 && dM < 200 && dT > 0.1) this.state.dist += dM / 1000;
    }

    const alpha = 0.35;
    this.state.smoothV = this.state.smoothV + alpha * (kmh - this.state.smoothV);
    const finalKmh = this.state.smoothV < 2 ? 0 : this.state.smoothV;

    this.state.lat = la; this.state.lng = ln; this.state.spd = finalKmh;
    this.state.alt = altitude; this.state.acc = accuracy;

    if (finalKmh > 3) {
      this.state.maxSpd = Math.max(this.state.maxSpd, finalKmh);
      this.state.sumSpd += finalKmh; this.state.spdN++;
      this.state.avgSpd = this.state.sumSpd / this.state.spdN;
    }

    let h = heading;
    if ((!Number.isFinite(h) || h == null) && this.state.prev && finalKmh > 4) {
      h = bearing(this.state.prev[0], this.state.prev[1], la, ln);
    }
    if (Number.isFinite(h)) {
      this.state.hdg = h;
      this._hdgStableHistory.push(h);
      if (this._hdgStableHistory.length > 8) this._hdgStableHistory.shift();
    }

    let snap = false;
    if (this.nav && this.nav.geom && distToPolyline(la, ln, this.nav.geom) < 15) snap = true;

    this.map.pushFix(la, ln, accuracy, this.state.hdg, finalKmh, snap);
    this.state.prev = [la, ln]; this.state.prevT = now; this._dirty = true;

    this.checkFetches(la, ln, now);
    this.checkNavigation(la, ln, finalKmh);
    this.checkPOIsAhead(la, ln, finalKmh);
    this.updateFuel(finalKmh, now);
  }

  onGPSErr(err) { this.setGPSStatus(false, 999); this.setGPSErr('GPS Hatası: ' + err.message); }

  setGPSStatus(on, acc) {
    const dot = this.dom['ft-dot']; const gpsLbl = this.dom['ft-gps'];
    if (dot) { dot.classList.toggle('on', on); dot.classList.toggle('weak', on && acc >= 20); }
    if (gpsLbl) {
      gpsLbl.textContent = on ? (acc < 10 ? 'GPS (Mükemmel)' : acc < 20 ? 'GPS (İyi)' : 'GPS (Zayıf)') : 'GPS Aranıyor';
    }
    const bars = this.dom.ftBars;
    if (bars && bars.length) {
      const strength = on ? (acc < 10 ? 4 : acc < 20 ? 3 : acc < 50 ? 2 : 1) : 0;
      bars.forEach((b, i) => b.classList.toggle('active', i < strength));
    }
  }

  setGPSErr(msg) { this.state.gpsErr = msg; const el = this.dom['is-loc']; if (el) el.textContent = msg; }

  checkFetches(la, ln, now) {
    if (now - (this._lastFetchCheck || 0) < 3000) return;
    this._lastFetchCheck = now;
    if (!this.busy.lim && (now - this.cache.lim.ts > 15000 || hav(this.cache.lim.la, this.cache.lim.ln, la, ln) > 0.08)) this.fetchSpeedLimit(la, ln, now);
    if (!this.busy.wx && (now - this.cache.wx.ts > 300000 || !this.cache.wx.la || hav(this.cache.wx.la, this.cache.wx.ln, la, ln) > 3.0)) this.fetchWeather(la, ln, now);
    if (!this.busy.geo && (now - this.cache.geo.ts > 20000 || !this.cache.geo.la || hav(this.cache.geo.la, this.cache.geo.ln, la, ln) > 0.5)) this.fetchRoadGeo(la, ln, now);
    if (!this.busy.poi && (now - this.cache.poi.ts > 30000 || hav(this.cache.poi.la, this.cache.poi.ln, la, ln) > 0.3)) this.fetchPOIs(la, ln, now);
  }

  async fetchSpeedLimit(la, ln, now) {
    this.busy.lim = true; this.cache.lim.ts = now; this.cache.lim.la = la; this.cache.lim.ln = ln;
    try {
      const q = `[out:json][timeout:5];way(around:35,${la},${ln})[maxspeed];out tags;`;
      const data = await fetchOverpass(q, 6000);
      const stEl = this.dom['st-lim']; if (stEl) { stEl.textContent = 'Aktif'; stEl.className = 'm-status ok'; }
      if (data && data.elements) {
        for (const el of data.elements) {
          if (el.tags && el.tags.maxspeed) {
            const lim = parseMaxspeed(el.tags.maxspeed, el.tags.highway);
            if (lim && lim > 0) { this.state.lim = lim; this.state.limTs = now; break; }
          }
        }
      }
    } catch (e) {
      const stEl = this.dom['st-lim']; if (stEl) { stEl.textContent = 'Hata'; stEl.className = 'm-status err'; }
    }
    this.busy.lim = false;
  }

  async fetchWeather(la, ln, now) {
    this.busy.wx = true; this.cache.wx.ts = now; this.cache.wx.la = la; this.cache.wx.ln = ln;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,weather_code,wind_speed_10m`;
      const data = await fetchJSON(url, 7000);
      const stEl = this.dom['st-wx']; if (stEl) { stEl.textContent = 'Aktif'; stEl.className = 'm-status ok'; }
      if (data && data.current) {
        const t = Math.round(data.current.temperature_2m);
        const w = Math.round(data.current.wind_speed_10m);
        const code = data.current.weather_code;
        const cond = code >= 51 ? 'Yağışlı / Kaygan' : code >= 1 ? 'Bulutlu' : 'Açık / Kuru';
        this.state.roadCond = cond; this.state.roadCondCode = code;
        if (this.dom['is-temp']) this.dom['is-temp'].textContent = t + '°C';
        if (this.dom['is-wind']) this.dom['is-wind'].textContent = w + ' km/s';
        if (this.dom['hdr-road']) this.dom['hdr-road'].textContent = cond;
      }
    } catch (e) {
      const stEl = this.dom['st-wx']; if (stEl) { stEl.textContent = 'Hata'; stEl.className = 'm-status err'; }
    }
    this.busy.wx = false;
  }

  async fetchRoadGeo(la, ln, now) {
    this.busy.geo = true; this.cache.geo.ts = now; this.cache.geo.la = la; this.cache.geo.ln = ln;
    try {
      const q = `[out:json][timeout:5];way(around:40,${la},${ln})[highway];out tags geom;`;
      const data = await fetchOverpass(q, 6000);
      if (this.dom['st-geo']) { this.dom['st-geo'].textContent = 'Aktif'; this.dom['st-geo'].className = 'm-status ok'; }
      if (data && data.elements) {
        for (const el of data.elements) {
          if (el.tags && el.tags.name) { if (this.dom['is-loc']) this.dom['is-loc'].textContent = el.tags.name; break; }
        }
      }
    } catch (e) {
      if (this.dom['st-geo']) { this.dom['st-geo'].textContent = 'Hata'; this.dom['st-geo'].className = 'm-status err'; }
    }
    this.busy.geo = false;
  }

  async fetchPOIs(la, ln, now) {
    this.busy.poi = true; this.cache.poi.ts = now; this.cache.poi.la = la; this.cache.poi.ln = ln;
    try {
      const q = `[out:json][timeout:6];(node(around:2500,${la},${ln})[highway=speed_camera];node(around:2500,${la},${ln})[highway=traffic_signals];node(around:2500,${la},${ln})[highway=construction];);out body;`;
      const data = await fetchOverpass(q, 7000);
      if (this.dom['st-trf']) { this.dom['st-trf'].textContent = 'Aktif'; this.dom['st-trf'].className = 'm-status ok'; }
      if (data && data.elements) {
        const list = [];
        for (const el of data.elements) {
          if (!el.lat || !el.lon) continue;
          let kind = 'cam';
          if (el.tags) {
            if (el.tags.highway === 'traffic_signals') kind = 'light';
            else if (el.tags.highway === 'construction') kind = 'work';
          }
          list.push({ lat: el.lat, lng: el.lon, kind });
        }
        const savedHazards = JSON.parse(store.get('rp_hazards') || '[]');
        this.state.poi = list.concat(savedHazards);
        this.map.setPOIs(this.state.poi, this.cfg);
      }
    } catch (e) {
      if (this.dom['st-trf']) { this.dom['st-trf'].textContent = 'Hata'; this.dom['st-trf'].className = 'm-status err'; }
    }
    this.busy.poi = false;
  }

  checkNavigation(la, ln, kmh) {
    if (!this.nav || !this.nav.dest) return;
    const dRem = hav(la, ln, this.nav.dest[0], this.nav.dest[1]) * 1000;
    if (this.dom['nav-banner']) this.dom['nav-banner'].style.display = 'flex';
    if (this.dom['nb-dist']) this.dom['nb-dist'].textContent = dRem > 1000 ? (dRem / 1000).toFixed(1) + ' km' : Math.round(dRem) + ' m';
    if (this.dom['nb-txt']) this.dom['nb-txt'].textContent = this.nav.name || 'Hedefe ilerleniyor';
    if (this.dom['nb-eta']) {
      const minRem = Math.round((dRem / 1000 / Math.max(kmh, 30)) * 60);
      this.dom['nb-eta'].textContent = minRem > 0 ? minRem + ' dk' : 'Varıldı';
    }
    if (dRem < 30) {
      this.beep('success'); this.speak('Hedefe ulaştınız', true); this.clearNavigation();
    }
  }

  clearNavigation() {
    this.nav = null; this.map.drawNav(null, null);
    if (this.dom['nav-banner']) this.dom['nav-banner'].style.display = 'none';
    if (this.dom['dest-clear']) this.dom['dest-clear'].style.display = 'none';
  }

  async buildRouteTo(destLat, destLng, destName = '') {
    if (this.state.lat == null || this.state.lng == null) { alert('GPS konumu bekleniyor.'); return; }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${this.state.lng},${this.state.lat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const data = await fetchJSON(url, 10000);
      if (data && data.routes && data.routes.length) {
        const route = data.routes[0];
        const pts = route.geometry.coordinates.map(c => [c[1], c[0]]);
        this.nav = { dest: [destLat, destLng], name: destName, geom: pts.map(p => ({ lat: p[0], lon: p[1] })) };
        this.map.drawNav(pts, [destLat, destLng]);
        if (this.dom['nav-banner']) this.dom['nav-banner'].style.display = 'flex';
        if (this.dom['dest-clear']) this.dom['dest-clear'].style.display = 'block';
        this.beep('success'); this.speak('Rota oluşturuldu, yönlendiriliyorsunuz', true);
      }
    } catch (e) { alert('Rota hesaplanamadı.'); }
  }

  checkPOIsAhead(la, ln, kmh) {
    if (!this.state.poi || !this.state.poi.length) return;
    const hdg = this.state.hdg; if (hdg == null) return;
    for (const p of this.state.poi) {
      const d = hav(la, ln, p.lat, p.lng) * 1000;
      const rng = POI_RANGE[p.kind] || 300;
      if (d <= rng) {
        let diff = Math.abs(bearing(la, ln, p.lat, p.lng) - hdg);
        if (diff > 180) diff = 360 - diff;
        if (diff < 45) {
          const key = p.kind + '_' + Math.round(p.lat*1000) + '_' + Math.round(p.lng*1000);
          if (!this.alerted.has(key) || Date.now() - this.alerted.get(key) > 60000) {
            this.alerted.set(key, Date.now());
            this.beep('warn');
            this.speak(Math.round(d) + ' metre sonra ' + (POI_LABEL[p.kind] || 'uyarı'), true);
          }
        }
      }
    }
  }

  updateFuel(kmh, now) {
    if (now - (this._lastFuelT || 0) < 1000) return;
    const dtSec = (now - (this._lastFuelT || now)) / 1000;
    this._lastFuelT = now;
    if (dtSec <= 0 || dtSec > 5) return;
    const consumed = (fuelRateAt(this.cfg.vehicle, kmh) / 3600) * dtSec;
    this.state.fuelTotal += consumed;
    this.state.fuelCost = this.state.fuelTotal * this.cfg.fuelPrice;
    this.state.fuelCO2 = this.cfg.vehicle === 'elektrik' ? 0 : this.state.fuelTotal * (CO2_PER_UNIT[this.cfg.vehicle] || 2.31);
    if (this.state.dist > 0) this.state.avgFuel = (this.state.fuelTotal / this.state.dist) * 100;
  }

  updateFuelDisplay() {
    const elFuel = this.dom['m-fuel']; const elFuelLbl = this.dom['m-fuel-lbl'];
    const unit = FUEL_UNIT[this.cfg.vehicle] || 'L';
    if (elFuelLbl) elFuelLbl.textContent = 'Yakıt (' + unit + ')';
    if (elFuel && this.cfg.showFuel) elFuel.textContent = this.state.fuelTotal.toFixed(2) + ' ' + unit;
  }

  startFrameLoop() {
    const loop = t => {
      this._rafId = requestAnimationFrame(loop);
      if (this._tabActive) {
        this.map.frame(t);
        if (t - this._lastMapFrame > 80) {
          this._lastMapFrame = t;
          if (this._dirty) { this._doRender(); this._dirty = false; }
        }
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _doRender() {
    const s = this.state;
    const roundedSpd = Math.round(s.spd);
    if (this._lastRenderSpd !== roundedSpd) {
      this._lastRenderSpd = roundedSpd;
      if (this.dom['spd-val']) this.dom['spd-val'].textContent = roundedSpd;
    }

    const barEl = this.dom['spd-bar'];
    if (barEl) {
      const ratio = clamp(s.spd / (s.lim || 120), 0, 1.3);
      barEl.style.transform = `scaleX(${Math.min(ratio, 1)})`;
    }

    const dashEl = this.dom['speed-dash'];
    if (dashEl && s.lim) {
      const warnThresh = s.lim * (1 + (this.cfg.threshold || 10) / 200);
      const overThresh = s.lim * (1 + (this.cfg.threshold || 10) / 100);
      dashEl.classList.toggle('warn', s.spd > warnThresh && s.spd <= overThresh);
      dashEl.classList.toggle('over', s.spd > overThresh);
    }

    const limEl = this.dom['limit-num']; const badgeEl = this.dom['limit-badge'];
    if (limEl && badgeEl) {
      if (s.lim) {
        if (this._lastRenderLim !== s.lim) { this._lastRenderLim = s.lim; limEl.textContent = s.lim; }
        badgeEl.classList.remove('off');
        const over = s.spd > (s.lim + (this.cfg.threshold || 10));
        if (over && !s.wasOver) {
          this.beep('warn'); this.speak('Hız sınırını aştınız', false); s.wasOver = true;
        } else if (!over) { s.wasOver = false; }
      } else { badgeEl.classList.add('off'); }
    }

    if (this.dom['ovr']) this.dom['ovr'].classList.toggle('on', !!(s.lim && s.spd > (s.lim + (this.cfg.threshold || 10))));
    if (this.dom['ss-max']) this.dom['ss-max'].textContent = Math.round(s.maxSpd);
    if (this.dom['ss-avg']) this.dom['ss-avg'].textContent = Math.round(s.avgSpd);
    if (this.dom['ss-trip']) this.dom['ss-trip'].textContent = s.dist.toFixed(1);
    if (this.dom['m-alt']) this.dom['m-alt'].textContent = s.alt != null ? Math.round(s.alt) : '--';
    if (this.dom['m-dir'] && s.hdg != null) {
      const dirs = ['K','KD','D','GD','G','GB','B','KB','K'];
      this.dom['m-dir'].textContent = dirs[Math.round((s.hdg % 360) / 45)];
    }
    if (this.dom['m-acc']) this.dom['m-acc'].textContent = s.acc != null ? '±' + Math.round(s.acc) : '--';
    if (this.dom['m-trf']) {
      this.dom['m-trf'].textContent = s.roadCond || '--';
      this.dom['m-trf'].className = 'm-val';
      if (s.roadCondCode != null) {
        if (s.roadCondCode >= 51) this.dom['m-trf'].classList.add('wet');
        else if (s.roadCondCode === 0) this.dom['m-trf'].classList.add('dry');
      }
    }
    this.updateFuelDisplay();
  }

  bindNav() {
    const clearDest = this.dom['dest-clear'];
    if (clearDest) clearDest.addEventListener('click', () => { this.clearNavigation(); this.destSheet.close(); });
    const cancelNav = this.dom['nb-x'];
    if (cancelNav) cancelNav.addEventListener('click', () => this.clearNavigation());

    const goBtn = this.dom['dest-go']; const qInput = this.dom['dest-q']; const resDiv = this.dom['dest-res'];
    const searchAddr = async () => {
      const q = qInput ? qInput.value.trim() : ''; if (!q) return;
      if (resDiv) resDiv.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary)">🔍 Aranıyor...</div>';
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`;
        const data = await fetchJSON(url, 7000);
        if (resDiv) {
          resDiv.innerHTML = '';
          if (!data || !data.length) { resDiv.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-secondary)">Sonuç bulunamadı.</div>'; return; }
          data.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'dest-row'; btn.textContent = item.display_name;
            btn.addEventListener('click', () => { this.destSheet.close(); this.buildRouteTo(parseFloat(item.lat), parseFloat(item.lon), item.display_name.split(',')[0]); });
            resDiv.appendChild(btn);
          });
        }
      } catch (e) { if (resDiv) resDiv.innerHTML = '<div style="text-align:center;padding:16px;color:var(--red)">Hata oluştu.</div>'; }
    };

    if (goBtn) goBtn.addEventListener('click', searchAddr);
    if (qInput) qInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });

    const pickBtn = this.dom['dest-pick'], pickOk = this.dom['pick-ok'], pickNo = this.dom['pick-no'];
    if (pickBtn) pickBtn.addEventListener('click', () => { this.destSheet.close(); document.body.classList.add('picking'); this.map.setMode(false, false); });
    if (pickNo) pickNo.addEventListener('click', () => { document.body.classList.remove('picking'); this.syncMode(); });
    if (pickOk) pickOk.addEventListener('click', () => {
      const ctr = this.map.map.getCenter();
      document.body.classList.remove('picking'); this.syncMode();
      this.buildRouteTo(ctr.lat, ctr.lng, 'Seçilen Nokta');
    });
  }
}

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}