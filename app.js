/**
 * RotaPro v9.3 STABLE — Keyless · Canvas · MCT YAZILIM
 * Tüm sistem ve haritazoom hataları onarılmış stabil sürüm.
 */
'use strict';

/* ─── GLOBAL HATA YAKALAYICI ─── */
window.addEventListener('error', (e) => {
  console.error('[RotaPro] Hata:', e.message, '@', e.filename, ':', e.lineno);
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[RotaPro] Promise hatası:', e.reason);
});

/* ─── TTS VOICE CACHE ─── */
let _cachedVoices = null;
let _voiceLoadRetries = 0;
function _loadVoices() {
  if (!('speechSynthesis' in window)) return;
  try {
    const v = window.speechSynthesis.getVoices();
    if (v && v.length) _cachedVoices = v;
    else if (_voiceLoadRetries < 15) {
      _voiceLoadRetries++;
      setTimeout(_loadVoices, 250);
    }
  } catch (e) {}
}
if ('speechSynthesis' in window) {
  _loadVoices();
  try { window.speechSynthesis.onvoiceschanged = _loadVoices; } catch (e) {}
}

/* ─── UTILITIES ─── */
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const hav = (a, b, c, d) => {
  if (!Number.isFinite(a) || !Number.isFinite(b) || !Number.isFinite(c) || !Number.isFinite(d)) return 0;
  const R = 6371, dr = Math.PI / 180;
  const x = Math.sin((c - a) * dr / 2) ** 2 +
            Math.cos(a * dr) * Math.cos(c * dr) * Math.sin((d - b) * dr / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
};

const HAZARD_TTL = 1800000;

async function fetchJSON(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal, headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

/* Overpass */
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
  if (!geom || !geom.length || !Number.isFinite(la) || !Number.isFinite(ln)) return Infinity;
  const k = Math.cos(la * Math.PI / 180), m = 111320;
  const P = g => (!g || !Number.isFinite(g.lat) || !Number.isFinite(g.lon)) ? null : [(g.lon - ln) * k * m, (g.lat - la) * m];
  if (geom.length === 1) {
    const pt = P(geom[0]);
    return pt ? Math.hypot(pt[0], pt[1]) : Infinity;
  }
  let best = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const pA = P(geom[i]), pB = P(geom[i + 1]);
    if (!pA || !pB) continue;
    const [ax, ay] = pA, [bx, by] = pB;
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
  if (!Number.isFinite(a1) || !Number.isFinite(b1) || !Number.isFinite(a2) || !Number.isFinite(b2)) return 0;
  const R = Math.PI / 180, y = Math.sin((b2 - b1) * R) * Math.cos(a2 * R);
  const x = Math.cos(a1 * R) * Math.sin(a2 * R) -
            Math.sin(a1 * R) * Math.cos(a2 * R) * Math.cos((b2 - b1) * R);
  const brg = (Math.atan2(y, x) / R + 360) % 360;
  return Number.isFinite(brg) ? brg : 0;
};

const POI_LABEL = { cam: 'radar', light: 'trafik ışığı', work: 'yol çalışması' };
const POI_RANGE = { cam: 500, light: 200, work: 400, hz: 600 };

const WARN_SVG = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const INFO_SVG = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
const CHECK_SVG = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';

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
    this.showWorks = false;
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
      this.showWorks  = o.sw === true;
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
    this.bg.classList.remove('open');
    this.isOpen = false;
    setTimeout(() => { if (!this.isOpen && this.bg) this.bg.style.display = 'none'; }, 520);
  }
  pointY(e) {
    if (e.touches && e.touches[0]) return e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return e.changedTouches[0].clientY;
    return e.clientY || 0;
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
    if (!Number.isFinite(y)) return;
    this.currentY = Math.max(0, y - this.startY);
    this.sheet.style.transform = `translateY(${this.currentY}px)`;
    const opacity = 1 - (this.currentY / (window.innerHeight || 800));
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

const POI_COLORS = {
  light: '#1db954',
  cam:   '#dc3545',
  work:  '#f59e0b'
};
const POI_RADIUS = { light: 4, cam: 6, work: 6 };

class RotaMap {
  constructor() {
    this.map = L.map('map', {
      center: [39.92, 32.85],
      zoom: 18,
      minZoom: 4, // Zoom out sınırlandırması: NaN çökmelerini önler
      maxZoom: 19,
      zoomControl: false,
      attributionControl: true,
      preferCanvas: true,
      touchZoom: 'center',
      scrollWheelZoom: 'center',
      doubleClickZoom: 'center',
      zoomSnap: 1,
      updateWhenIdle: true,
      updateWhenZooming: false, // Zoom sırasında Canvas çökmesini engeller
      zoomAnimationThreshold: 4,
      fadeAnimation: true,
      markerZoomAnimation: false,
      wheelPxPerZoomLevel: 120,
      wheelDebounceTime: 40,
      inertia: true,
      inertiaDeceleration: 3000,
      easeLinearity: 0.25
    });
    this.map.attributionControl.setPrefix('');

    this._poiRenderer = L.canvas({ padding: 0.5 });

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
    this.camsL = L.layerGroup().addTo(this.map);
    this.workL = L.layerGroup().addTo(this.map);
    this.hzL = L.layerGroup().addTo(this.map);
    this.navL = L.layerGroup().addTo(this.map);
    this.trailOn = false;

    this.initGauge();
  }

  invalidateSize() {
    this.map.invalidateSize();
    this._size = this.map.getSize();
  }

  initGauge() {
    const g = $('ticks');
    if (!g) return;
    const R = 85;
    g.innerHTML = '';
    const frag = document.createDocumentFragment();
    for (let i = 0; i <= 22; i++) {
      const a = (150 + i * (240 / 22)) * Math.PI / 180;
      const r1 = R - (i % 5 === 0 ? 8 : 4), r2 = R + 1;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', (100 + Math.cos(a) * r1).toFixed(1));
      l.setAttribute('y1', (100 + Math.sin(a) * r1).toFixed(1));
      l.setAttribute('x2', (100 + Math.cos(a) * r2).toFixed(1));
      l.setAttribute('y2', (100 + Math.sin(a) * r2).toFixed(1));
      l.setAttribute('stroke', '#fff');
      l.setAttribute('stroke-width', i % 5 === 0 ? '2' : '1');
      l.setAttribute('stroke-linecap', 'round');
      frag.appendChild(l);
    }
    g.appendChild(frag);
  }

  setTheme(light) {
    if (this.tl && this.light === light) return;
    this.light = light;
    if (this.tl) this.map.removeLayer(this.tl);

    this.tl = L.tileLayer(TILE_URL, {
      subdomains: 'abc',
      maxZoom: 19,
      maxNativeZoom: 19,
      keepBuffer: 1,
      updateWhenIdle: true,
      crossOrigin: true,
      attribution: '© OpenStreetMap',
      errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
    }).addTo(this.map);

    document.body.classList.toggle('dark-map', !light);
    this.tl.bringToBack();
  }

  bindPan() {
    const box = $('map-box');
    if (!box) return;
    const pts = new Map();
    box.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
    }, { passive: true });
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
    const wasFollowing = this.following;
    this.following = !!follow;
    this.rotate = !!rotate;
    document.body.classList.toggle('follow', this.following);
    document.body.classList.toggle('tilt', this.following && this.rotate);
    if (this.uCr && this.pos) this.updCircle();
    if (wasFollowing !== this.following) {
      this.mapRot.classList.add('anim');
      clearTimeout(this._at);
      this._at = setTimeout(() => this.mapRot.classList.remove('anim'), 700);
    }
    if (this.following) {
      this.map.dragging.disable();
      this.lastZ = 0;
      this._lastPanPos = null;
    } else {
      this.map.dragging.enable();
    }
  }

  recenter() {
    this.userZ = null;
    this._lastPanPos = null;
  }

  wantZoom(kmh) {
    if (this.userZ != null) return clamp(this.userZ, 4, 19);
    const want = kmh < 25 ? 19 : kmh < 60 ? 18 : kmh < 95 ? 17 : 16;
    const cur = this.map.getZoom(), now = Date.now();
    if (want !== cur && now - this.lastZ > 5000) { this.lastZ = now; return want; }
    return clamp(cur, 4, 19);
  }

  pushFix(la, ln, ac, hdg, kmh, snap) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    if (!this.uMk) {
      const html = '<svg class="nav-arrow" viewBox="0 0 24 24"><path d="M12 2L2 22l10-4 10 4L12 2z" fill="#2d7aff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      this.uMk = L.marker([la, ln], {
        icon: L.divIcon({ className: 'user-mk', html, iconSize: [32, 32], iconAnchor: [16, 16] }),
        interactive: false,
        keyboard: false
      }).addTo(this.map);

      this.uCr = L.circle([la, ln], {
        radius: Math.max(5, Number.isFinite(ac) ? ac : 20),
        color: '#2d7aff',
        fillColor: '#2d7aff',
        fillOpacity: 0.1,
        weight: 1.5,
        interactive: false,
        renderer: this._poiRenderer
      });

      this.arrowEl = null;
      this.pos = [la, ln];
      this.hd = Number.isFinite(hdg) ? hdg : 0;
      this.map.setView([la, ln], 18, { animate: false });
    }
    if (Number.isFinite(hdg)) this.hdT = hdg;
    this.fix = { la, ln, t: Date.now(), v: Math.max(0, kmh) / 3.6, snap: !!snap };
    this.acc = Number.isFinite(ac) ? ac : 10;
    this.updCircle();
  }

  updCircle() {
    if (!this.uCr || !this.pos) return;
    const show = !this.following && (this.acc >= 15);
    const has = this.map.hasLayer(this.uCr);
    if (show) {
      const r = Math.max(5, clamp(this.acc, 8, 200));
      this.uCr.setRadius(r);
      this.uCr.setLatLng(this.pos);
      if (!has) this.uCr.addTo(this.map);
    } else if (has) {
      this.map.removeLayer(this.uCr);
    }
  }

  frame(t) {
    const f = this.fix;
    if (!f || !this.uMk || !this.pos || !Number.isFinite(this.pos[0]) || !Number.isFinite(this.pos[1])) return;
    const dt = this._fdt ? Math.min(0.1, (t - this._fdt) / 1000) : 0.033;
    this._fdt = t;

    if (!this.arrowEl) {
      const el = this.uMk.getElement();
      if (el) this.arrowEl = el.querySelector('svg');
    }

    let la = f.la, ln = f.ln;
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;

    const fresh = Date.now() - f.t < 2000;
    if (!f.snap && fresh && f.v > 4 && this.hdgStable) {
      const age = Math.min(0.5, (Date.now() - f.t) / 1000 + 0.1);
      const m = f.v * age, h = this.hd * Math.PI / 180;
      la += m * Math.cos(h) / 111320;
      ln += m * Math.sin(h) / (111320 * Math.cos(la * Math.PI / 180));
    }

    const k = 1 - Math.exp(-dt * 6);
    this.pos[0] += (la - this.pos[0]) * k;
    this.pos[1] += (ln - this.pos[1]) * k;
    const dh = ((this.hdT - this.hd + 540) % 360) - 180;
    this.hd = (this.hd + clamp(dh * (1 - Math.exp(-dt * 4)), -150 * dt, 150 * dt) + 360) % 360;

    if (this.trailOn) this.addRoutePoint(this.pos[0], this.pos[1]);

    const rot = this.following && this.rotate, hs = this.hd.toFixed(1);
    if (hs !== this._hs || rot !== this._rot) {
      this._hs = hs; this._rot = rot;
      if (this.mapRot) this.mapRot.style.transform = rot ? `rotateX(${TILT}deg) rotateZ(${-this.hd}deg)` : 'none';
      if (this.carEl) this.carEl.style.transform = `rotate(${rot ? 0 : this.hd}deg)`;
      if (this.arrowEl) this.arrowEl.style.transform = `rotate(${this.hd}deg)`;
      const deg = Math.round(this.hd);
      if (rot && Math.abs(((deg - (this._hdCss ?? -99) + 540) % 360) - 180) >= 3) {
        this._hdCss = deg;
        this.mapRot.style.setProperty('--map-hd', deg + 'deg');
      }
    }

    if (!this.following || t - (this._mt || 0) > 400) {
      this._mt = t;
      this.uMk.setLatLng(this.pos);
    }

    if (this.following && !this.zooming) {
      const z = this.wantZoom(f.v * 3.6);
      if (z !== this.map.getZoom()) {
        this.progZ = true;
        this.map.setView(this.pos, z, { animate: true });
        return;
      }
      if (this._lastPanPos &&
          this._lastPanPos[0] === this.pos[0] &&
          this._lastPanPos[1] === this.pos[1]) {
        return;
      }
      const ctr = this.map.latLngToContainerPoint(this.pos);
      if (ctr && Number.isFinite(ctr.x) && Number.isFinite(ctr.y)) {
        const half = this._size.divideBy(2);
        const dx = ctr.x - half.x, dy = ctr.y - half.y;
        if (Number.isFinite(dx) && Number.isFinite(dy) &&
            Math.abs(dx) < 1500 && Math.abs(dy) < 1500 &&
            (Math.abs(dx) >= 4 || Math.abs(dy) >= 4)) {
          this.map.panBy([dx, dy], { animate: false });
          this._lastPanPos = [this.pos[0], this.pos[1]];
        }
      }
    }
  }

  addRoutePoint(la, ln) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    if (this.rLast) {
      const d = hav(this.rLast[0], this.rLast[1], la, ln) * 1000;
      if (d < 5) return;
    }
    this.rLast = [la, ln];
    this.rPts.push([la, ln]);

    if (!this.rLine) {
      this.rLine = L.polyline([this.rPts[0]], {
        color: '#2d7aff',
        weight: 3,
        opacity: 0.7,
        interactive: false,
        smoothFactor: 1.5,
        renderer: this._poiRenderer
      }).addTo(this.map);
    }
    this.rLine.addLatLng([la, ln]);

    if (this.rPts.length > ROUTE_MAX_PTS) {
      const drop = Math.floor(ROUTE_MAX_PTS * 0.1);
      this.rPts = this.rPts.slice(drop);
      this.rLine.setLatLngs(this.rPts);
    }
  }

  clearRoute() {
    this.rPts = [];
    this.rLast = null;
    if (this.rLine) { this.map.removeLayer(this.rLine); this.rLine = null; }
  }

  drawNav(pts, dest) {
    this.navL.clearLayers();
    if (pts && pts.length > 1) {
      const validPts = pts.filter(p => p && Number.isFinite(p[0]) && Number.isFinite(p[1]));
      if (validPts.length > 1) {
        L.polyline(validPts, { color: '#fff', weight: 9, opacity: 0.9, interactive: false, renderer: this._poiRenderer }).addTo(this.navL);
        L.polyline(validPts, { color: '#8b5cf6', weight: 5, interactive: false, renderer: this._poiRenderer }).addTo(this.navL);
      }
    }
    if (dest && Number.isFinite(dest[0]) && Number.isFinite(dest[1])) {
      L.marker(dest, {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({ className: '', html: '<div style="font-size:26px;line-height:1">📍</div>', iconSize: [26, 26], iconAnchor: [13, 24] })
      }).addTo(this.navL);
    }
  }

  addHazard(la, ln, type, ts = Date.now()) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    const ico = { 'Kaza': '💥', 'Çalışma': '🚧', 'Heyelan': '⛰️', 'Diğer': '⚠️' }[type] || '⚠️';
    const left = ts + HAZARD_TTL - Date.now();
    if (left <= 0) return;
    try {
      const mk = L.marker([la, ln], {
        icon: L.divIcon({
          className: '',
          html: `<div class="hz-dot" style="font-size:14px;text-shadow:0 0 4px rgba(0,0,0,0.5)">${ico}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        }),
        interactive: true,
        keyboard: false
      }).addTo(this.hzL);
      mk.bindPopup(`<b>${esc(type)}</b><br>${new Date(ts).toLocaleTimeString('tr-TR')}`);
      setTimeout(() => {
        try { this.hzL.removeLayer(mk); } catch (_) {}
      }, left);
    } catch (e) {}
  }

  clearHazards() {
    try { this.hzL.clearLayers(); } catch (e) {}
  }

  setPOIs(list, cfg) {
    this.lightsL.clearLayers();
    this.camsL.clearLayers();
    this.workL.clearLayers();
    if (!Array.isArray(list)) return;
    for (const p of list) {
      if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
      let target = null;
      if (p.kind === 'light') {
        if (cfg.showLights) target = this.lightsL;
      } else if (p.kind === 'work') {
        if (cfg.showWorks) target = this.workL;
      } else {
        if (cfg.showCams) target = this.camsL;
      }
      if (!target) continue;

      const color = POI_COLORS[p.kind] || '#dc3545';
      const radius = POI_RADIUS[p.kind] || 5;

      L.circleMarker([p.lat, p.lng], {
        renderer: this._poiRenderer,
        radius,
        color: '#ffffff',
        weight: 1.5,
        fillColor: color,
        fillOpacity: 1,
        interactive: false
      }).addTo(target);
    }
  }
}

/* ─── APP MANAGER ─── */
class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.destSheet = new SheetManager('dest-bg', 'dest-sheet', 'dest-handle', 'btn-dest', 'dest-close');
    this.map = new RotaMap();

    this.dom = {};
    const domIds = ['spd-val','g-bar','g-needle-group','g-needle','gauge-svg','limit-badge','limit-num',
      'ovr','ss-max','ss-avg','ss-trip','m-dur','m-alt','m-dir','m-acc','m-trf','m-fuel','ft-bars','ft-clock','ft-dot',
      'ft-gps','tip','tip-t','tip-icon','hz-menu','btn-hz','btn-loc','nav-banner','nb-arrow',
      'nb-dist','nb-txt','nb-eta','is-temp','is-wind','is-loc','hdr-road','splash','splash-status',
      'dest-clear','st-lim','st-wx','st-trf','st-geo'];
    for (const id of domIds) this.dom[id] = $(id);
    this.dom.ftBars = this.dom['ft-bars'] ? Array.from(this.dom['ft-bars'].querySelectorAll('.ft-bar')) : [];

    this.state = {
      lat: null, lng: null, spd: 0, hdg: null, alt: null, acc: null,
      lim: null, limTs: 0,
      maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0,
      dist: 0, start: null, end: null,
      prev: null, prevT: null,
      tracking: false, gpsOn: false,
      smoothV: 0,
      poi: [],
      ahead: null,
      dataAge: null,
      lastTK: '',
      gpsErr: '',
      wasOver: false,
      roadCond: '--',
      roadCondCode: null,
      fuelTotal: 0,
      fuelCost: 0,
      fuelCO2: 0,
      avgFuel: 0
    };

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
    this.hazards = [];
    this.alerted = new Set();

    this._firstFix = false;
    this._lastGood = null;
    this._hdgHistory = [];
    this._wrongWay = 0;
    this._wrongWarned = 0;
    this._lastFuelT = 0;

    this._moving = false;
    this._idleSince = 0;
    this._dirty = true;
    this._lowPower = false;
    this._battery = null;
    this._rafId = 0;
    this._lastMapFrame = 0;
    this._lastRenderFrame = 0;
    this._lastAheadFrame = 0;
    this._lastPct = -1;
    this._badgeOff = null;

    this._speakLast = null;
    this._ttsWarmed = false;

    this._splashTimer = null;
    this._splashForceTimer = null;

    this.syncFormFromConfig();
    this.bindUI();
    this.bindNav();
    this.startClock();

    this.applyTheme();
    this.syncMode();
    this.restoreHazards();

    setTimeout(() => { try { this.map.invalidateSize(); } catch (e) {} }, 300);
    window.addEventListener('resize', () => { try { this.map.invalidateSize(); } catch (e) {} }, { passive: true });

    this._doRender();

    this.initBatterySaver();
    this.startFrameLoop();

    this.startSplash();
    this.bindFirstGesture();

    setTimeout(() => {
      this.startGPS();
      if (this.cfg.soundOn) this.unlockAudio();
    }, 250);

    /* Kendi tehlikeleri periyodik temizle */
    setInterval(() => this.cleanupHazards(), 60000);
  }

  startFrameLoop() {
    const loop = (t) => {
      this._rafId = requestAnimationFrame(loop);
      if (document.hidden) return;

      try {
        let mapInt = 200;
        if (this._moving) mapInt = this._lowPower ? 66 : 40;
        if (t - this._lastMapFrame >= mapInt) {
          this._lastMapFrame = t;
          this.map.frame(t);
        }

        const renderInt = this._lowPower ? 300 : 150;
        if (this._dirty || t - this._lastRenderFrame >= renderInt) {
          this._dirty = false;
          this._lastRenderFrame = t;
          this._doRender();
        }

        if (this._moving && t - this._lastAheadFrame >= 250) {
          this._lastAheadFrame = t;
          this.computeAhead();
        }
      } catch (e) {
        console.error('[RotaPro] frame hatası:', e);
      }
    };
    this._rafId = requestAnimationFrame(loop);
  }

  async initBatterySaver() {
    if (!('getBattery' in navigator)) return;
    try {
      const b = await navigator.getBattery();
      this._battery = b;
      const update = () => {
        const low = (b.level < 0.15 && !b.charging);
        if (low !== this._lowPower) {
          this._lowPower = low;
          document.body.classList.toggle('low-power', low);
        }
      };
      b.addEventListener('levelchange', update);
      b.addEventListener('chargingchange', update);
      update();
    } catch (e) {}
  }

  startSplash() {
    const el = this.dom['splash'];
    if (!el) return;
    this.setSplashStatus('Sistem başlatılıyor…');
    clearTimeout(this._splashTimer);
    clearTimeout(this._splashForceTimer);

    this._splashTimer = setTimeout(() => {
      this.setSplashStatus('Uygulama başlatılıyor…');
      this.hideSplash();
    }, 2500);

    this._splashForceTimer = setTimeout(() => {
      const s = this.dom['splash'];
      if (s && s.parentNode) {
        try { s.parentNode.removeChild(s); } catch (_) {}
        this.dom['splash'] = null;
      }
    }, 4000);

    const dismiss = () => this.hideSplash();
    el.addEventListener('click', dismiss, { once: true });
    el.addEventListener('touchstart', dismiss, { once: true, passive: true });
    el.addEventListener('keydown', dismiss, { once: true });
  }

  setSplashStatus(txt, kind) {
    const el = this.dom['splash-status'];
    if (!el) return;
    if (el.textContent !== txt) el.textContent = txt;
    el.classList.remove('ok', 'err');
    if (kind === 'ok') el.classList.add('ok');
    else if (kind === 'err') el.classList.add('err');
  }

  hideSplash() {
    const el = this.dom['splash'];
    if (!el || el.classList.contains('hide')) return;
    clearTimeout(this._splashTimer);
    clearTimeout(this._splashForceTimer);
    el.classList.add('hide');
    setTimeout(() => {
      if (el && el.parentNode) {
        try { el.parentNode.removeChild(el); } catch (_) {}
      }
      this.dom['splash'] = null;
    }, 700);
  }

  bindFirstGesture() {
    const unlock = () => {
      this.unlockAudio();
      if (!this._ttsWarmed && this.cfg.ttsOn && 'speechSynthesis' in window) {
        this._ttsWarmed = true;
        try {
          const u = new SpeechSynthesisUtterance(' ');
          u.volume = 0;
          u.lang = 'tr-TR';
          if (_cachedVoices && _cachedVoices.length) {
            const tr = _cachedVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('tr'));
            if (tr.length) u.voice = tr[0];
          }
          window.speechSynthesis.speak(u);
        } catch (e) {}
      }
    };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('touchend', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true });
  }

  syncFormFromConfig() {
    const set = (id, val) => { const el = $(id); if (el) el.checked = !!val; };
    const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };
    set('o-autostart', this.cfg.autoStart);
    set('o-center', this.cfg.autoCenter);
    set('o-rotate', this.cfg.rotateMode);
    set('o-sound',  this.cfg.soundOn);
    set('o-tts',    this.cfg.ttsOn);
    set('o-wake',   this.cfg.wakeOn);
    set('o-theme',  this.cfg.lightTheme);
    setVal('o-thr', this.cfg.threshold);
    set('o-lights', this.cfg.showLights);
    set('o-cams',   this.cfg.showCams);
    set('o-works',  this.cfg.showWorks);
    set('o-fuel',   this.cfg.showFuel);
    const vh = $('o-vehicle'); if (vh) vh.value = this.cfg.vehicle;
    const fp = $('o-fuelprice'); if (fp) fp.value = this.cfg.fuelPrice;
  }

  syncMode() {
    this.map.setMode(this.cfg.autoCenter, this.cfg.rotateMode);
    const btn = this.dom['btn-loc'];
    if (btn) btn.classList.toggle('active', this.cfg.autoCenter);
  }

  applyTheme() {
    document.body.classList.toggle('light-theme', this.cfg.lightTheme);
    this.map.setTheme(this.cfg.lightTheme);
  }

  bindUI() {
    this.map.onUserPan = () => {
      this.cfg.autoCenter = false;
      const el = $('o-center'); if (el) el.checked = false;
      this.syncMode();
    };

    const themeBtn = $('btn-theme');
    if (themeBtn) themeBtn.addEventListener('click', () => {
      const el = $('o-theme');
      const newVal = !(el ? el.checked : this.cfg.lightTheme);
      if (el) el.checked = newVal;
      this.applySettingsFromForm();
    });

    const liveIds = ['o-autostart','o-center','o-rotate','o-sound','o-tts','o-wake','o-theme','o-thr','o-lights','o-cams','o-works','o-vehicle','o-fuelprice','o-fuel'];
    liveIds.forEach(id => {
      const el = $(id);
      if (!el) return;
      el.addEventListener('change', () => this.applySettingsFromForm());
    });

    const saveBtn = $('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      this.applySettingsFromForm();
      this.sheet.close();
    });

    const locBtn = $('btn-loc');
    if (locBtn) locBtn.addEventListener('click', () => {
      this.map.recenter();
      this.cfg.autoCenter = true;
      const el = $('o-center'); if (el) el.checked = true;
      this.syncMode();
    });

    const hzBtn = $('btn-hz'), hzMenu = this.dom['hz-menu'];
    if (hzBtn && hzMenu) {
      hzBtn.addEventListener('click', e => {
        e.stopPropagation();
        const isVis = hzMenu.style.display === 'flex';
        hzMenu.style.display = isVis ? 'none' : 'flex';
        hzBtn.classList.toggle('active', !isVis);
      });

      document.querySelectorAll('.hz-opt').forEach(btn => {
        btn.addEventListener('click', e => {
          e.stopPropagation();
          hzMenu.style.display = 'none';
          hzBtn.classList.remove('active');
          if (this.state.lat != null) {
            const type = e.currentTarget.dataset.type;
            if (!type) return;
            this.addHazardReport(type);
            this.setTip('warn', `${type} tehlikesi işaretlendi.`, WARN_SVG);
            this.speak(`${type} tehlikesi işaretlendi.`);
            this.state.lastTK = 'hazard';
            setTimeout(() => {
              if (this.state.lastTK === 'hazard') {
                this.state.lastTK = '';
                this._dirty = true;
              }
            }, 3000);
          }
        });
      });

      document.addEventListener('click', e => {
        if (hzMenu.style.display !== 'flex') return;
        if (!hzBtn.contains(e.target) && !hzMenu.contains(e.target)) {
          hzMenu.style.display = 'none';
          hzBtn.classList.remove('active');
        }
      });
    }

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (this.state.tracking && this.cfg.wakeOn) this.reqWake();
      }
    });
  }

  applySettingsFromForm() {
    const get = id => { const el = $(id); return el ? el.checked : false; };
    const getVal = id => { const el = $(id); return el ? el.value : 10; };
    const getSel = id => { const el = $(id); return el ? el.value : 'benzin'; };
    const getNum = (id, def) => { const el = $(id); return el ? (parseFloat(el.value) || def) : def; };
    const before = {
      l: this.cfg.showLights, c: this.cfg.showCams, w: this.cfg.showWorks,
      theme: this.cfg.lightTheme, center: this.cfg.autoCenter, rotate: this.cfg.rotateMode,
      wake: this.cfg.wakeOn
    };

    this.cfg.save(
      get('o-center'), get('o-rotate'), get('o-sound'), get('o-tts'), get('o-wake'),
      get('o-theme'), getVal('o-thr'),
      {
        lights: get('o-lights'), cams: get('o-cams'), works: get('o-works'),
        autoStart: get('o-autostart'),
        vehicle: getSel('o-vehicle'),
        fuelPrice: getNum('o-fuelprice', 45),
        showFuel: get('o-fuel')
      }
    );

    const thrEl = $('o-thr');
    if (thrEl) thrEl.value = this.cfg.threshold;

    if (before.theme !== this.cfg.lightTheme) this.applyTheme();
    if (before.center !== this.cfg.autoCenter || before.rotate !== this.cfg.rotateMode) {
      this.syncMode();
    }

    if (this.cfg.wakeOn && this.state.tracking) this.reqWake();
    else if (!this.cfg.wakeOn && before.wake) this.relWake();

    if (before.l !== this.cfg.showLights ||
        before.c !== this.cfg.showCams ||
        before.w !== this.cfg.showWorks) {
      this.cache.poi.ts = 0;
      this.state.poi = [];
      this.map.setPOIs([], this.cfg);
    }

    if (this.cfg.soundOn) this.unlockAudio();
    this._dirty = true;
  }

  toggleTracking(forceStart = false) {
    if (forceStart && this.state.tracking) return;
    if (forceStart) this.state.tracking = true;
    else this.state.tracking = !this.state.tracking;

    if (this.state.tracking) {
      if (this.watchId == null) this.startGPS();
      this.reqWake();
      this.map.clearRoute();
      this.map.trailOn = true;
      Object.assign(this.state, {
        start: Date.now(), end: null,
        dist: 0, maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0,
        prev: null, prevT: null,
        fuelTotal: 0, fuelCost: 0, fuelCO2: 0, avgFuel: 0
      });
      this._lastFuelT = 0;
    } else {
      this.state.end = Date.now();
      this.map.trailOn = false;
      this.clearNav(false);
      this.relWake();
      this.stopGPS();
    }
    this._dirty = true;
  }

  startGPS() {
    if (this.watchId != null) return;
    if (!navigator.geolocation) { this.gpsFail('Bu cihaz konum servisini desteklemiyor.'); return; }
    if (window.isSecureContext === false) { this.gpsFail('Konum için güvenli bağlantı (HTTPS) gerekli.'); return; }

    this.setSplashStatus('Konum izni bekleniyor…');
    this.state.gpsErr = '';
    this.state.gpsOn = true;
    this.watchId = navigator.geolocation.watchPosition(
      p => this.onGPS(p),
      e => {
        if (e.code === 1) {
          try { navigator.geolocation.clearWatch(this.watchId); } catch (_) {}
          this.watchId = null;
          this.gpsFail('Konum izni reddedildi. Tarayıcı ayarlarından izin verin.');
        } else if (e.code === 2) {
          this.state.gpsErr = 'Konum alınamıyor. Açık alanda deneyin.';
          this._dirty = true;
        }
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 15000 }
    );
    const dot = this.dom['ft-dot']; if (dot) dot.classList.add('on');
    const gps = this.dom['ft-gps'];
    if (gps) {
      gps.textContent = 'Konum Bekleniyor';
      gps.style.color = 'var(--amber)';
    }
  }

  stopGPS() {
    if (this.watchId != null) {
      try { navigator.geolocation.clearWatch(this.watchId); } catch (_) {}
      this.watchId = null;
    }
    this.state.gpsOn = false;
    const dot = this.dom['ft-dot']; if (dot) dot.classList.remove('on');
    const gps = this.dom['ft-gps'];
    if (gps) {
      gps.textContent = 'GPS Kapalı';
      gps.style.color = 'var(--text-secondary)';
    }
  }

  gpsFail(msg) {
    this.state.gpsOn = false;
    this.state.gpsErr = msg;
    const dot = this.dom['ft-dot']; if (dot) dot.classList.remove('on');
    const gps = this.dom['ft-gps'];
    if (gps) {
      gps.textContent = 'GPS Kapalı';
      gps.style.color = 'var(--red)';
    }
    this.setSplashStatus('Konum alınamadı', 'err');
    setTimeout(() => this.hideSplash(), 900);
    this._dirty = true;
  }

  onGPS(p) {
    try {
      if (!p || !p.coords) return;
      const { latitude: la, longitude: ln, speed: sp, heading: hd, altitude: al, accuracy: ac } = p.coords;
      const st = this.state;
      const now = p.timestamp || Date.now();

      if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
      if (ac != null && ac > 150) return;

      if (st.gpsErr) st.gpsErr = '';
      const gpsEl = this.dom['ft-gps'];
      if (gpsEl && gpsEl.textContent !== 'GPS Aktif') {
        gpsEl.textContent = 'GPS Aktif';
        gpsEl.style.color = 'var(--green)';
      }

      st.lat = la;
      st.lng = ln;
      st.acc = ac;
      st.alt = (al != null && Number.isFinite(al)) ? Math.round(al) : null;

      if (!this._firstFix) {
        this._firstFix = true;
        this._lastGood = [la, ln];
        this.map.clearHazards();
        this._redrawAllHazards();
        this.setSplashStatus('Hazır', 'ok');
        setTimeout(() => this.hideSplash(), 400);
        if (!st.tracking && this.cfg.autoStart) {
          setTimeout(() => { if (!st.tracking) this.toggleTracking(true); }, 600);
        }
      }

      /* HIZ */
      let raw;
      if (sp != null && Number.isFinite(sp) && sp >= 0) {
        raw = sp * 3.6;
      } else if (st.prev && st.prevT && now - st.prevT > 500) {
        raw = hav(st.prev[0], st.prev[1], la, ln) * 1000 / ((now - st.prevT) / 1000) * 3.6;
      } else {
        raw = st.smoothV;
      }
      if (raw < 2.5 && ac > 30) raw = 0;
      if (raw > 400) raw = st.smoothV;
      const aW = raw > st.smoothV ? 0.55 : 0.35;
      st.smoothV = st.smoothV * (1 - aW) + raw * aW;
      st.spd = Math.round(st.smoothV);

      if (st.spd >= 3) {
        this._moving = true;
        this._idleSince = 0;
      } else {
        if (!this._idleSince) this._idleSince = now;
        if (now - this._idleSince > 8000) this._moving = false;
      }

      /* YÖN */
      let newHdg = null;
      if (hd != null && Number.isFinite(hd) && st.spd >= 3) {
        newHdg = hd;
      } else if (st.prev && st.spd >= 5 && hav(st.prev[0], st.prev[1], la, ln) * 1000 > 3) {
        newHdg = bearing(st.prev[0], st.prev[1], la, ln);
      }
      if (newHdg != null && Number.isFinite(newHdg)) {
        if (st.hdg == null) st.hdg = newHdg;
        else {
          let d = ((newHdg - st.hdg + 540) % 360) - 180;
          st.hdg = (st.hdg + d * 0.35 + 360) % 360;
        }
        this._hdgHistory.push(newHdg);
        if (this._hdgHistory.length > 4) this._hdgHistory.shift();
      }
      let hdgStable = false;
      if (this._hdgHistory.length >= 3) {
        let maxDiff = 0;
        for (let i = 1; i < this._hdgHistory.length; i++) {
          let d = Math.abs(this._hdgHistory[i] - this._hdgHistory[i - 1]);
          if (d > 180) d = 360 - d;
          if (d > maxDiff) maxDiff = d;
        }
        hdgStable = maxDiff < 25;
      }
      this.map.hdgStable = hdgStable;

      /* MESAFE + YAKIT */
      if (st.tracking) {
        if (st.spd > st.maxSpd) st.maxSpd = st.spd;
        if (st.spd > 0) {
          st.sumSpd += st.spd;
          st.spdN++;
          st.avgSpd = Math.round(st.sumSpd / st.spdN);
        }
        if (st.prev && ac <= 100) {
          const d = hav(st.prev[0], st.prev[1], la, ln);
          if (d > 0.003 && d < 2) st.dist += d;
        }

        const dtFuel = this._lastFuelT ? (now - this._lastFuelT) / 1000 : 0;
        if (dtFuel > 0 && dtFuel < 5) {
          const rate = fuelRateAt(this.cfg.vehicle, st.spd);
          st.fuelTotal += rate * dtFuel / 3600;
          st.fuelCost  = st.fuelTotal * this.cfg.fuelPrice;
          st.fuelCO2   = st.fuelTotal * (CO2_PER_UNIT[this.cfg.vehicle] || 2.31);
        }
        this._lastFuelT = now;

        if (st.dist > 0.05) st.avgFuel = st.fuelTotal / st.dist * 100;
      }
      st.prev = [la, ln];
      st.prevT = now;

      /* KONUM FİLTRESİ */
      let pla = la, pln = ln, phd = st.hdg, snap = false;
      const lastGood = this._lastGood;
      if (ac != null && ac > 60) {
        if (lastGood) { pla = lastGood[0]; pln = lastGood[1]; }
      } else if (st.spd < 3 && lastGood) {
        const d = hav(lastGood[0], lastGood[1], la, ln) * 1000;
        const jitter = Math.max(4, Math.min(ac * 0.8, 25));
        if (d < jitter) {
          pla = lastGood[0]; pln = lastGood[1];
          st.acc = Math.max(3, Math.round(ac * 0.5));
        } else {
          this._lastGood = [la, ln];
        }
      } else {
        if (lastGood) {
          const d = hav(lastGood[0], lastGood[1], la, ln) * 1000;
          if (d < 1.5 && ac > 20) {
            pla = lastGood[0]; pln = lastGood[1];
          } else {
            this._lastGood = [la, ln];
          }
        } else {
          this._lastGood = [la, ln];
        }
      }

      /* NAV SNAP */
      if (this.nav) {
        if (this.nav.pending) this.buildRoute();
        else {
          const s = this.navUpdate(pla, pln);
          if (s) { pla = s.la; pln = s.ln; phd = s.h; snap = true; }
        }
      }

      this.map.pushFix(pla, pln, ac, phd, st.smoothV, snap);
      this.fetchServices();
      this._dirty = true;
    } catch (e) {
      console.error('[RotaPro] onGPS hatası:', e);
    }
  }

  _setTxt(el, val) {
    if (el && el.textContent !== String(val)) el.textContent = String(val);
  }

  setStatus(id, ok, txt) {
    const el = this.dom[id] || $(id);
    if (!el) return;
    this._setTxt(el, txt);
    const cls = 'm-status ' + (ok ? 'ok' : 'err');
    if (el.className !== cls) el.className = cls;
  }

  fetchServices() {
    const la = this.state.lat, ln = this.state.lng;
    if (la == null || ln == null || !Number.isFinite(la) || !Number.isFinite(ln)) return;
    const now = Date.now();

    /* HIZ LİMİTİ */
    if (!this.timers.lim && !this.busy.lim &&
        (now - this.cache.lim.ts > 12000 || hav(la, ln, this.cache.lim.la, this.cache.lim.ln) > 0.15)) {
      this.cache.lim = { ts: now, la, ln };
      this.timers.lim = setTimeout(async () => {
        this.timers.lim = null;
        this.busy.lim = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null || cln == null) { this.busy.lim = false; return; }
        try {
          const q = `[out:json][timeout:6];way(around:30,${cla},${cln})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|track|road|pedestrian)$"];out tags geom;`;
          const j = await fetchOverpass(q, 9000);
          let best = null, bestD = Infinity;
          for (const el of (j.elements || [])) {
            const road = el.tags && el.tags.highway;
            const v = parseMaxspeed(el.tags && el.tags.maxspeed, road);
            if (!v) continue;
            const d = distToPolyline(cla, cln, el.geometry);
            if (d < bestD && d < 35) { bestD = d; best = v; }
          }
          if (best) {
            this.state.lim = best;
            this.state.limTs = Date.now();
            this.state.dataAge = Date.now();
            this.setStatus('st-lim', true, 'Aktif');
          } else {
            if (Date.now() - this.state.limTs > 30000) this.state.lim = null;
            this.setStatus('st-lim', false, 'Bilinmiyor');
          }
        } catch (e) {
          if (Date.now() - this.state.limTs > 30000) this.state.lim = null;
          this.setStatus('st-lim', false, 'Hata');
        } finally {
          this.busy.lim = false;
        }
      }, 800);
    }

    /* HAVA */
    const wxMoved = this.cache.wx.la == null ? Infinity : hav(la, ln, this.cache.wx.la, this.cache.wx.ln);
    if (!this.timers.wx && !this.busy.wx &&
        (now - this.cache.wx.ts > 180000 || wxMoved > 20)) {
      this.cache.wx.ts = now;
      this.timers.wx = setTimeout(async () => {
        this.timers.wx = null;
        this.busy.wx = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null || cln == null) { this.busy.wx = false; return; }
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${cla}&longitude=${cln}`
            + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m`
            + `&timezone=auto`;
          const j = await fetchJSON(url, 8000);
          const c = j.current || {};
          this.cache.wx = { ts: Date.now(), code: c.weather_code, la: cla, ln: cln };

          this._setTxt(this.dom['is-temp'], Math.round(c.temperature_2m ?? 0) + '°C');
          this._setTxt(this.dom['is-wind'], Math.round(c.wind_speed_10m ?? 0) + ' km/s');

          const cond = this.deriveRoadCondition(c);
          this.state.roadCond = cond.label;
          this.state.roadCondCode = cond.code;

          this.setStatus('st-wx', true, 'Aktif');
          this._dirty = true;
        } catch (e) {
          this.setStatus('st-wx', false, 'Hata');
        } finally {
          this.busy.wx = false;
        }
      }, 1500);
    }

    /* ADRES */
    const geoMoved = this.cache.geo.la == null ? Infinity : hav(la, ln, this.cache.geo.la, this.cache.geo.ln);
    if (!this.timers.geo && !this.busy.geo &&
        geoMoved > 0.25 &&
        (now - this.cache.geo.ts > 45000 || this.cache.geo.ts === 0)) {
      this.cache.geo.ts = now - 30000;
      this.timers.geo = setTimeout(async () => {
        this.timers.geo = null;
        this.busy.geo = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null || cln == null) { this.busy.geo = false; return; }
        try {
          const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${cla}&lon=${cln}&zoom=17&addressdetails=1&accept-language=tr`, 8000);
          this.cache.geo = { ts: Date.now(), la: cla, ln: cln };
          if (j.address) {
            const p = [];
            if (j.address.road) p.push(j.address.road);
            const sub = j.address.suburb || j.address.neighbourhood;
            if (sub) p.push(sub);
            this._setTxt(this.dom['is-loc'], p.join(', ') || 'Bölge Saptandı');
            this._setTxt(this.dom['hdr-road'], j.address.road || 'Navigasyon Sistemi');
          }
          this.setStatus('st-geo', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-geo', false, 'Hata');
        } finally {
          this.busy.geo = false;
        }
      }, 2000);
    }

    /* POI */
    const poiMoved = hav(la, ln, this.cache.poi.la, this.cache.poi.ln);
    const wantPOI = this.cfg.showLights || this.cfg.showCams || this.cfg.showWorks;
    if (wantPOI && !this.busy.poi && !this.timers.poi &&
        (now - this.cache.poi.ts > 120000 ||
        (poiMoved > 0.7 && now - this.cache.poi.ts > 30000))) {
      this.cache.poi = { ts: now, la, ln };
      this.timers.poi = setTimeout(async () => {
        this.timers.poi = null;
        this.busy.poi = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null || cln == null) { this.busy.poi = false; return; }
        try {
          const ar = `(around:700,${cla},${cln})`;
          const parts = [];
          if (this.cfg.showLights) {
            parts.push(`node${ar}[highway=traffic_signals]`);
          }
          if (this.cfg.showCams) {
            parts.push(`node${ar}[highway=speed_camera]`);
            parts.push(`node${ar}[enforcement=maxspeed]`);
          }
          if (this.cfg.showWorks) {
            parts.push(`way${ar}[highway=construction]`);
          }
          if (!parts.length) { this.busy.poi = false; return; }

          const q = `[out:json][timeout:8];(${parts.join(';')};);out center 120;`;
          const j = await fetchOverpass(q, 10000);
          const list = [], seenIds = new Set();

          for (const el of (j.elements || [])) {
            const lat = el.lat ?? (el.center && el.center.lat);
            const lon = el.lon ?? (el.center && el.center.lon);
            if (lat == null || lon == null || seenIds.has(el.id)) continue;
            seenIds.add(el.id);

            const t = el.tags || {};
            let kind;
            if (t.highway === 'construction') kind = 'work';
            else if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed') kind = 'cam';
            else kind = 'light';

            list.push({ id: el.id, kind, lat, lng: lon });
          }

          const dedup = [];
          for (const p of list) {
            let dup = false;
            for (const q2 of dedup) {
              if (q2.kind !== p.kind) continue;
              if (hav(p.lat, p.lng, q2.lat, q2.lng) * 1000 < 15) { dup = true; break; }
            }
            if (!dup) dedup.push(p);
          }

          this.state.poi = dedup;
          this.map.setPOIs(dedup, this.cfg);
          this.setStatus('st-trf', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-trf', false, 'Hata');
        } finally {
          this.busy.poi = false;
        }
      }, 1200);
    }
  }

  /* ─── ROTA ─── */
  bindNav() {
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener('click', fn); };
    const go = () => {
      const qEl = $('dest-q');
      if (qEl) this.searchPlace(qEl.value.trim());
    };
    on('dest-go', go);
    const q = $('dest-q');
    if (q) q.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    on('dest-pick', () => this.startPick());
    on('pick-ok', () => this.endPick(true));
    on('pick-no', () => this.endPick(false));
    on('dest-clear', () => { this.destSheet.close(); this.clearNav(true); });
    on('nb-x', () => this.clearNav(true));
  }

  async searchPlace(q) {
    const box = $('dest-res');
    if (!box) return;
    if (q.length < 3) { box.textContent = 'En az 3 karakter girin.'; return; }
    box.textContent = 'Aranıyor…';
    try {
      const j = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=tr&countrycodes=tr&q=${encodeURIComponent(q)}`, 9000);
      if (!j || !j.length) { box.textContent = 'Sonuç bulunamadı.'; return; }
      box.innerHTML = j.map((r, i) => `<button class="dest-row" data-i="${i}">${esc(r.display_name)}</button>`).join('');
      box.querySelectorAll('.dest-row').forEach(b => b.addEventListener('click', () => {
        const r = j[+b.dataset.i];
        this.destSheet.close();
        this.setDest(+r.lat, +r.lon, r.display_name.split(',')[0]);
      }));
    } catch (e) { box.textContent = 'Arama başarısız. Bağlantıyı kontrol edin.'; }
  }

  startPick() {
    this.destSheet.close();
    document.body.classList.add('picking');
    this.map.setMode(false, false);
  }

  endPick(ok) {
    document.body.classList.remove('picking');
    const c = this.map.map.getCenter();
    this.syncMode();
    if (ok && c) this.setDest(c.lat, c.lng, 'Seçilen konum');
  }

  setDest(la, ln, name) {
    if (!Number.isFinite(la) || !Number.isFinite(ln)) return;
    this.nav = { dest: [la, ln], name, pending: true, last: 0 };
    this.map.drawNav(null, [la, ln]);
    const dc = this.dom['dest-clear']; if (dc) dc.style.display = '';
    if (!this.state.tracking) this.toggleTracking(true);
    if (this.state.lat != null) this.buildRoute();
    else this.setTip('', 'Konum bekleniyor, rota hazırlanacak…', INFO_SVG);
  }

  async buildRoute() {
    const n = this.nav, s = this.state;
    if (!n || s.lat == null || s.lng == null || n.busy) return;
    n.busy = true; n.last = Date.now();

    const ROUTERS = [
      'https://router.project-osrm.org/route/v1/driving',
      'https://routing.openstreetmap.de/routed-car/route/v1/driving'
    ];
    const path = `/${s.lng},${s.lat};${n.dest[1]},${n.dest[0]}?overview=full&geometries=geojson&steps=true`;

    let j = null, lastErr = null;
    for (const base of ROUTERS) {
      try {
        j = await fetchJSON(base + path, 12000);
        if (j && j.routes && j.routes[0]) break;
        j = null;
      } catch (e) { lastErr = e; j = null; }
    }

    try {
      if (this.nav !== n) return;
      const r = j && j.routes && j.routes[0];
      if (!r) throw lastErr || new Error('rota yok');

      n.rc = r.geometry.coordinates.map(c => [c[1], c[0]]);
      n.cum = new Float64Array(n.rc.length);
      for (let i = 1; i < n.rc.length; i++) {
        n.cum[i] = n.cum[i - 1] + hav(n.rc[i - 1][0], n.rc[i - 1][1], n.rc[i][0], n.rc[i][1]) * 1000;
      }
      n.total = n.cum[n.cum.length - 1] || r.distance;
      n.dur = r.duration;
      n.steps = r.legs ? r.legs.flatMap(l => l.steps || []) : [];
      let acc = 0;
      n.ends = n.steps.map(st => (acc += st.distance));
      const gap = Math.max(10, n.total / 1500);
      let li = 0; n.dec = [0];
      for (let i = 1; i < n.rc.length - 1; i++) {
        if (n.cum[i] - n.cum[li] >= gap) { n.dec.push(i); li = i; }
      }
      n.dec.push(n.rc.length - 1);
      n.ri = 0; n.si = 0; n.far = 0; n.sp = null;
      this._wrongWay = 0;
      this.drawNavNow();
      this.speak(`Rota hazır. ${(n.total / 1000).toFixed(1)} kilometre, yaklaşık ${Math.round(n.dur / 60)} dakika.`);
    } catch (e) {
      if (this.nav === n && !n.rc) {
        this.setTip('danger', 'Rota alınamadı. Bağlantıyı kontrol edin.', WARN_SVG);
      }
    } finally {
      n.pending = false;
      n.busy = false;
    }
  }

  drawNavNow() {
    const n = this.nav;
    if (!n || !n.rc) return;
    n.drawT = Date.now();
    const pts = [];
    for (const i of n.dec) if (i >= n.ri && n.rc[i]) pts.push(n.rc[i]);
    this.map.drawNav(pts, n.dest);
  }

  navUpdate(la, ln) {
    const n = this.nav;
    if (!n || !n.rc || !n.rc.length) return null;
    const rc = n.rc, N = rc.length - 1;
    if (N < 1) return null;
    const k = Math.cos(la * Math.PI / 180), m = 111320;
    const seg = i => {
      const a = rc[i], b = rc[i + 1];
      if (!a || !b) return { i, t: 0, d: Infinity, la, ln };
      const ax = (a[1] - ln) * k * m, ay = (a[0] - la) * m;
      const dx = (b[1] - a[1]) * k * m, dy = (b[0] - a[0]) * m, l2 = dx * dx + dy * dy;
      const t = l2 ? clamp(-(ax * dx + ay * dy) / l2, 0, 1) : 0, px = ax + t * dx, py = ay + t * dy;
      return { i, t, d: Math.hypot(px, py), la: la + py / m, ln: ln + px / (k * m) };
    };
    const scan = (from, to) => {
      let b = null;
      for (let i = Math.max(0, from); i < Math.min(N, to); i++) { const c = seg(i); if (!b || c.d < b.d) b = c; }
      return b;
    };
    let best = scan(n.ri - 3, n.ri + 250);
    if (!best || best.d > 60) { const g = scan(0, N); if (g && (!best || g.d < best.d)) best = g; }
    if (!best || !Number.isFinite(best.d)) return null;
    n.ri = best.i;
    const along = n.cum[best.i] + best.t * (n.cum[best.i + 1] - n.cum[best.i]);
    const rem = Math.max(0, n.total - along);
    while (n.si < n.steps.length - 1 && n.ends[n.si] <= along + 5) n.si++;
    const last = n.si + 1 >= n.steps.length;
    const nx = n.steps[last ? n.si : n.si + 1];
    if (nx) this.showNav(nx, Math.max(0, (last ? n.total : n.ends[n.si]) - along), rem);
    n.far = best.d > 45 ? n.far + 1 : 0;
    if (n.far >= 4 && Date.now() - n.last > 15000) { n.far = 0; this.speak('Rota yeniden hesaplanıyor.'); this.buildRoute(); }
    if (rem < 30) { this.speak('Hedefinize ulaştınız.'); this.clearNav(false); return null; }
    if (Date.now() - n.drawT > 4000) this.drawNavNow();
    if (best.d > 25) return null;
    const a = rc[best.i], b = rc[best.i + 1];
    if (!a || !b) return null;
    const routeHdg = bearing(a[0], a[1], b[0], b[1]);
    this.checkWrongWay(routeHdg);
    return { la: best.la, ln: best.ln, h: routeHdg };
  }

  checkWrongWay(routeHdg) {
    const s = this.state;
    if (s.hdg == null || s.spd < 20 || !Number.isFinite(routeHdg)) { this._wrongWay = 0; return; }

    let diff = Math.abs(s.hdg - routeHdg);
    if (diff > 180) diff = 360 - diff;

    if (diff > 110) this._wrongWay++;
    else this._wrongWay = Math.max(0, this._wrongWay - 1);

    if (this._wrongWay >= 6 && Date.now() - this._wrongWarned > 15000) {
      this._wrongWarned = Date.now();
      this._wrongWay = 0;
      this.setTip('danger', '⚠️ Ters yöndesiniz! Rotaya dönmek için U dönüşü yapın.', WARN_SVG);
      this.speak('Dikkat! Ters yöndesiniz. Lütfen rotaya dönün.', true);
      if (navigator.vibrate) navigator.vibrate([150, 80, 150, 80, 150]);
      setTimeout(() => {
        if (this.state.lastTK && this.state.lastTK.includes('Ters yön')) {
          this.state.lastTK = '';
          this._dirty = true;
        }
      }, 6000);
    }
  }

  showNav(st, d, rem) {
    const n = this.nav, m = st.maneuver || {}, mod = m.modifier || '';
    const dir = { left: 'sola', right: 'sağa', 'slight left': 'hafif sola', 'slight right': 'hafif sağa', 'sharp left': 'keskin sola', 'sharp right': 'keskin sağa' }[mod];
    const ar = { left: '⬅️', right: '➡️', 'slight left': '↖️', 'slight right': '↗️', 'sharp left': '↙️', 'sharp right': '↘️', uturn: '↩️', straight: '⬆️' };
    let txt;
    if (m.type === 'arrive') txt = 'Hedefe ulaşacaksınız';
    else if (m.type === 'roundabout' || m.type === 'rotary') txt = `Döner kavşaktan ${m.exit || ''}. çıkış`;
    else if (mod === 'uturn') txt = 'U dönüşü yapın';
    else if (dir && m.type !== 'merge') txt = `${dir[0].toUpperCase() + dir.slice(1)} dönün`;
    else txt = 'Düz devam edin';

    this._setTxt(this.dom['nb-arrow'], m.type === 'arrive' ? '🏁' : (ar[mod] || '⬆️'));
    this._setTxt(this.dom['nb-dist'], d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m');
    this._setTxt(this.dom['nb-txt'], txt + (st.name ? ' · ' + st.name : ''));
    const mins = Math.round(n.dur * rem / (n.total || 1) / 60);
    this._setTxt(this.dom['nb-eta'],
      `${(rem / 1000).toFixed(1)} km · ${mins} dk · ` +
      new Date(Date.now() + mins * 60000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }));
    if (this.dom['nav-banner'] && this.dom['nav-banner'].style.display !== 'flex') {
      this.dom['nav-banner'].style.display = 'flex';
    }
    if (d < 320 && n.sp !== st) {
      n.sp = st;
      this.speak(`${Math.max(50, Math.round(d / 50) * 50)} metre sonra ${txt.toLowerCase()}`, true);
    }
  }

  clearNav(say) {
    this.nav = null;
    this.map.drawNav(null, null);
    if (this.dom['nav-banner']) this.dom['nav-banner'].style.display = 'none';
    if (this.dom['dest-clear']) this.dom['dest-clear'].style.display = 'none';
    if (say) this.speak('Rota iptal edildi.', true);
  }

  deriveRoadCondition(c) {
    const t = c.temperature_2m ?? 20;
    const h = c.relative_humidity_2m ?? 50;
    const p = c.precipitation ?? 0;
    const r = c.rain ?? 0;
    const s = c.snowfall ?? 0;
    const w = c.weather_code ?? 0;
    const wind = c.wind_speed_10m ?? 0;
    const gust = c.wind_gusts_10m ?? 0;

    if (s > 0 || (w >= 71 && w <= 77) || w === 85 || w === 86) return { code: 'snow', label: 'KARLI' };
    if (t <= 3 && (p > 0 || h >= 90)) return { code: 'ice', label: 'BUZLU OLABİLİR' };
    if (w === 45 || w === 48) return { code: 'fog', label: 'SİSLİ' };
    if (r > 0.2 || p > 0.2 || (w >= 51 && w <= 67) || (w >= 80 && w <= 82)) return { code: 'wet', label: 'ISLAK' };
    if (gust > 60 || wind > 45) return { code: 'wind', label: 'RÜZGÂRLI' };
    return { code: 'dry', label: 'KURU' };
  }

  addHazardReport(type) {
    if (this.state.lat == null || this.state.lng == null) return;
    const h = { la: this.state.lat, ln: this.state.lng, type, ts: Date.now() };
    this.hazards.push(h);
    this.saveHazards();
    this.map.addHazard(h.la, h.ln, type, h.ts);
  }

  cleanupHazards() {
    try {
      const now = Date.now();
      const lb = this.hazards.length;
      this.hazards = this.hazards.filter(h => h && Number.isFinite(h.ts) && now - h.ts < HAZARD_TTL);
      if (lb !== this.hazards.length) {
        this.saveHazards();
        this._redrawAllHazards();
      }
    } catch (e) {}
  }

  saveHazards() {
    const now = Date.now();
    this.hazards = this.hazards.filter(h => h && Number.isFinite(h.ts) && now - h.ts < HAZARD_TTL);
    store.set('rp_hz', JSON.stringify(this.hazards));
  }

  restoreHazards() {
    let arr = [];
    try { arr = JSON.parse(store.get('rp_hz') || '[]'); } catch (e) {}
    const now = Date.now();
    this.hazards = (Array.isArray(arr) ? arr : []).filter(h =>
      h && Number.isFinite(h.la) && Number.isFinite(h.ln) && Number.isFinite(h.ts) && now - h.ts < HAZARD_TTL
    );
    this._redrawAllHazards();
  }

  _redrawAllHazards() {
    this.map.clearHazards();
    const s = this.state;
    const now = Date.now();
    for (const h of this.hazards) {
      if (!h || !Number.isFinite(h.la) || !Number.isFinite(h.ln) || !Number.isFinite(h.ts)) continue;
      if (now - h.ts >= HAZARD_TTL) continue;
      if (s.lat == null || s.lng == null) {
        this.map.addHazard(h.la, h.ln, h.type, h.ts);
        continue;
      }
      const d = hav(s.lat, s.lng, h.la, h.ln);
      if (d <= 5) this.map.addHazard(h.la, h.ln, h.type, h.ts);
    }
  }

  computeAhead() {
    const s = this.state;
    s.ahead = null;
    if (s.lat == null || s.lng == null || s.hdg == null || s.spd < 5) {
      document.body.classList.remove('ahead-warn');
      return;
    }

    const now = Date.now();
    const cands = s.poi.map(p => ({
      k: p.kind, id: 'p' + p.id,
      lat: p.lat, lng: p.lng,
      label: POI_LABEL[p.kind] || p.kind
    }));

    this.hazards.forEach(h => {
      if (h && Number.isFinite(h.ts) && now - h.ts < HAZARD_TTL) {
        const typeStr = h.type ? String(h.type).toLowerCase() : 'tehlike';
        cands.push({
          k: 'hz', id: 'h' + h.ts,
          lat: h.la, lng: h.ln,
          label: typeStr + ' bildirimi'
        });
      }
    });

    let best = null;
    for (const c of cands) {
      if (!c || !Number.isFinite(c.lat) || !Number.isFinite(c.lng)) continue;
      const d = hav(s.lat, s.lng, c.lat, c.lng) * 1000;
      if (d > (POI_RANGE[c.k] || 200) || d < 8) continue;
      let diff = Math.abs(bearing(s.lat, s.lng, c.lat, c.lng) - s.hdg);
      if (diff > 180) diff = 360 - diff;
      if (diff > 40) continue;
      if (!best || d < best.d) best = { k: c.k, id: c.id, d, label: c.label };
    }

    if (!best) {
      document.body.classList.remove('ahead-warn');
      return;
    }
    best.warn = best.k !== 'light';
    s.ahead = best;
    document.body.classList.toggle('ahead-warn', !!best.warn);

    if (best.warn && !this.alerted.has(best.id)) {
      if (this.alerted.size > 300) this.alerted.clear();
      this.alerted.add(best.id);
      if (navigator.vibrate) navigator.vibrate(80);

      const dist = Math.max(10, Math.round(best.d / 10) * 10);
      this.speak(`${dist} metre ileride ${best.label} var.`);
    }
  }

  _doRender() {
    try {
      const s = this.state;
      const v = Number.isFinite(s.spd) ? s.spd : 0, lim = s.lim;
      const d = this.dom;

      this._setTxt(d['spd-val'], v);

      const ARC = 356.05;
      const pct = clamp(v / 220, 0, 1);
      if (pct !== this._lastPct) {
        this._lastPct = pct;
        if (d['g-bar']) d['g-bar'].setAttribute('stroke-dashoffset', ARC * (1 - pct));
        if (d['g-needle-group']) d['g-needle-group'].style.transform = `rotate(${-120 + pct * 240}deg)`;
      }

      if (d['limit-badge'] && d['limit-num']) {
        const wantOff = !lim;
        if (this._badgeOff !== wantOff) {
          this._badgeOff = wantOff;
          if (wantOff) d['limit-badge'].classList.add('off');
          else d['limit-badge'].classList.remove('off');
        }
        this._setTxt(d['limit-num'], lim || '--');
      }

      const thr = 1 + this.cfg.threshold / 100;
      const over = !!(lim && v > lim * thr);
      const warn = !!(lim && v > lim && !over);

      if (d['ovr']) {
        const has = d['ovr'].classList.contains('on');
        if (over !== has) d['ovr'].classList.toggle('on', over);
      }

      const needle = d['g-needle'];
      const gaugeSvg = d['gauge-svg'];

      if (gaugeSvg && d['limit-badge'] && d['g-bar'] && needle) {
        if (over) {
          gaugeSvg.classList.remove('pulsing-warn');
          d['limit-badge'].classList.add('pulsing-danger');
          if (!s.wasOver) {
            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
            s.wasOver = true;
            this.speak(`Hız sınırını aştınız. Yasal limit ${this.state.lim} kilometre.`, true);
          }
          d['g-bar'].setAttribute('stroke', 'url(#grd-red)');
          needle.setAttribute('stroke', '#ef4444');
          if (d['spd-val']) d['spd-val'].style.color = 'var(--red)';
          if (this.cfg.soundOn) this.beep();
        } else if (warn) {
          gaugeSvg.classList.add('pulsing-warn');
          d['limit-badge'].classList.remove('pulsing-danger');
          s.wasOver = false;
          d['g-bar'].setAttribute('stroke', 'url(#grd-warn)');
          needle.setAttribute('stroke', '#f59e0b');
          if (d['spd-val']) d['spd-val'].style.color = 'var(--amber)';
        } else {
          gaugeSvg.classList.remove('pulsing-warn');
          d['limit-badge'].classList.remove('pulsing-danger');
          s.wasOver = false;
          d['g-bar'].setAttribute('stroke', 'url(#grd-blue)');
          needle.setAttribute('stroke', '#2d7aff');
          if (d['spd-val']) d['spd-val'].style.color = '';
        }
      }

      if (d['m-fuel']) {
        if (this.cfg.showFuel && s.avgFuel > 0) {
          const u = FUEL_UNIT[this.cfg.vehicle] || 'L';
          this._setTxt(d['m-fuel'], s.avgFuel.toFixed(1) + ' ' + u);
        } else if (this.cfg.showFuel && s.fuelTotal > 0) {
          const u = FUEL_UNIT[this.cfg.vehicle] || 'L';
          this._setTxt(d['m-fuel'], s.fuelTotal.toFixed(2) + ' ' + u);
        } else {
          this._setTxt(d['m-fuel'], '--');
        }
      }

      this._setTxt(d['ss-max'], s.maxSpd);
      this._setTxt(d['ss-avg'], s.avgSpd);
      this._setTxt(d['ss-trip'], s.dist.toFixed(1));

      if (s.start) {
        const el = Math.max(0, Math.floor(((s.end || Date.now()) - s.start) / 1000));
        const h = Math.floor(el / 3600);
        const m = Math.floor(el % 3600 / 60);
        const sec = el % 60;
        this._setTxt(d['m-dur'], h
          ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
          : String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'));
      } else {
        this._setTxt(d['m-dur'], '00:00');
      }

      this._setTxt(d['m-alt'], s.alt != null ? s.alt : '--');

      if (s.hdg != null && Number.isFinite(s.hdg)) {
        const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
        this._setTxt(d['m-dir'], dirs[Math.round(s.hdg / 45) % 8]);
      }
      this._setTxt(d['m-acc'], s.acc != null ? Math.round(s.acc) : '--');

      const lv = s.acc == null ? 0 : s.acc < 5 ? 4 : s.acc < 15 ? 3 : s.acc < 35 ? 2 : 1;
      const bars = this.dom.ftBars;
      if (bars.length) {
        for (let i = 0; i < bars.length; i++) {
          const bg = i < lv ? 'var(--green)' : 'var(--text-tertiary)';
          if (bars[i].style.background !== bg) bars[i].style.background = bg;
        }
      }

      const trf = d['m-trf'];
      if (trf) {
        this._setTxt(trf, this.state.roadCond);
        const cls = 'm-val' + (this.state.roadCondCode ? ' ' + this.state.roadCondCode : '');
        if (trf.className !== cls) trf.className = cls;
      }

      this.updateTip(over, warn, v);
    } catch (e) {
      console.error('[RotaPro] _doRender hatası:', e);
    }
  }

  updateTip(over, warn, v) {
    if (this.state.lastTK === 'hazard') return;

    const rc = this.state.roadCondCode;
    let t = '', tx = '', ic = INFO_SVG;

    if (this.state.gpsErr) {
      t = 'danger';
      tx = this.state.gpsErr;
      ic = WARN_SVG;
    } else if (over) {
      t = 'danger';
      tx = `Limit aşıldı: ${v} km/s (Yasal Sınır: ${this.state.lim} km/s). Lütfen yavaşlayın.`;
      ic = WARN_SVG;
    } else if (rc === 'ice') {
      t = 'danger';
      tx = 'Buzlanma riski! Hızınızı düşürün, ani manevralardan kaçının.';
      ic = WARN_SVG;
    } else if (rc === 'snow') {
      t = 'danger';
      tx = 'Kar yağışı algılandı. Kış lastiği ve düşük hız önerilir.';
      ic = WARN_SVG;
    } else if (warn) {
      t = 'warn';
      tx = `Hız sınırının üzerindesiniz. Limit: ${this.state.lim} km/s`;
    } else if (rc === 'fog') {
      t = 'warn';
      tx = 'Sisli hava. Görüş mesafesini koruyun, sis farlarını açın.';
      ic = WARN_SVG;
    } else if (rc === 'wet' && v > 60) {
      t = 'warn';
      tx = 'Islak zemin. Takip mesafesini artırın.';
    } else if (rc === 'wind' && v > 80) {
      t = 'warn';
      tx = 'Kuvvetli rüzgâr. Yüksek hızda dikkatli olun.';
    } else if (this.state.ahead) {
      const ah = this.state.ahead;
      t = ah.warn ? 'warn' : '';
      ic = ah.warn ? WARN_SVG : INFO_SVG;
      tx = `Önde ${ah.label}: ${Math.max(10, Math.round(ah.d / 10) * 10)} m`;
    } else if (!this.state.lim && v > 140) {
      t = 'warn';
      tx = 'Yüksek sürat! Yol ve çevre koşullarına dikkat ediniz.';
    } else if (this.state.lim && v > 0 && v <= this.state.lim * 0.85) {
      t = '';
      tx = 'Sürüş yasal sınırlar içerisinde güvenle devam ediyor.';
      ic = CHECK_SVG;
    } else if (v > 0) {
      t = '';
      tx = 'Sürüş parametreleri aktif.';
    } else if (this.state.gpsOn && this.state.lat != null) {
      t = '';
      tx = 'Konum kilitlendi, hareket verisi bekleniyor.';
    } else if (this.state.gpsOn) {
      t = '';
      tx = 'Konum aranıyor…';
    } else {
      t = '';
      tx = 'Sistem başlatılıyor…';
    }

    const k = t + tx;
    if (k === this.state.lastTK) return;
    this.state.lastTK = k;
    this.setTip(t, tx, ic);
  }

  setTip(type, txt, svg) {
    const tip = this.dom.tip;
    if (!tip) return;
    if (tip.style.display !== 'flex') tip.style.display = 'flex';
    const cls = 'panel ' + type;
    if (tip.className !== cls) tip.className = cls;
    this._setTxt(this.dom['tip-t'], txt);
    const tipIcon = this.dom['tip-icon'];
    if (tipIcon) {
      const html = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
      if (tipIcon.dataset.svg !== svg) {
        tipIcon.innerHTML = html;
        tipIcon.dataset.svg = svg;
      }
    }
  }

  unlockAudio() {
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch (e) {}
  }

  speak(text, priority = false) {
    if (!this.cfg.ttsOn || !('speechSynthesis' in window)) return;
    const now = Date.now();
    const key = String(text).slice(0, 48);
    if (this._speakLast && this._speakLast.key === key && now - this._speakLast.t < 5000) return;
    this._speakLast = { key, t: now };

    const synth = window.speechSynthesis;

    if (priority) {
      try { synth.cancel(); } catch (_) {}
      setTimeout(() => this._doSpeak(synth, text), 25);
    } else {
      this._doSpeak(synth, text);
    }
  }

  _doSpeak(synth, text) {
    try {
      const u = new SpeechSynthesisUtterance(String(text));
      u.lang = 'tr-TR';
      u.rate = 0.95;
      u.pitch = 1.0;
      u.volume = 1.0;

      if (_cachedVoices && _cachedVoices.length) {
        const tr = _cachedVoices.filter(v => v.lang && v.lang.toLowerCase().startsWith('tr'));
        if (tr.length) {
          const premium = tr.find(v => /premium|natural|enhanced|yelda|filiz|tolga|seda|emel/i.test(v.name));
          u.voice = premium || tr[0];
        }
      }
      synth.speak(u);
    } catch (e) {}
  }

  beep() {
    if (Date.now() - this.lastB < 2500) return;
    if (!this.audio || this.audio.state !== 'running') return;
    this.lastB = Date.now();
    try {
      const c = this.audio;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g);
      g.connect(c.destination);
      o.frequency.value = 800;
      o.type = 'sine';
      g.gain.setValueAtTime(0.08, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.35);
      o.start();
      o.stop(c.currentTime + 0.35);
    } catch (e) {}
  }

  startClock() {
    const tk = () => {
      const el = this.dom['ft-clock'];
      if (!el) return;
      const t = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
      if (el.textContent !== t) el.textContent = t;
    };
    tk();
    setInterval(tk, 15000);
  }

  async reqWake() {
    if (!('wakeLock' in navigator) || !this.cfg.wakeOn || this.wakeLock) return;
    try {
      const wl = await navigator.wakeLock.request('screen');
      this.wakeLock = wl;
      wl.addEventListener('release', () => {
        if (this.wakeLock === wl) this.wakeLock = null;
      });
    } catch (e) {}
  }

  relWake() {
    const wl = this.wakeLock;
    this.wakeLock = null;
    if (wl) { try { wl.release(); } catch (e) {} }
  }
}

/* ─── Bootstrap ─── */
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.RotaProApp = new AppManager();
  } catch (e) {
    console.error('[RotaPro] Başlatma hatası:', e);
  }

  if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const r of regs) r.update().catch(() => {});
    }).catch(() => {});

    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});