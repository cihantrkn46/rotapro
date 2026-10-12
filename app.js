/**
 * RotaPro v10.6 — Stabilizasyon + Beyaz Ekran Onarımı
 * · Tüm özellikler (ses, harita, trail, kamera, navigasyon) korundu
 * · ONARIM: _startApp başarısız olursa splash kapatılır + fallback gösterilir
 * · ONARIM: window.__APP_READY__ flag (erken kurtarma script'i bunu bekler)
 * · ONARIM: constructor içindeki her adım ayrı try/catch (beyaz ekran önlenir)
 */
'use strict';

/* ─── HATA GÜNLÜĞÜ ─── */
const ErrorLog = {
  KEY: 'rpErrLog',
  MAX: 50,
  add(msg, src, line) {
    try {
      const log = this.all();
      log.push({
        ts: Date.now(),
        msg: String(msg == null ? 'bilinmeyen' : msg).slice(0, 300),
        src: src ? String(src).slice(-80) : '',
        line: parseInt(line, 10) || 0
      });
      localStorage.setItem(this.KEY, JSON.stringify(log.slice(-this.MAX)));
    } catch (_) {}
  },
  all() {
    try {
      const l = JSON.parse(localStorage.getItem(this.KEY) || '[]');
      return Array.isArray(l) ? l : [];
    } catch (_) { return []; }
  },
  clear() { try { localStorage.removeItem(this.KEY); } catch (_) {} },
  count() { return this.all().length; }
};

/* ─── SPLASH KAPATMA ─── */
const _killSplashNow = () => {
  try {
    const s = document.getElementById('splash');
    if (s && s.parentNode && !s.classList.contains('hide')) {
      s.classList.add('hide');
      setTimeout(() => { try { s.remove(); } catch (_) {} }, 600);
    }
  } catch (_) {}
};

/* ─── GLOBAL HATA YAKALAYICI ─── */
window.addEventListener('error', (e) => {
  ErrorLog.add(e.message, e.filename, e.lineno);
  console.error('[RotaPro] Hata:', e.message, '@', e.filename, ':', e.lineno);
  setTimeout(_killSplashNow, 60);
});
window.addEventListener('unhandledrejection', (e) => {
  const msg = e.reason && e.reason.message ? e.reason.message : String(e.reason || 'bilinmeyen');
  ErrorLog.add('Promise: ' + msg, '', 0);
  console.error('[RotaPro] Promise hatası:', e.reason);
  setTimeout(_killSplashNow, 60);
});

/* ─── TTS VOICE CACHE ─── */
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
  const _voiceKick = () => { _voiceLoadRetries = 0; _loadVoices(true); };
  document.addEventListener('touchend', _voiceKick, { once: true, passive: true });
  document.addEventListener('click',    _voiceKick, { once: true, passive: true });
}

/* ─── UTILITIES ─── */
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

const DEVICE = (() => {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  const dpr = window.devicePixelRatio || 1;
  const lowEnd = mem < 3 || cores < 4 || dpr > 3;
  return { mem, cores, dpr, lowEnd };
})();

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
  unclassified: 60, service: 30, track: 30, road: 50,
  walk: 20, pedestrian: 20
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

const esc = s => String(s == null ? '' : s)
  .replace(/[\x00-\x1F\x7F]/g, ' ')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bearing = (a1, b1, a2, b2) => {
  const R = Math.PI / 180, y = Math.sin((b2 - b1) * R) * Math.cos(a2 * R);
  const x = Math.cos(a1 * R) * Math.sin(a2 * R) -
            Math.sin(a1 * R) * Math.cos(a2 * R) * Math.cos((b2 - b1) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
};

const angDiff = (a, b) => { let d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };

const WARN_SVG = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const INFO_SVG = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
const CHECK_SVG = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
const CAM_SVG  = '<path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/>';

/* ─── KULLANICI KAMERA DEPOSU ─── */
const CamStore = {
  KEY: 'rp9cams',
  all() {
    try { const l = JSON.parse(store.get(this.KEY) || '[]'); return Array.isArray(l) ? l : []; }
    catch (e) { return []; }
  },
  add(la, ln) {
    const l = this.all();
    l.push({ id: Date.now(), lat: +la.toFixed(6), lng: +ln.toFixed(6), ts: Date.now() });
    store.set(this.KEY, JSON.stringify(l.slice(-300)));
  },
  clear() { store.set(this.KEY, '[]'); },
  count() { return this.all().length; }
};

/* ─── YAKIT MODELİ ─── */
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

/* ─── CONFIG ─── */
class Config {
  constructor() {
    this.autoStart = true; this.autoCenter = true; this.rotateMode = true;
    this.soundOn = true; this.ttsOn = true; this.wakeOn = true;
    this.lightTheme = false; this.threshold = 10;
    this.showLights = true; this.showCams = true; this.showWorks = false;
    this.vehicle = 'benzin'; this.fuelPrice = 45; this.showFuel = true;
    this.showLanes = true;
    this.autoTheme = true;
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
      this.showLights  = o.sl !== false;
      this.showCams    = o.sc !== false;
      this.showWorks   = o.sw === true;
      this.showLanes   = o.ln !== false;
      this.autoTheme   = o.at !== false;
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
      this.showCams   = !!x.cams;
      this.showWorks  = !!x.works;
      this.showLanes  = !!x.lanes;
      if (x.autoStart !== undefined) this.autoStart = !!x.autoStart;
      if (x.vehicle !== undefined && ['benzin','dizel','lpg','elektrik'].includes(x.vehicle)) this.vehicle = x.vehicle;
      if (x.fuelPrice !== undefined) {
        const fp = parseFloat(x.fuelPrice);
        this.fuelPrice = Number.isFinite(fp) ? Math.max(0, fp) : 0;
      }
      if (x.showFuel !== undefined) this.showFuel = !!x.showFuel;
      if (x.autoTheme !== undefined) this.autoTheme = !!x.autoTheme;
    }
    store.set('rp8', JSON.stringify({
      as: this.autoStart, ac: this.autoCenter, rot: this.rotateMode,
      snd: this.soundOn, tts: this.ttsOn, wk: this.wakeOn,
      lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      ln: this.showLanes, vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel,
      at: this.autoTheme
    }));
  }
}

/* ─── BOTTOM SHEET ─── */
class SheetManager {
  constructor(bg = 'sheet-bg', sh = 'sheet', hd = 'sheet-handle', op = 'btn-cfg', cl = 'btn-save') {
    this.ids = { op, cl };
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
    this._onEsc = e => { if (e.key === 'Escape' && this.isOpen) this.close(); };
    document.addEventListener('keydown', this._onEsc);
  }
  destroy() { if (this._onEsc) document.removeEventListener('keydown', this._onEsc); }
  attachDrag() {
    document.addEventListener('touchmove', this._onMove, { passive: false });
    document.addEventListener('touchend', this._onEnd);
    document.addEventListener('touchcancel', this._onCancel);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onEnd);
  }
  detachDrag() {
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
    document.removeEventListener('touchcancel', this._onCancel);
    document.removeEventListener('mousemove', this._onMove);
    document.removeEventListener('mouseup', this._onEnd);
  }
  open() {
    this.bg.style.display = 'flex';
    void this.bg.offsetWidth;
    this.bg.classList.add('open');
    this.sheet.classList.add('open');
    this.isOpen = true;
    this.attachDrag();
  }
  close() {
    this.detachDrag();
    this.sheet.classList.remove('open');
    this.sheet.classList.remove('dragging');
    this.bg.classList.remove('open');
    this.isOpen = false;
    this.dragging = false;
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    setTimeout(() => { if (!this.isOpen) this.bg.style.display = 'none'; }, 520);
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
    this.sheet.style.transform = `translateY(${this.currentY}px)`;
    const opacity = 1 - (this.currentY / window.innerHeight);
    this.bg.style.backgroundColor = `rgba(0,0,0,${Math.max(0, opacity * 0.6)})`;
    if (this.currentY > 0 && e.cancelable) e.preventDefault();
  }
  onDragEnd() {
    if (!this.dragging) return;
    this.dragging = false;
    this.sheet.classList.remove('dragging');
    const cancelled = this.currentY > 120;
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

/* ─── HARİTA ─── */
const TILE_URL = 'https://{s}.tile.openstreetmap.de/{z}/{x}/{y}.png';
const TILT = 48;
const MAX_TRAIL_SEGMENTS = 200;

const POI_COLORS = { light: '#30d158', cam: '#ff453a', work: '#ff9f0a', mycam: '#bf5af2' };
const POI_RADIUS = { light: 4, cam: 6, work: 6, mycam: 6 };

class RotaMap {
  constructor() {
    if (typeof L === 'undefined') throw new Error('Leaflet yüklenemedi');

    this.map = L.map('map', {
      center: [39.92, 32.85], zoom: 18, zoomControl: false,
      attributionControl: true, preferCanvas: true,
      touchZoom: 'center', scrollWheelZoom: 'center', doubleClickZoom: 'center',
      zoomSnap: 1, updateWhenIdle: false, updateWhenZooming: false,
      zoomAnimationThreshold: 6, fadeAnimation: !DEVICE.lowEnd, markerZoomAnimation: false,
      wheelPxPerZoomLevel: 120, wheelDebounceTime: 60,
      inertia: !DEVICE.lowEnd, inertiaDeceleration: 3000, easeLinearity: 0.25
    });
    this.map.attributionControl.setPrefix('© OSM');

    this._poiRenderer = L.canvas({ padding: 0.5 });

    this.tl = null; this.light = null;
    this.setTheme(false);

    this.uMk = null; this.uCr = null;

    this.rSegs = [];
    this.rActiveSeg = null;
    this.rLast = null;
    this.rPrev = null;
    this._trailBuf = [];

    this.arrowEl = null;
    this.fix = null; this.pos = null;
    this.hd = 0; this.hdT = 0; this.hdgStable = false;
    this.following = false; this.rotate = true;
    this.userZ = null; this.progZ = false; this.zooming = false; this.lastZ = 0;
    this._lastPanPos = null;
    this.onUserPan = null;
    this._lowPower = false;

    this.navActive = false;
    this._snapMode = false;

    this._navLine1 = null; this._navLine2 = null; this._navDestMarker = null;

   