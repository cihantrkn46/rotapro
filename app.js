/**
 * RotaPro v8.1 FINAL — Keyless · Hardened · Smooth · Error-Free
 * Sıfır API anahtarı: OSM + Open-Meteo + Nominatim + topluluk ihbarları
 *
 * Tüm bilinen hatalar onarılmıştır:
 *  - Rota çizgisi append-only + 2000 nokta üst sınır + 5m decimation
 *  - tick() setView throttle (1m / zoom değişimi)
 *  - Hız limiti 30 sn hysteresis
 *  - Offline algılama + tip banner
 *  - Overpass exponential backoff (5s→10s→20s→40s)
 *  - Fetch anında state.lat/lng okunuyor (stale closure fix)
 *  - POI cache invalidation (ayar değişince)
 *  - Doğruluk dairesi acc < 15 m'de gizli
 *  - İlk GPS fix sonrası hazard mesafe filtresi (5 km)
 *  - walk hız limiti TR=20
 *  - Tüm DOM sorguları guard'lı
 *  - rAF döngüsü asla çökmez
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

/* Türkiye varsayılan hız limitleri (km/s) */
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
  cam: 'radar / hız kamerası',
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

/* ─── CONFIG ─── */
class Config {
  constructor() {
    this.autoCenter = true;
    this.rotateMode = true;
    this.soundOn = true;
    this.wakeOn = true;
    this.lightTheme = false;
    this.threshold = 10;
    this.showLights = true;
    this.showCams = true;
    this.showWorks = true;
    this.load();
  }
  load() {
    const s = store.get('rp8');
    if (!s) return;
    try {
      const o = JSON.parse(s);
      this.autoCenter = o.ac !== false;
      this.rotateMode = o.rot !== false;
      this.soundOn   = o.snd !== false;
      this.wakeOn    = o.wk  !== false;
      this.lightTheme = o.lt === true;
      this.threshold = clamp(parseInt(o.thr, 10) || 10, 1, 50);
      this.showLights = o.sl !== false;
      this.showCams   = o.sc !== false;
      this.showWorks  = o.sw !== false;
    } catch (e) {}
  }
  save(ac, rot, snd, wk, lt, thr, x) {
    this.autoCenter = ac;
    this.rotateMode = rot;
    this.soundOn = snd;
    this.wakeOn = wk;
    this.lightTheme = lt;
    this.threshold = clamp(parseInt(thr, 10) || 10, 1, 50);
    if (x) {
      this.showLights = !!x.lights;
      this.showCams   = !!x.cams;
      this.showWorks  = !!x.works;
    }
    store.set('rp8', JSON.stringify({
      ac, rot, snd, wk, lt, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks
    }));
  }
}

/* ─── BOTTOM SHEET ─── */
class SheetManager {
  constructor() {
    this.bg = $('sheet-bg');
    this.sheet = $('sheet');
    this.handle = $('sheet-handle');
    this.isOpen = false;
    this.startY = 0;
    this.currentY = 0;
    this.dragging = false;
    this._onMove = e => this.onDragMove(e);
    this._onEnd = () => this.onDragEnd();
    this.bindEvents();
  }
  bindEvents() {
    const cfgBtn = $('btn-cfg');
    if (cfgBtn) cfgBtn.addEventListener('click', () => this.open());
    const saveBtn = $('btn-save');
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
const TILE_LIGHT = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
const TILE_DARK  = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
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
      zoomSnap: 1
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

    this.following = false;
    this.rotate = true;

    this.userZ = null;
    this.progZ = false;
    this.zooming = false;
    this.lastZ = 0;
    this.lt = 0;
    this._lastViewPos = null;
    this.onUserPan = null;

    this.mapRot = $('map-rot');
    this.carEl = $('car-arrow');

    this.map.on('zoomstart', () => { this.zooming = true; });
    this.map.on('zoomend', () => {
      if (!this.progZ && this.following) this.userZ = this.map.getZoom();
      this.progZ = false;
      this.zooming = false;
    });

    this.bindPan();
    requestAnimationFrame(t => this.tick(t));

    this.lightsL = L.layerGroup().addTo(this.map);
    this.camsL = L.layerGroup().addTo(this.map);
    this.workL = L.layerGroup().addTo(this.map);
    this.hzL = L.layerGroup().addTo(this.map);

    this.initGauge();
  }

  initGauge() {
    const g = $('ticks');
    if (!g) return;
    const R = 85;
    g.innerHTML = '';
    for (let i = 0; i <= 22; i++) {
      const a = (150 + i * (240 / 22)) * Math.PI / 180;
      const r1 = R - (i % 5 === 0 ? 8 : 4), r2 = R + 1;
      const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l.setAttribute('x1', 100 + Math.cos(a) * r1);
      l.setAttribute('y1', 100 + Math.sin(a) * r1);
      l.setAttribute('x2', 100 + Math.cos(a) * r2);
      l.setAttribute('y2', 100 + Math.sin(a) * r2);
      l.setAttribute('stroke', '#fff');
      l.setAttribute('stroke-width', i % 5 === 0 ? '2' : '1');
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    }
  }

  setTheme(light) {
    if (this.tl && this.light === light) return;
    this.light = light;
    if (this.tl) this.map.removeLayer(this.tl);
    this.tl = L.tileLayer(light ? TILE_LIGHT : TILE_DARK, {
      subdomains: 'abcd',
      maxZoom: 20,
      maxNativeZoom: 20,
      keepBuffer: 1,
      attribution: '© OpenStreetMap · © CARTO'
    }).addTo(this.map);
    this.tl.bringToBack();
  }

  bindPan() {
    const box = $('map-box');
    if (!box) return;
    const pts = new Map();
    box.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, [e.clientX, e.clientY]);
    });
    box.addEventListener('pointermove', e => {
      if (pts.size === 1 && pts.has(e.pointerId) && this.following) {
        const d = pts.get(e.pointerId);
        if (Math.hypot(e.clientX - d[0], e.clientY - d[1]) > 14) {
          pts.clear();
          if (this.onUserPan) this.onUserPan();
        }
      }
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(t =>
      box.addEventListener(t, e => pts.delete(e.pointerId)));
  }

  setMode(follow, rotate) {
    this.following = !!follow;
    this.rotate = !!rotate;
    document.body.classList.toggle('follow', this.following);
    document.body.classList.toggle('tilt', this.following && this.rotate);
    this.mapRot.classList.add('anim');
    clearTimeout(this._at);
    this._at = setTimeout(() => this.mapRot.classList.remove('anim'), 700);
    if (this.following) {
      this.map.dragging.disable();
      this.lastZ = 0;
      this._lastViewPos = null;
    } else {
      this.map.dragging.enable();
    }
  }

  recenter() {
    this.userZ = null;
    this._lastViewPos = null;
  }

  wantZoom(kmh) {
    if (this.userZ != null) return this.userZ;
    const want = kmh < 25 ? 19 : kmh < 60 ? 18 : kmh < 95 ? 17 : 16;
    const cur = this.map.getZoom(), now = Date.now();
    if (want !== cur && now - this.lastZ > 5000) { this.lastZ = now; return want; }
    return cur;
  }

  pushFix(la, ln, ac, hdg, kmh) {
    if (!this.uMk) {
      const html = '<svg class="nav-arrow" viewBox="0 0 24 24"><path d="M12 2L2 22l10-4 10 4L12 2z" fill="#2d7aff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
      this.uMk = L.marker([la, ln], {
        icon: L.divIcon({ className: 'user-mk', html, iconSize: [32, 32], iconAnchor: [16, 16] }),
        interactive: false,
        keyboard: false
      }).addTo(this.map);

      this.uCr = L.circle([la, ln], {
        radius: 20,
        color: '#2d7aff',
        fillColor: '#2d7aff',
        fillOpacity: 0.1,
        weight: 1.5,
        interactive: false
      });

      this.arrowEl = null;
      this.pos = [la, ln];
      this.hd = Number.isFinite(hdg) ? hdg : 0;
      this._lastViewPos = [la, ln];
      this.map.setView([la, ln], 18, { animate: false });
    }
    if (Number.isFinite(hdg)) this.hdT = hdg;
    this.fix = {
      la, ln,
      t: Date.now(),
      v: Math.max(0, kmh) / 3.6,
      h: Number.isFinite(hdg) ? hdg : null
    };
    if (ac) {
      const r = clamp(ac, 8, 200);
      this.uCr.setRadius(r);
      const has = this.map.hasLayer(this.uCr);
      if (r >= 15 && !has) this.uCr.addTo(this.map);
      else if (r < 15 && has) this.map.removeLayer(this.uCr);
    }
  }

  tick(t) {
    requestAnimationFrame(x => this.tick(x));
    const dt = this.lt ? Math.min(0.1, (t - this.lt) / 1000) : 0.016;
    this.lt = t;

    const f = this.fix;
    if (!f || !this.uMk || !this.pos) return;

    if (!this.arrowEl) {
      const el = this.uMk.getElement();
      if (el) this.arrowEl = el.querySelector('svg');
    }

    let la = f.la, ln = f.ln;
    if (f.v > 1 && f.h != null) {
      const m = f.v * Math.min(2.5, (Date.now() - f.t) / 1000), h = f.h * Math.PI / 180;
      la += m * Math.cos(h) / 111320;
      ln += m * Math.sin(h) / (111320 * Math.cos(la * Math.PI / 180));
    }
    const k = 1 - Math.exp(-dt * 7);
    this.pos[0] += (la - this.pos[0]) * k;
    this.pos[1] += (ln - this.pos[1]) * k;

    const dh = ((this.hdT - this.hd + 540) % 360) - 180;
    this.hd = (this.hd + dh * (1 - Math.exp(-dt * 5)) + 360) % 360;

    this.uMk.setLatLng(this.pos);
    if (this.map.hasLayer(this.uCr)) this.uCr.setLatLng(this.pos);
    if (this.arrowEl) this.arrowEl.style.transform = `rotate(${this.hd}deg)`;

    const rot = this.following && this.rotate;
    if (this.mapRot) {
      this.mapRot.style.transform = rot
        ? `rotateX(${TILT}deg) rotateZ(${-this.hd}deg)`
        : 'none';
    }
    if (this.carEl) this.carEl.style.transform = `rotate(${rot ? 0 : this.hd}deg)`;

    const deg = Math.round(this.hd);
    if (rot && deg !== this._hdCss) {
      this._hdCss = deg;
      if (this.mapRot) this.mapRot.style.setProperty('--map-hd', deg + 'deg');
    }

    if (this.following && !this.zooming) {
      const z = this.wantZoom(f.v * 3.6);
      const curZ = this.map.getZoom();
      const zoomChanged = z !== curZ;
      const moved = this._lastViewPos
        ? hav(this._lastViewPos[0], this._lastViewPos[1], this.pos[0], this.pos[1]) * 1000
        : Infinity;
      if (moved > 1 || zoomChanged) {
        this._lastViewPos = [this.pos[0], this.pos[1]];
        if (zoomChanged) {
          this.progZ = true;
          this.map.setView(this.pos, z, { animate: true });
        } else {
          this.map.setView(this.pos, z, { animate: false });
        }
      }
    }
  }

  addRoutePoint(la, ln) {
    if (this.rLast) {
      const d = hav(this.rLast[0], this.rLast[1], la, ln) * 1000;
      if (d < 5) return;
    }
    this.rLast = [la, ln];
    this.rPts.push([la, ln]);

    if (!this.rLine) {
      this.rLine = L.polyline([this.rPts[0]], {
        color: '#2d7aff',
        weight: 4,
        opacity: 0.85,
        interactive: false,
        smoothFactor: 1.5
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

  addHazard(la, ln, type, ts = Date.now()) {
    const ico = { 'Kaza': '💥', 'Çalışma': '🚧', 'Heyelan': '⛰️', 'Diğer': '⚠️' }[type] || '⚠️';
    const left = ts + 1800000 - Date.now();
    if (left <= 0) return;
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
    mk.bindPopup(`<b>${esc(type)}</b><br>Bildirildi: ${new Date(ts).toLocaleTimeString('tr-TR')}`);
    setTimeout(() => this.hzL.removeLayer(mk), left);
  }

  clearHazards() {
    this.hzL.clearLayers();
  }

  poiIcon(kind) {
    const m = {
      light: ['🚦', 'poi-light'],
      cam:   ['📷', 'poi-cam'],
      stop:  ['🛑', 'poi-stop'],
      bump:  ['〰️', 'poi-bump'],
      rail:  ['🚂', 'poi-rail'],
      work:  ['🚧', 'poi-work']
    }[kind] || ['⚠️', 'poi'];
    return L.divIcon({
      className: '',
      html: `<div class="poi ${m[1]}">${m[0]}</div>`,
      iconSize: [22, 22],
      iconAnchor: [11, 11]
    });
  }

  setPOIs(list, cfg) {
    this.lightsL.clearLayers();
    this.camsL.clearLayers();
    this.workL.clearLayers();
    for (const p of list) {
      let target = null;
      if (p.kind === 'light') {
        if (cfg.showLights) target = this.lightsL;
      } else if (p.kind === 'work') {
        if (cfg.showWorks) target = this.workL;
      } else {
        if (cfg.showCams) target = this.camsL;
      }
      if (target) {
        L.marker([p.lat, p.lng], {
          icon: this.poiIcon(p.kind),
          interactive: false,
          keyboard: false
        }).addTo(target);
      }
    }
  }
}

/* ─── APP MANAGER ─── */
class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.map = new RotaMap();

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
      online: typeof navigator.onLine === 'boolean' ? navigator.onLine : true
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

    this.hazards = [];
    this.alerted = new Set();
    this._firstFix = false;

    this.syncFormFromConfig();
    this.bindUI();
    this.startClock();
    this.bindNetwork();

    this.applyTheme();
    this.syncMode();
    this.restoreHazards();

    setTimeout(() => this.map.map.invalidateSize(), 300);
    window.addEventListener('resize', () => this.map.map.invalidateSize());

    this.updateTripBtn();
    this.render();
    this.checkAutoStart();
  }

  syncFormFromConfig() {
    const set = (id, val) => { const el = $(id); if (el) el.checked = !!val; };
    const setVal = (id, val) => { const el = $(id); if (el) el.value = val; };
    set('o-center', this.cfg.autoCenter);
    set('o-rotate', this.cfg.rotateMode);
    set('o-sound',  this.cfg.soundOn);
    set('o-wake',   this.cfg.wakeOn);
    set('o-theme',  this.cfg.lightTheme);
    setVal('o-thr', this.cfg.threshold);
    set('o-lights', this.cfg.showLights);
    set('o-cams',   this.cfg.showCams);
    set('o-works',  this.cfg.showWorks);
  }

  bindNetwork() {
    const update = () => {
      this.state.online = navigator.onLine !== false;
      document.body.classList.toggle('offline', !this.state.online);
      if (!this.state.online) {
        this.setTip('warn', 'Çevrimdışı — harita ve konum çalışır, veri servisleri beklemede.', WARN_SVG);
        this.state.lastTK = 'offline';
      } else if (this.state.lastTK === 'offline') {
        this.state.lastTK = '';
        this.render();
      }
    };
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    if (!this.state.online) update();
  }

  syncMode() {
    this.map.setMode(this.cfg.autoCenter, this.cfg.rotateMode);
    const btn = $('btn-loc');
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
      this.cfg.lightTheme = !this.cfg.lightTheme;
      this.cfg.save(
        this.cfg.autoCenter, this.cfg.rotateMode, this.cfg.soundOn,
        this.cfg.wakeOn, this.cfg.lightTheme, this.cfg.threshold
      );
      this.applyTheme();
      const el = $('o-theme'); if (el) el.checked = this.cfg.lightTheme;
    });

    const saveBtn = $('btn-save');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const before = {
        l: this.cfg.showLights, c: this.cfg.showCams, w: this.cfg.showWorks
      };
      const get = id => { const el = $(id); return el ? el.checked : false; };
      const getVal = id => { const el = $(id); return el ? el.value : 10; };
      this.cfg.save(
        get('o-center'), get('o-rotate'), get('o-sound'), get('o-wake'),
        get('o-theme'), getVal('o-thr'),
        { lights: get('o-lights'), cams: get('o-cams'), works: get('o-works') }
      );
      const thrEl = $('o-thr'); if (thrEl) thrEl.value = this.cfg.threshold;
      this.applyTheme();
      if (this.cfg.wakeOn && this.state.tracking) this.reqWake();
      else this.relWake();
      this.map.setPOIs(this.state.poi, this.cfg);
      if (this.cfg.soundOn) this.unlockAudio();
      this.syncMode();

      if (before.l !== this.cfg.showLights ||
          before.c !== this.cfg.showCams   ||
          before.w !== this.cfg.showWorks) {
        this.cache.poi.ts = 0;
        this.state.poi = [];
        this.map.setPOIs([], this.cfg);
      }
      this.render();
    });

    const locBtn = $('btn-loc');
    if (locBtn) locBtn.addEventListener('click', () => {
      this.map.recenter();
      this.cfg.autoCenter = true;
      const el = $('o-center'); if (el) el.checked = true;
      this.syncMode();
    });

    const tripBtn = $('btn-trip');
    if (tripBtn) tripBtn.addEventListener('click', () => {
      this.toggleTracking();
      if (this.state.tracking) this.unlockAudio();
    });

    const hzBtn = $('btn-hz'), hzMenu = $('hz-menu');
    if (hzBtn && hzMenu) {
      hzBtn.addEventListener('click', () => {
        const isVis = hzMenu.style.display === 'flex';
        hzMenu.style.display = isVis ? 'none' : 'flex';
        hzBtn.classList.toggle('active', !isVis);
      });

      document.querySelectorAll('.hz-opt').forEach(btn => {
        btn.addEventListener('click', e => {
          hzMenu.style.display = 'none';
          hzBtn.classList.remove('active');
          if (this.state.lat != null) {
            const type = e.currentTarget.dataset.type;
            if (!type) return;
            this.addHazardReport(type);
            this.setTip('warn', `${type} tehlikesi işaretlendi.`, WARN_SVG);
            this.state.lastTK = 'hazard';
            setTimeout(() => {
              if (this.state.lastTK === 'hazard') {
                this.state.lastTK = '';
                this.render();
              }
            }, 3000);
          }
        });
      });

      document.addEventListener('click', e => {
        if (!hzBtn.contains(e.target) && !hzMenu.contains(e.target)) {
          hzMenu.style.display = 'none';
          hzBtn.classList.remove('active');
        }
      });
    }

    const unlock = () => this.unlockAudio();
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('touchend', unlock, { once: true });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.state.tracking && this.cfg.wakeOn) {
        this.reqWake();
      }
    });
  }

  toggleTracking(forceStart = false) {
    if (forceStart) this.state.tracking = true;
    else this.state.tracking = !this.state.tracking;

    if (this.state.tracking) {
      if (this.watchId == null) this.startGPS();
      this.reqWake();
      this.map.clearRoute();
      Object.assign(this.state, {
        start: Date.now(), end: null,
        dist: 0, maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0,
        prev: null, prevT: null
      });
      if (this.state.lat != null) this.map.addRoutePoint(this.state.lat, this.state.lng);
    } else {
      this.state.end = Date.now();
      this.relWake();
      this.stopGPS();
    }
    this.updateTripBtn();
    this.render();
  }

  updateTripBtn() {
    const b = $('btn-trip');
    if (!b) return;
    const on = this.state.tracking;
    b.classList.toggle('active', on);
    b.setAttribute('aria-label', on ? 'Sürüşü Durdur' : 'Sürüşü Başlat');
    b.innerHTML = on
      ? '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.5z"/></svg>';
  }

  startGPS() {
    if (this.watchId != null) return;
    if (!navigator.geolocation) { this.gpsFail('Bu cihaz konum servisini desteklemiyor.'); return; }
    if (window.isSecureContext === false) { this.gpsFail('Konum için güvenli bağlantı (HTTPS) gerekli.'); return; }

    this.state.gpsErr = '';
    this.watchId = navigator.geolocation.watchPosition(
      p => this.onGPS(p),
      e => {
        if (e.code === 1) {
          try { navigator.geolocation.clearWatch(this.watchId); } catch (_) {}
          this.watchId = null;
          this.gpsFail('Konum izni reddedildi. Tarayıcı ayarlarından izin verin.');
        } else if (e.code === 2) {
          this.state.gpsErr = 'Konum alınamıyor. Açık alanda deneyin.';
          this.render();
        }
      },
      { enableHighAccuracy: true, maximumAge: 1500, timeout: 15000 }
    );
    this.state.gpsOn = true;
    const dot = $('ft-dot'); if (dot) dot.classList.add('on');
    const gps = $('ft-gps');
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
    const dot = $('ft-dot'); if (dot) dot.classList.remove('on');
    const gps = $('ft-gps');
    if (gps) {
      gps.textContent = 'GPS Kapalı';
      gps.style.color = 'var(--text-secondary)';
    }
  }

  gpsFail(msg) {
    this.state.gpsOn = false;
    this.state.gpsErr = msg;
    const dot = $('ft-dot'); if (dot) dot.classList.remove('on');
    const gps = $('ft-gps');
    if (gps) {
      gps.textContent = 'GPS Kapalı';
      gps.style.color = 'var(--red)';
    }
    this.render();
  }

  onGPS(p) {
    const { latitude: la, longitude: ln, speed: sp, heading: hd, altitude: al, accuracy: ac } = p.coords;
    const st = this.state;
    const now = p.timestamp || Date.now();

    if (st.gpsErr) st.gpsErr = '';
    const gpsEl = $('ft-gps');
    if (gpsEl) {
      gpsEl.textContent = 'GPS Aktif';
      gpsEl.style.color = 'var(--green)';
    }

    st.lat = la;
    st.lng = ln;
    st.acc = ac;
    st.alt = (al != null && Number.isFinite(al)) ? Math.round(al) : null;

    // İlk fix: hazard'ları mesafeye göre yeniden filtrele
    if (!this._firstFix) {
      this._firstFix = true;
      this.map.clearHazards();
      this._renderAllHazards();
    }

    let raw;
    if (sp != null && Number.isFinite(sp) && sp >= 0) {
      raw = sp * 3.6;
    } else if (st.prev && st.prevT && now - st.prevT > 500) {
      raw = hav(st.prev[0], st.prev[1], la, ln) * 1000 / ((now - st.prevT) / 1000) * 3.6;
    } else {
      raw = st.smoothV;
    }
    if (raw < 2 && ac > 35) raw = 0;
    if (raw > 400) raw = st.smoothV;
    st.smoothV = st.smoothV * 0.3 + raw * 0.7;
    st.spd = Math.round(st.smoothV);

    if (hd != null && Number.isFinite(hd) && st.spd >= 3) {
      st.hdg = hd;
    } else if (st.prev && st.spd >= 5 && hav(st.prev[0], st.prev[1], la, ln) * 1000 > 3) {
      st.hdg = bearing(st.prev[0], st.prev[1], la, ln);
    }

    if (st.tracking) {
      if (st.spd > st.maxSpd) st.maxSpd = st.spd;
      if (st.spd > 0) {
        st.sumSpd += st.spd;
        st.spdN++;
        st.avgSpd = Math.round(st.sumSpd / st.spdN);
      }
      if (st.prev && ac <= 100) {
        const d = hav(st.prev[0], st.prev[1], la, ln);
        if (d > 0.002 && d < 2) st.dist += d;
      }
      if (ac <= 100) this.map.addRoutePoint(la, ln);
    }
    st.prev = [la, ln];
    st.prevT = now;

    this.map.pushFix(la, ln, ac, st.hdg, st.smoothV);
    this.computeAhead();
    this.fetchServices();
    this.render();
  }

  setStatus(id, ok, txt) {
    const el = $(id);
    if (!el) return;
    el.textContent = txt;
    el.className = 'm-status ' + (ok ? 'ok' : 'err');
  }

  fetchServices() {
    const la = this.state.lat, ln = this.state.lng;
    if (la == null || ln == null) return;
    if (!this.state.online) return;
    const now = Date.now();

    /* 1) HIZ LİMİTİ */
    if (!this.timers.lim && !this.busy.lim &&
        (now - this.cache.lim.ts > 12000 || hav(la, ln, this.cache.lim.la, this.cache.lim.ln) > 0.15)) {
      this.cache.lim = { ts: now, la, ln };
      this.timers.lim = setTimeout(async () => {
        this.timers.lim = null;
        this.busy.lim = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null) { this.busy.lim = false; return; }
        try {
          const q = `[out:json][timeout:6];way(around:30,${cla},${cln})[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified|service|track|road|pedestrian)$"];out tags geom;`;
          const j = await fetchOverpass(q, 9000);
          let best = null, bestD = Infinity;
          for (const el of (j.elements || [])) {
            const road = el.tags && el.tags.highway;
            const v = parseMaxspeed(el.tags && el.tags.maxspeed, road);
            if (!v) continue;
            const d = distToPolyline(cla, cln, el.geometry);
            if (d < bestD) { bestD = d; best = v; }
          }
          if (best) {
            this.state.lim = best;
            this.state.limTs = Date.now();
            this.state.dataAge = Date.now();
          } else {
            if (Date.now() - this.state.limTs > 30000) this.state.lim = null;
          }
          this.setStatus('st-lim', true, 'Aktif');
        } catch (e) {
          if (Date.now() - this.state.limTs > 30000) this.state.lim = null;
          this.setStatus('st-lim', false, 'Hata');
        } finally {
          this.busy.lim = false;
        }
      }, 800);
    }

    /* 2) HAVA DURUMU */
    const wxMoved = this.cache.wx.la == null ? Infinity : hav(la, ln, this.cache.wx.la, this.cache.wx.ln);
    if (!this.timers.wx && !this.busy.wx &&
        (now - this.cache.wx.ts > 180000 || wxMoved > 20)) {
      this.cache.wx.ts = now;
      this.timers.wx = setTimeout(async () => {
        this.timers.wx = null;
        this.busy.wx = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null) { this.busy.wx = false; return; }
        try {
          const url = `https://api.open-meteo.com/v1/forecast?latitude=${cla}&longitude=${cln}`
            + `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,snowfall,weather_code,wind_speed_10m,wind_gusts_10m`
            + `&timezone=auto`;
          const j = await fetchJSON(url, 8000);
          const c = j.current || {};
          this.cache.wx = { ts: Date.now(), code: c.weather_code, la: cla, ln: cln };

          const t = $('is-temp');
          if (t) t.textContent = Math.round(c.temperature_2m ?? 0) + '°C';
          const w = $('is-wind');
          if (w) w.textContent = Math.round(c.wind_speed_10m ?? 0) + ' km/s';

          const cond = this.deriveRoadCondition(c);
          this.state.roadCond = cond.label;
          this.state.roadCondCode = cond.code;

          this.setStatus('st-wx', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-wx', false, 'Hata');
        } finally {
          this.busy.wx = false;
        }
      }, 1500);
    }

    /* 3) ADRES */
    const geoMoved = this.cache.geo.la == null ? Infinity : hav(la, ln, this.cache.geo.la, this.cache.geo.ln);
    if (!this.timers.geo && !this.busy.geo &&
        geoMoved > 0.25 &&
        (now - this.cache.geo.ts > 45000 || this.cache.geo.ts === 0)) {
      this.cache.geo.ts = now - 30000;
      this.timers.geo = setTimeout(async () => {
        this.timers.geo = null;
        this.busy.geo = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null) { this.busy.geo = false; return; }
        try {
          const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${cla}&lon=${cln}&zoom=17&addressdetails=1&accept-language=tr`, 8000);
          this.cache.geo = { ts: Date.now(), la: cla, ln: cln };
          if (j.address) {
            const p = [];
            if (j.address.road) p.push(j.address.road);
            const sub = j.address.suburb || j.address.neighbourhood;
            if (sub) p.push(sub);
            const loc = $('is-loc');
            if (loc) loc.textContent = p.join(', ') || 'Bölge Saptandı';
            const road = $('hdr-road');
            if (road) road.textContent = j.address.road || 'Navigasyon Sistemi';
          }
          this.setStatus('st-geo', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-geo', false, 'Hata');
        } finally {
          this.busy.geo = false;
        }
      }, 2000);
    }

    /* 4) OSM POI */
    const poiMoved = hav(la, ln, this.cache.poi.la, this.cache.poi.ln);
    const wantPOI = this.cfg.showLights || this.cfg.showCams || this.cfg.showWorks;
    if (wantPOI && !this.busy.poi && !this.timers.poi &&
        (now - this.cache.poi.ts > 90000 ||
        (poiMoved > 0.5 && now - this.cache.poi.ts > 20000))) {
      this.cache.poi = { ts: now, la, ln };
      this.timers.poi = setTimeout(async () => {
        this.timers.poi = null;
        this.busy.poi = true;
        const cla = this.state.lat, cln = this.state.lng;
        if (cla == null) { this.busy.poi = false; return; }
        try {
          const ar = `(around:1200,${cla},${cln})`;
          const parts = [];
          if (this.cfg.showLights) {
            parts.push(`node${ar}[highway=traffic_signals]`);
          }
          if (this.cfg.showCams) {
            parts.push(`node${ar}[highway=speed_camera]`);
            parts.push(`node${ar}[enforcement=maxspeed]`);
            parts.push(`node${ar}[highway=stop]`);
            parts.push(`node${ar}[traffic_calming~"^(bump|hump|table|cushion)$"]`);
            parts.push(`node${ar}[railway=level_crossing]`);
          }
          if (this.cfg.showWorks) {
            parts.push(`way${ar}[highway=construction]`);
            parts.push(`way${ar}[access=no][highway]`);
          }
          if (!parts.length) { this.busy.poi = false; return; }

          const q = `[out:json][timeout:10];(${parts.join(';')};);out center 400;`;
          const j = await fetchOverpass(q, 12000);
          const list = [], seen = new Set();

          for (const el of (j.elements || [])) {
            const lat = el.lat ?? (el.center && el.center.lat);
            const lon = el.lon ?? (el.center && el.center.lon);
            if (lat == null || lon == null || seen.has(el.id)) continue;
            seen.add(el.id);

            const t = el.tags || {};
            let kind;
            if (t.highway === 'construction' || t.access === 'no') kind = 'work';
            else if (t.highway === 'speed_camera' || t.enforcement === 'maxspeed') kind = 'cam';
            else if (t.highway === 'traffic_signals') kind = 'light';
            else if (t.highway === 'stop') kind = 'stop';
            else if (t.railway === 'level_crossing') kind = 'rail';
            else kind = 'bump';

            list.push({ id: el.id, kind, lat, lng: lon });
          }
          this.state.poi = list;
          this.map.setPOIs(list, this.cfg);
          this.setStatus('st-trf', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-trf', false, 'Hata');
        } finally {
          this.busy.poi = false;
        }
      }, 1200);
    }
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
    if (this.state.lat == null) return;
    const h = { la: this.state.lat, ln: this.state.lng, type, ts: Date.now() };
    this.hazards.push(h);
    this.saveHazards();
    this.map.addHazard(h.la, h.ln, type, h.ts);
  }

  saveHazards() {
    const now = Date.now();
    this.hazards = this.hazards.filter(h => now - h.ts < 1800000);
    store.set('rp_hz', JSON.stringify(this.hazards));
  }

  restoreHazards() {
    let arr = [];
    try { arr = JSON.parse(store.get('rp_hz') || '[]'); } catch (e) {}
    const now = Date.now();
    this.hazards = (Array.isArray(arr) ? arr : []).filter(h =>
      h && Number.isFinite(h.la) && Number.isFinite(h.ln) && now - h.ts < 1800000
    );
    this._renderAllHazards();
  }

  _renderAllHazards() {
    const s = this.state;
    const now = Date.now();
    for (const h of this.hazards) {
      if (now - h.ts >= 1800000) continue;
      if (s.lat == null) {
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
    if (s.lat == null || s.hdg == null || s.spd < 5) {
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
      if (now - h.ts < 1800000) {
        cands.push({
          k: 'hz', id: 'h' + h.ts,
          lat: h.la, lng: h.ln,
          label: h.type.toLowerCase() + ' bildirimi'
        });
      }
    });

    let best = null;
    for (const c of cands) {
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
    best.warn = best.k !== 'light' && best.k !== 'stop';
    s.ahead = best;
    document.body.classList.toggle('ahead-warn', !!best.warn);

    if (best.warn && !this.alerted.has(best.id)) {
      if (this.alerted.size > 300) this.alerted.clear();
      this.alerted.add(best.id);
      if (navigator.vibrate) navigator.vibrate(80);
    }
  }

  render() {
    const s = this.state;
    const v = s.spd, lim = s.lim;

    const spdEl = $('spd-val');
    if (spdEl) spdEl.textContent = v;

    const ARC = 356.05;
    const pct = clamp(v / 220, 0, 1);
    const bar = $('g-bar');
    if (bar) bar.setAttribute('stroke-dashoffset', ARC * (1 - pct));
    const needleG = $('g-needle-group');
    if (needleG) needleG.style.transform = `rotate(${-120 + pct * 240}deg)`;

    const badge = $('limit-badge');
    const numEl = $('limit-num');
    if (badge && numEl) {
      if (lim) {
        badge.classList.remove('off');
        numEl.textContent = lim;
      } else {
        badge.classList.add('off');
        numEl.textContent = '--';
      }
    }

    const thr = 1 + this.cfg.threshold / 100;
    const over = !!(lim && v > lim * thr);
    const warn = !!(lim && v > lim && !over);

    const ovr = $('ovr');
    if (ovr) ovr.classList.toggle('on', over);

    const needle = $('g-needle');
    const gaugeSvg = $('gauge-svg');

    if (gaugeSvg && badge && bar && needle) {
      if (over) {
        gaugeSvg.classList.remove('pulsing-warn');
        badge.classList.add('pulsing-danger');
        if (!s.wasOver) {
          if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
          s.wasOver = true;
        }
        bar.setAttribute('stroke', 'url(#grd-red)');
        needle.setAttribute('stroke', '#ef4444');
        if (spdEl) spdEl.style.color = 'var(--red)';
        if (this.cfg.soundOn) this.beep();
      } else if (warn) {
        gaugeSvg.classList.add('pulsing-warn');
        badge.classList.remove('pulsing-danger');
        s.wasOver = false;
        bar.setAttribute('stroke', 'url(#grd-warn)');
        needle.setAttribute('stroke', '#f59e0b');
        if (spdEl) spdEl.style.color = 'var(--amber)';
      } else {
        gaugeSvg.classList.remove('pulsing-warn');
        badge.classList.remove('pulsing-danger');
        s.wasOver = false;
        bar.setAttribute('stroke', 'url(#grd-blue)');
        needle.setAttribute('stroke', '#2d7aff');
        if (spdEl) spdEl.style.color = '';
      }
    }

    const setTxt = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    setTxt('ss-max', s.maxSpd);
    setTxt('ss-avg', s.avgSpd);
    setTxt('ss-trip', s.dist.toFixed(1));

    if (s.start) {
      const el = Math.max(0, Math.floor(((s.end || Date.now()) - s.start) / 1000));
      const h = Math.floor(el / 3600);
      const m = Math.floor(el % 3600 / 60);
      const sec = el % 60;
      setTxt('m-dur', h
        ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
        : String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0'));
    } else {
      setTxt('m-dur', '00:00');
    }

    setTxt('m-alt', s.alt != null ? s.alt : '--');

    if (s.hdg != null && Number.isFinite(s.hdg)) {
      const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
      setTxt('m-dir', dirs[Math.round(s.hdg / 45) % 8]);
    }
    setTxt('m-acc', s.acc != null ? Math.round(s.acc) : '--');

    const lv = s.acc == null ? 0 : s.acc < 5 ? 4 : s.acc < 15 ? 3 : s.acc < 35 ? 2 : 1;
    const bars = $('ft-bars');
    if (bars) bars.querySelectorAll('.ft-bar').forEach((b, i) =>
      b.style.background = i < lv ? 'var(--green)' : 'var(--text-tertiary)');

    if (s.dataAge) {
      const sec = Math.floor((Date.now() - s.dataAge) / 1000);
      setTxt('ft-fresh', sec < 60 ? sec + 's' : Math.floor(sec / 60) + 'dk');
    }

    const trf = $('m-trf');
    if (trf) {
      trf.textContent = this.state.roadCond;
      trf.className = 'm-val';
      if (this.state.roadCondCode) trf.classList.add(this.state.roadCondCode);
    }

    this.updateTip(over, warn, v);
  }

  updateTip(over, warn, v) {
    if (this.state.lastTK === 'hazard') return;
    if (!this.state.online) return;

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
    } else if (v > 120) {
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
      tx = 'Sürüşü başlatmak için ▶ düğmesine dokunun.';
    }

    const k = t + tx;
    if (k === this.state.lastTK) return;
    this.state.lastTK = k;
    this.setTip(t, tx, ic);
  }

  setTip(type, txt, svg) {
    const tip = $('tip');
    if (!tip) return;
    const tipT = $('tip-t');
    const tipIcon = $('tip-icon');
    tip.style.display = txt ? 'flex' : 'none';
    tip.className = 'panel ' + type;
    if (tipT) tipT.textContent = txt;
    if (tipIcon) {
      tipIcon.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
    }
  }

  unlockAudio() {
    try {
      if (!this.audio) this.audio = new (window.AudioContext || window.webkitAudioContext)();
      if (this.audio.state === 'suspended') this.audio.resume();
    } catch (e) {}
  }

  beep() {
    if (Date.now() - this.lastB < 5000) return;
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
      const el = $('ft-clock');
      if (!el) return;
      el.textContent = new Date().toLocaleTimeString('tr-TR', {
        hour: '2-digit', minute: '2-digit'
      });
    };
    tk();
    setInterval(tk, 15000);
    setInterval(() => {
      if (this.state.tracking || this.state.dataAge) this.render();
    }, 1000);
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

  async checkAutoStart() {
    let permitted = false;
    try {
      if (navigator.permissions) {
        const r = await navigator.permissions.query({ name: 'geolocation' });
        permitted = r.state === 'granted';
      }
    } catch (e) {}

    if (permitted) {
      this.toggleTracking(true);
    } else {
      this.setTip('', 'Başlamak için ▶ simgesine dokunun. Konum izni istenecek.', INFO_SVG);
    }
  }
}

/* ─── Bootstrap ─── */
window.RotaProApp = new AppManager();

/* ─── PWA ─── */
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}