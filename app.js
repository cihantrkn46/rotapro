/**
 * RotaPro v8.7.1 — Keyless · Hardened · Smooth · Yakıt · MCT YAZILIM
 * Splash fix · tek rAF · DOM cache · adaptif tick · OSRM fallback · ters yön · dedup · Akıcı TTS.
 */
'use strict';

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

async function fetchJSON(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Overpass — exponential backoff + 3 endpoint */
const OVERPASS_EPS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const _ovpPenalty = [0, 0, 0];
const _ovpNextOk  = [0, 0, 0];

async function fetchOverpass(q, ms) {
  const now = Date.now();
  let lastErr;
  const order = [0, 1, 2].sort((a, b) => _ovpNextOk[a] - _ovpNextOk[b]);
  for (const i of order) {
    if (_ovpNextOk[i] > now) { lastErr = lastErr || new Error('throttled'); continue; }
    try {
      const res = await fetchJSON(OVERPASS_EPS[i] + '?data=' + encodeURIComponent(q), ms);
      _ovpPenalty[i] = 0;
      _ovpNextOk[i]  = 0;
      return res;
    } catch (e) {
      lastErr = e;
      _ovpPenalty[i] = Math.min(40000, _ovpPenalty[i] ? _ovpPenalty[i] * 2 : 5000);
      _ovpNextOk[i]  = Date.now() + _ovpPenalty[i];
    }
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
  motorway: 120, motorway_link: 90,
  trunk: 110, trunk_link: 90,
  primary: 90, primary_link: 70,
  secondary: 80, secondary_link: 60,
  tertiary: 70, tertiary_link: 60,
  residential: 50, living_street: 30, unclassified: 60,
  service: 30, track: 30, road: 50,
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
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const bearing = (a1, b1, a2, b2) => {
  const R = Math.PI / 180, y = Math.sin((b2 - b1) * R) * Math.cos(a2 * R);
  const x = Math.cos(a1 * R) * Math.sin(a2 * R) -
            Math.sin(a1 * R) * Math.cos(a2 * R) * Math.cos((b2 - b1) * R);
  return (Math.atan2(y, x) / R + 360) % 360;
};

const POI_LABEL = {
  cam: 'radar veya hız kamerası',
  light: 'trafik ışığı',
  rail: 'hemzemin geçit',
  bump: 'kasis',
  stop: 'dur levhası',
  work: 'yol çalışması'
};
const POI_RANGE = { cam: 500, rail: 400, hz: 600, bump: 200, light: 200, stop: 120, work: 400 };

const WARN_SVG = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const INFO_SVG = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
const CHECK_SVG = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';

/* ─── YAKIT / ENERJİ MODELİ ─── */
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
    this.autoStart = true;
    this.autoCenter = true;
    this.rotateMode = true;
    this.soundOn = true;
    this.ttsOn = true;
    this.wakeOn = true;
    this.lightTheme = false;
    this.threshold = 10;
    this.showLights = true;
    this.showCams = true;
    this.showWorks = true;
    this.vehicle = 'benzin';
    this.fuelPrice = 45;
    this.showFuel = true;
    this.load();
  }
  load() {
    const s = store.get('rp8');
    if (!s) return;
    try {
      const o = JSON.parse(s);
      this.autoStart = o.as !== false;
      this.autoCenter = o.ac !== false;
      this.rotateMode = o.rot !== false;
      this.soundOn   = o.snd !== false;
      this.ttsOn     = o.tts !== false;
      this.wakeOn    = o.wk  !== false;
      this.lightTheme = o.lt === true;
      this.threshold = clamp(parseInt(o.thr, 10) || 10, 1, 50);
      this.showLights = o.sl !== false;
      this.showCams   = o.sc !== false;
      this.showWorks  = o.sw !== false;
      this.vehicle   = ['benzin','dizel','lpg','elektrik'].includes(o.vh) ? o.vh : 'benzin';
      this.fuelPrice = Math.max(0, parseFloat(o.fp) || 45);
      this.showFuel  = o.sf !== false;
    } catch (e) {}
  }
  save(ac, rot, snd, tts, wk, lt, thr, x) {
    this.autoCenter = ac;
    this.rotateMode = rot;
    this.soundOn = snd;
    this.ttsOn = tts;
    this.wakeOn = wk;
    this.lightTheme = lt;
    this.threshold = clamp(parseInt(thr, 10) || 10, 1, 50);
    if (x) {
      this.showLights = !!x.lights;
      this.showCams   = !!x.cams;
      this.showWorks  = !!x.works;
      if (x.autoStart !== undefined) this.autoStart = !!x.autoStart;
      if (x.vehicle !== undefined && ['benzin','dizel','lpg','elektrik'].includes(x.vehicle)) {
        this.vehicle = x.vehicle;
      }
      if (x.fuelPrice !== undefined) this.fuelPrice = Math.max(0, parseFloat(x.fuelPrice) || 0);
      if (x.showFuel  !== undefined) this.showFuel  = !!x.showFuel;
    }
    store.set('rp8', JSON.stringify({
      as: this.autoStart,
      ac: this.autoCenter, rot: this.rotateMode, snd: this.soundOn, tts: this.ttsOn,
      wk: this.wakeOn, lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel
    }));
  }
}

/* ─── BOTTOM SHEET ─── */
class SheetManager {
  constructor(bg = 'sheet-bg', sh = 'sheet', hd = 'sheet-handle', op = 'btn-cfg', cl = 'btn-save') {
    this.ids = { op, cl };
    this.bg = $(bg);
    this.sheet = $(sh);
    this.handle = $(hd);
    this.isOpen = false;
    this.startY = 0;
    this.currentY = 0;
    this.dragging = false;
    this._onMove = e => this.onDragMove(e);
    this._onEnd = () => this.onDragEnd();
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
    if (this.bg) {
      this.bg.addEventListener('click', e => { if (e.target === this.bg) this.close(); });
    }
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }
  attachDrag() {
    document.addEventListener('touchmove', this._onMove, { passive: false });
    document.addEventListener('touchend', this._onEnd);
    document.addEventListener('touchcancel', this._onEnd);
    document.addEventListener('mousemove', this._onMove);
    document.addEventListener('mouseup', this._onEnd);
  }
  detachDrag() {
    document.removeEventListener('touchmove', this._onMove);
    document.removeEventListener('touchend', this._onEnd);
    document.removeEventListener('touchcancel', this._onEnd);
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
    this.bg.classList.remove('open');
    this.isOpen = false;
    setTimeout(() => { if (!this.isOpen) this.bg.style.display = 'none'; }, 520);
  }
  pointY(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return e.clientY;
  }
  onDragStart(e) {
    if (!this.isOpen) return;
    this.dragging = true;
    this.currentY = 0;
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
    this.sheet.style.transform = '';
    this.bg.style.backgroundColor = '';
    if (this.currentY > 120) this.close();
    this.currentY = 0;
  }
}

/* ─── HARİTA ─── */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILT = 48;
const ROUTE_MAX_PTS = 2000;

class RotaMap {
  constructor() {
    this.map = L.map('map', {
      center: [39.92, 32.85],
      zoom: 18,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      touchZoom: 'center',
      scrollWheelZoom: 'center',
      doubleClickZoom: 'center',
      zoomSnap: 1,
      updateWhenIdle: false,
      updateWhenZooming: true,
      zoomAnimationThreshold: 4,
      fadeAnimation: true,
      markerZoomAnimation: false
    });
    this.map.attributionControl.setPrefix('');

    this.tl = null;
    this.light = null;
    this.setTheme(false);

    this.uMk = null;
    this.uCr = null;
    this.rLine = null;
    this.rPts = [];
    this.rLast = null;
    this.arrowEl = null;

    this.fix = null;
    this.pos = null;
    this.hd = 0;
    this.hdT = 0;
    this.hdgStable = false;

    this.following = false;
    this.rotate = true;

    this.userZ = null;
    this.progZ = false;
    this.zooming = false;
    this.lastZ = 0;
    this._lastPanPos = null;
    this.onUserPan = null;

    this.mapRot = $('map-rot');
    this.carEl = $('car-arrow');

    this._size = this.map.getSize();

    this.map.on('zoomstart', () => { this.zooming = true; });
    this.map.on('zoomend', () => {
      if (!this.progZ && this.following) this.userZ = this.map.getZoom();
      this.progZ = false;
      this.zooming = false;
    });

    this.bindPan();

    this.lightsL = L.layerGroup().addTo(this.map);
    this.camsL = L.layerGroup().addTo(this.