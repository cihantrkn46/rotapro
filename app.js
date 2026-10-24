/**
 * RotaPro — Complete Mobile Navigation App (Car Integrated Edition)
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
    this.carName = 'Aracım';
    this.load();
  }
  load() {
    const s = store.get('rp_cfg_v9');
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
    }
    store.set('rp_cfg_v9', JSON.stringify({
      as: this.autoStart, ac: this.autoCenter, rot: this.rotateMode,
      snd: this.soundOn, tts: this.ttsOn, wk: this.wakeOn,
      lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel, cn: this.carName
    }));
  }
}

/* ═══════ SheetManager ═══════ */
class SheetManager {
  constructor(bg = 'sheet-bg', sh = 'sheet', hd = 'sheet-handle', op = 'btn-cfg', cl = 'btn-save') {
    this.ids = { op, cl, bg, sh };
    this.bg = $(bg); this.sheet = $(sh); this.handle = $(hd);
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

/* ═══════ Geofence & GPS Filter ═══════ */
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
    if (this.v < 0 || t - this.t > 20000 || hav(this.la, this.ln, la, ln) > 400 || (this.acc0 > 80 && acc < 30 && hav(this.la, this.ln, la, ln) > 40)) {
      this.acc0 = acc; this.rej = 0;
      this.la = la; this.ln = ln; this.v = acc * acc; this.t = t; return [la, ln];
    }
    const dt = Math.max(0, (t - this.t) / 1000);
    const gap = hav(this.la, this.ln, la, ln);
    if (gap > spd * dt * 1.5 + 3 * acc + 12 && (this.rej || 0) < 2) { this.rej = (this.rej || 0) + 1; this.t = t; return [this.la, this.ln]; }
    this.rej = 0; this.acc0 = acc;
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
        subdomains: 'abc', maxZoom: 19, minZoom: 3, crossOrigin: true, attribution: ''
      }).addTo(this.map);

      this.map.on('zoomstart', () => { if (!this._autoFlag) this._userZoomAt = Date.now(); });
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
      this.trail = []; this.trailL = L.polyline([], { color: '#4285F4', weight: 5, opacity: 0.35, lineCap: 'round', interactive: false }).addTo(this.map);

      setTimeout(() => { try { this.map.invalidateSize(); } catch (_) {} }, 250);
      window.addEventListener('resize', () => { try { this.map.invalidateSize(); } catch (_) {} });
    } catch (e) {
      console.error(e);
    }
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
            '<svg class="me-arrow" viewBox="0 0 26 44"><rect x="3" y="2" width="20" height="40" rx="8" fill="#4285F4" stroke="#fff" stroke-width="2"/><path d="M6.5 14Q13 9.5 19.5 14L18.5 20H7.5Z" fill="#d6e6ff"/><rect x="7.5" y="29" width="11" height="6" rx="2" fill="#2b5fc2"/><circle cx="7.5" cy="5.5" r="1.7" fill="#fff59d"/><circle cx="18.5" cy="5.5" r="1.7" fill="#fff59d"/></svg></div>' +
            '<div class="me-dot"></div></div>'
    });
    this.meMarker = L.marker([39.92, 32.85], { icon, interactive: false, keyboard: false, zIndexOffset: 1000 });
    this.accCircle = L.circle([39.92, 32.85], {
      radius: 0, stroke: false, fillColor: '#4285F4', fillOpacity: 0.15, interactive: false
    });
    this.btnRecenter = $('btn-recenter');
    if (this.btnRecenter) this.btnRecenter.addEventListener('click', () => this.follow());
    this.map.on('dragstart', () => this.unfollow());
    this._syncRecenter();
  }

  follow() {
    this.following = true;
    if (this.disp) this.map.setView(this.disp, Math.max(this.map.getZoom(), 17), { animate: true });
    this._syncRecenter();
  }
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

  _autoZoom(kmh) {
    if (!this.following || !this.moving || document.body.classList.contains('picking')) return;
    const now = Date.now();
    if (now - (this._userZoomAt || 0) < 25000 || now - (this._autoZAt || 0) < 8000) return;
    const z = this.map.getZoom();
    let t = z;
    if (z === 18 && kmh > 50) t = 17;
    else if (z === 17 && kmh > 90) t = 16;
    else if (z === 17 && kmh < 35) t = 18;
    else if (z === 16 && kmh < 80) t = 17;
    if (t !== z) {
      this._autoZAt = now; this._autoFlag = true;
      try { this.map.setZoom(t); } finally { this._autoFlag = false; }
    }
  }

  pushFix(la, ln, ac, hdg, kmh) {
    if (this.init && Number.isFinite(ac) && ac > 300) return;
    this.pos = [la, ln];
    this._fixT = Date.now();
    this._spd = Math.max(0, kmh) / 3.6;
    if (this.init && this.disp && !this.moving && hav(this.disp[0], this.disp[1], la, ln) > Math.max(60, (Number.isFinite(ac) ? ac : 30) * 2)) {
      this.disp = [la, ln]; this.meMarker.setLatLng(this.disp);
    }
    if (!this.init) {
      this.init = true;
      this.disp = [la, ln];
      this._renderMapAngle = 0; this._hasHd = false; this._renderOff = 0;
      try { this.map.invalidateSize(false); } catch (_) {}
      this.meMarker.setLatLng(this.disp).addTo(this.map);
      this.accCircle.setLatLng(this.disp).addTo(this.map);
      this.map.setView(this.disp, 18, { animate: false });
      this.meEl = $('me');
      setTimeout(() => { try { this.map.invalidateSize(); } catch (_) {} }, 300);
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
    if (candidate !== null && !this._hasHd && kmh < 6) candidate = null;
    if (candidate !== null) this._blendHeading(candidate, kmh > 25 ? 0.5 : kmh > 8 ? 0.35 : 0.2);

    if (this.moving) {
      const lt = this.trail[this.trail.length - 1];
      if (!lt || hav(lt[0], lt[1], la, ln) > 8) { this.trail.push([la, ln]); if (this.trail.length > 80) this.trail.shift(); this.trailL.setLatLngs(this.trail); }
    }
    this._autoZoom(kmh);
    this._syncRecenter();
  }

  frame() {
    const now = Date.now();
    const fdt = Math.min(0.1, Math.max(0.001, (now - (this._lastFrame || now)) / 1000)); this._lastFrame = now;
    if (this.disp && this.pos) {
      let tgt = this.pos;
      if (this._fixT && this._spd > 2 && this._hasHd && this.moving) {
        const dm = this._spd * Math.min((now - this._fixT) / 1000, 1.2), h = this._targetHd * _rad;
        tgt = [this.pos[0] + dm * Math.cos(h) / 111320,
               this.pos[1] + dm * Math.sin(h) / (111320 * Math.cos(this.pos[0] * _rad))];
      }
      const dla = tgt[0] - this.disp[0], dln = tgt[1] - this.disp[1];
      if (Math.abs(dla) > 1e-8 || Math.abs(dln) > 1e-8) {
        const k = 1 - Math.exp(-fdt / 0.14);
        this.disp = [this.disp[0] + dla * k, this.disp[1] + dln * k];
        this.meMarker.setLatLng(this.disp);
        if (this.following) {
          const p = this.map.latLngToContainerPoint(this.disp), sz = this.map.getSize();
          if (Math.hypot(p.x - sz.x / 2, p.y - sz.y / 2) >= 0.6) this.map.setView(this.disp, this.map.getZoom(), { animate: false });
        }
      }
    }

    const shouldRotate = this.cfg.rotateMode && this.following && this._hasHd;
    const mapRotEl = this.mapRot || $('map-rot');
    const meRotEl = $('me-rot');
    const compassNeedle = $('compass-needle');

    const lost = !!this._fixT && now - this._fixT > 6000;
    if (this.meEl) this.meEl.classList.toggle('lost', lost);
    const wantOff = shouldRotate ? Math.round(window.innerHeight * (0.18 + Math.min(0.1, (this._spd || 0) / 300))) : 0;
    this._renderOff = (this._renderOff || 0) + (wantOff - (this._renderOff || 0)) * (1 - Math.exp(-fdt / 0.45));
    const off = this._renderOff.toFixed(1);

    if (shouldRotate) {
      const targetMap = -this._targetHd;
      const diffMap = ((targetMap - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * (1 - Math.exp(-fdt / 0.12));

      if (mapRotEl) mapRotEl.style.transform = `translate3d(0, ${off}px, 0) rotate(${this._renderMapAngle.toFixed(2)}deg)`;
      if (meRotEl) {
        const cnt = -this._renderMapAngle;
        meRotEl.style.transform = `rotate(${cnt.toFixed(2)}deg)`;
        this._renderMarkerAngle = ((cnt % 360) + 360) % 360;
      }
    } else {
      const diffMap = ((0 - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.15;

      if (mapRotEl) mapRotEl.style.transform = `translate3d(0, ${off}px, 0) rotate(${this._renderMapAngle.toFixed(2)}deg)`;
      if (meRotEl && this._hasHd) {
        const diffMarker = ((this._targetHd - this._renderMarkerAngle + 540) % 360) - 180;
        this._renderMarkerAngle += diffMarker * 0.12;
        meRotEl.style.transform = `rotate(${this._renderMarkerAngle.toFixed(2)}deg)`;
      }
    }

    if (compassNeedle) {
      compassNeedle.style.transform = `rotate(${(-this._renderMapAngle).toFixed(2)}deg)`;
    }
  }

  setDestinationPin(la, ln, title = 'Seçilen Hedef') {
    this.destMarkerL.clearLayers();
    const pop = document.createElement('div'); pop.textContent = title;
    const icon = L.divIcon({ className: 'dest-wrap', iconSize: [34, 44], iconAnchor: [17, 42], popupAnchor: [0, -38],
      html: '<div class="dest-pin"><svg viewBox="0 0 24 32"><path d="M12 1C6 1 1.5 5.5 1.5 11.4 1.5 19 12 31 12 31s10.5-12 10.5-19.6C22.5 5.5 18 1 12 1z" fill="#e11d48" stroke="#fff" stroke-width="2"/><circle cx="12" cy="11.5" r="4" fill="#fff"/></svg></div>' });
    L.marker([la, ln], { icon, keyboard: false }).addTo(this.destMarkerL).bindPopup(pop).openPopup();
  }

  setPOIs(list, cfg) {
    try {
      this.lightsL.clearLayers();
      this.camsL.clearLayers();
      this.workL.clearLayers();
      for (const p of list) {
        let target = null;
        if (p.kind === 'light' && cfg.showLights) target = this.lightsL;
        else if (['work', 'pothole', 'accident', 'closed', 'oneway'].includes(p.kind) && cfg.showWorks) target = this.workL;
        else if (p.kind === 'cam' && cfg.showCams) target = this.camsL;
        if (!target) continue;

        let col = '#dc3545';
        if (p.kind === 'work') col = '#f59e0b';
        if (p.kind === 'pothole') col = '#f97316';
        if (p.kind === 'accident') col = '#8b5cf6';
        if (p.kind === 'closed') col = '#ef4444';
        if (p.kind === 'oneway') col = '#3b82f6';

        L.circleMarker([p.lat, p.lng], {
          radius: 7, color: '#ffffff', weight: 1.5,
          fillColor: col, fillOpacity: 0.95
        }).addTo(target);
      }
    } catch (_) {}
  }
}

/* ═══════ Bluetooth GPS (Web Bluetooth: Android Chrome/Edge, iOS: Bluefy/WebBLE) ═══════ */
const BLE_LN = 0x1819, BLE_LN_CH = 0x2a67;
const BLE_UARTS = [
  ['6e400001-b5a3-f393-e0a9-e50e24dcca9e', '6e400003-b5a3-f393-e0a9-e50e24dcca9e'],
  [0xffe0, 0xffe1],
  [0xfff0, 0xfff1],
  ['49535343-fe7d-4ae5-8fa9-9fafd205e455', '49535343-1e4d-4bd9-ba61-5c2f2c0a8d4a']
];
const _sleep = ms => new Promise(r => setTimeout(r, ms));
class BleGPS {
  static get supported() { return !!(navigator.bluetooth && window.isSecureContext); }
  static get isIOS() { return /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); }
  constructor(onFix, onState) {
    this.onFix = onFix; this.onState = onState;
    this.dev = null; this.name = ''; this.connected = false; this._manual = true;
    this._buf = ''; this._hdop = NaN; this._alt = null; this._busy = false;
    this._chars = []; this._dec = new TextDecoder(); this._rmcT = 0; this._fixT = 0;
    this._dl = () => this._lost();
    this._wd = null;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.dev && !this._manual && !this.connected && !this._busy) this._lost();
    });
  }
  async connect() {
    this._manual = false;
    const dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [BLE_LN, ...BLE_UARTS.map(u => u[0])]
    });
    this._cleanup();
    if (this.dev && this.dev !== dev) this.dev.removeEventListener('gattserverdisconnected', this._dl);
    this.dev = dev; this.name = dev.name || 'Cihaz';
    dev.addEventListener('gattserverdisconnected', this._dl);
    this.onState('connecting');
    try { await this._open(); } catch (e) { this._manual = true; throw e; }
  }
  _cleanup() {
    for (const [c, h] of this._chars) { try { c.removeEventListener('characteristicvaluechanged', h); } catch (_) {} }
    this._chars = [];
  }
  async _listen(c, fn) {
    const h = e => { try { fn(e.target.value); } catch (_) {} };
    c.addEventListener('characteristicvaluechanged', h);
    this._chars.push([c, h]);
    await c.startNotifications();
  }
  async _open() {
    this._cleanup();
    const srv = await Promise.race([
      this.dev.gatt.connect(),
      _sleep(15000).then(() => { throw new Error('TIMEOUT'); })
    ]);
    await _sleep(350); // Android GATT kararlılığı
    let ok = false;
    try {
      const c = await (await srv.getPrimaryService(BLE_LN)).getCharacteristic(BLE_LN_CH);
      await this._listen(c, v => this._ln(v)); ok = true;
    } catch (_) { this._cleanup(); }
    if (!ok) for (const [sv, ch] of BLE_UARTS) {
      try {
        const c = await (await srv.getPrimaryService(sv)).getCharacteristic(ch);
        await this._listen(c, v => this._nmea(v)); ok = true; break;
      } catch (_) { this._cleanup(); }
    }
    if (!ok) { this._manual = true; try { this.dev.gatt.disconnect(); } catch (_) {} throw new Error('NO_GPS_SERVICE'); }
    this._buf = ''; this.connected = true; this._fixT = 0;
    this.onState('on');
    clearInterval(this._wd);
    this._wd = setInterval(() => {
      if (!this.connected) return;
      this.onState(Date.now() - this._fixT > 12000 ? 'nofix' : 'on');
    }, 4000);
  }
  disconnect() {
    this._manual = true; this.connected = false; clearInterval(this._wd);
    this._cleanup();
    try { if (this.dev && this.dev.gatt.connected) this.dev.gatt.disconnect(); } catch (_) {}
    this.onState('off');
  }
  async _lost() {
    this.connected = false; clearInterval(this._wd);
    if (this._manual || this._busy || !this.dev) return;
    this._busy = true; this.onState('lost');
    for (let i = 1; i <= 8 && !this._manual; i++) {
      await _sleep(Math.min(1500 * i, 10000));
      if (this._manual) break;
      try { await this._open(); this._busy = false; return; } catch (_) {}
    }
    this._busy = false;
    if (!this._manual) { this._manual = true; this.onState('off'); }
  }
  _emit(la, ln, spd, hd, acc, alt) {
    if (!Number.isFinite(la) || !Number.isFinite(ln) || Math.abs(la) > 90 || Math.abs(ln) > 180 || (la === 0 && ln === 0)) return;
    this._fixT = Date.now();
    const moving = Number.isFinite(spd) && spd > 0.8;
    this.onFix({
      coords: {
        latitude: la, longitude: ln, accuracy: acc,
        speed: Number.isFinite(spd) ? spd : null,
        heading: moving && Number.isFinite(hd) ? ((hd % 360) + 360) % 360 : null,
        altitude: Number.isFinite(alt) ? alt : null
      },
      timestamp: Date.now()
    });
  }
  _ln(dv) {
    if (dv.byteLength < 2) return;
    const fl = dv.getUint16(0, true); let o = 2, spd = null, la, ln, hd = null;
    try {
      if (fl & 1) { spd = dv.getUint16(o, true) * 0.01; o += 2; }
      if (fl & 2) o += 3;
      if (fl & 4) { la = dv.getInt32(o, true) * 1e-7; ln = dv.getInt32(o + 4, true) * 1e-7; o += 8; }
      if (fl & 8) o += 3;
      if (fl & 16) { hd = dv.getUint16(o, true) * 0.01; o += 2; }
    } catch (_) { return; }
    if (la === undefined) return;
    this._emit(la, ln, spd, hd, 8, null);
  }
  _nmea(dv) {
    this._buf += this._dec.decode(new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength), { stream: true });
    let i;
    while ((i = this._buf.search(/[\r\n]/)) >= 0) {
      const line = this._buf.slice(0, i).trim(); this._buf = this._buf.slice(i + 1);
      if (line) this._line(line);
    }
    if (this._buf.length > 600) this._buf = '';
  }
  _deg(v, h) {
    const n = parseFloat(v); if (!Number.isFinite(n)) return NaN;
    const d = Math.floor(n / 100), r = d + (n - d * 100) / 60;
    return (h === 'S' || h === 'W') ? -r : r;
  }
  _line(l) {
    const p = l.indexOf('$'); if (p < 0) return; l = l.slice(p);
    const st = l.lastIndexOf('*');
    const body = l.slice(1, st < 0 ? undefined : st);
    if (st >= 0) {
      let x = 0; for (let k = 0; k < body.length; k++) x ^= body.charCodeAt(k);
      if (x !== parseInt(l.slice(st + 1, st + 3), 16)) return;
    }
    const f = body.split(','), t = f[0].slice(-3);
    if (t === 'GGA') {
      const h = parseFloat(f[8]); if (Number.isFinite(h)) this._hdop = h;
      const a = parseFloat(f[9]); this._alt = Number.isFinite(a) ? a : null;
      if (Date.now() - this._rmcT > 3000 && parseInt(f[6], 10) > 0) {
        const acc = Number.isFinite(this._hdop) ? Math.min(50, Math.max(3, this._hdop * 4)) : 8;
        this._emit(this._deg(f[2], f[3]), this._deg(f[4], f[5]), null, null, acc, this._alt);
      }
    } else if (t === 'RMC') {
      if (f[2] !== 'A') return;
      this._rmcT = Date.now();
      const acc = Number.isFinite(this._hdop) ? Math.min(50, Math.max(3, this._hdop * 4)) : 8;
      this._emit(this._deg(f[3], f[4]), this._deg(f[5], f[6]), parseFloat(f[7]) * 0.514444, parseFloat(f[8]), acc, this._alt);
    }
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
      spdVal: $('spd-val'),
      spdBar: $('spd-bar'),
      speedDash: $('speed-dash'),
      limBadge: $('limit-badge'),
      limNum: $('limit-num'),
      ftDot: $('ft-dot'),
      ftGps: $('ft-gps'),
      ftClock: $('ft-clock'),
      isLoc: $('is-loc'),
      isTemp: $('is-temp'),
      isWind: $('is-wind'),
      hdrRoad: $('hdr-road'),
      dur: $('m-dur')
    };

    const loadedHazards = (() => { const h = store.json('rp_hazards', []); return Array.isArray(h) ? h : []; })();
    this.state = {
      lat: null, lng: null, spd: 0, startTime: Date.now(),
      maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0, dist: 0,
      poi: loadedHazards
    };

    this.map.setTheme(this.cfg.lightTheme);
    this.fx = new Features(this);
    this.bindUI();
    this.startClock();
    this.startSplash();
    this.startGPS();
    this.startLoop();
    this.enableWakeLock();

    setTimeout(() => { this.fx.refreshPOIs(); }, 600);
  }

  async enableWakeLock() {
    try {
      if ('wakeLock' in navigator && this.cfg.wakeOn) {
        if (this._wl && !this._wl.released) return;
        this._wl = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }

  updateRotateUI() {
    const isRot = !!this.cfg.rotateMode;
    const title = $('mode-rot-title');
    const sub = $('mode-rot-sub');
    const icon = $('mode-rot-icon');
    const compassBtn = $('btn-compass');
    if (title) title.textContent = isRot ? 'Yöne Göre Döndür' : 'Kuzey Yukarı';
    if (sub) sub.textContent = isRot ? 'Aktif (Sürüş Yönü)' : 'Sabit (Harita Düz)';
    if (icon) {
      icon.style.background = isRot ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.06)';
      icon.style.color = isRot ? 'var(--green)' : 'var(--text-secondary)';
    }
    if (compassBtn) compassBtn.classList.toggle('active', isRot);
  }

  bindUI() {
    const save = () => {
      this.cfg.save(
        $('cfg-ac')?.checked, $('cfg-rot')?.checked, $('cfg-snd')?.checked,
        $('cfg-tts')?.checked, $('cfg-wk')?.checked, $('cfg-lt')?.checked,
        $('cfg-thr')?.value, {
          autoStart: $('cfg-as')?.checked,
          lights: $('cfg-lights')?.checked,
          cams: $('cfg-cams')?.checked,
          works: $('cfg-works')?.checked,
          vehicle: $('cfg-vehicle')?.value,
          fuelPrice: $('cfg-fuel-price')?.value,
          showFuel: $('cfg-show-fuel')?.checked,
          carName: $('cfg-car-name')?.value
        }
      );
      this.map.setTheme(this.cfg.lightTheme);
      this.updateRotateUI();
      this.fx.refreshPOIs();
      this.fx.updateFuel();
      this.fx.updateCarIntegration();
    };

    if ($('cfg-as')) $('cfg-as').checked = this.cfg.autoStart;
    if ($('cfg-ac')) $('cfg-ac').checked = this.cfg.autoCenter;
    if ($('cfg-rot')) $('cfg-rot').checked = this.cfg.rotateMode;
    if ($('cfg-snd')) $('cfg-snd').checked = this.cfg.soundOn;
    if ($('cfg-tts')) $('cfg-tts').checked = this.cfg.ttsOn;
    if ($('cfg-wk')) $('cfg-wk').checked = this.cfg.wakeOn;
    if ($('cfg-lt')) $('cfg-lt').checked = this.cfg.lightTheme;
    if ($('cfg-thr')) $('cfg-thr').value = this.cfg.threshold;
    if ($('cfg-lights')) $('cfg-lights').checked = this.cfg.showLights;
    if ($('cfg-cams')) $('cfg-cams').checked = this.cfg.showCams;
    if ($('cfg-works')) $('cfg-works').checked = this.cfg.showWorks;
    if ($('cfg-vehicle')) $('cfg-vehicle').value = this.cfg.vehicle;
    if ($('cfg-fuel-price')) $('cfg-fuel-price').value = this.cfg.fuelPrice;
    if ($('cfg-show-fuel')) $('cfg-show-fuel').checked = this.cfg.showFuel;
    if ($('cfg-car-name')) $('cfg-car-name').value = this.cfg.carName;

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr',
     'cfg-lights','cfg-cams','cfg-works','cfg-vehicle','cfg-fuel-price','cfg-show-fuel','cfg-car-name'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', save);
    });

    $('btn-open-modes')?.addEventListener('click', () => this.modesSheet.open());
    $('modes-ok-btn')?.addEventListener('click', () => this.modesSheet.close());

    const toggleRot = () => {
      this.cfg.rotateMode = !this.cfg.rotateMode;
      if ($('cfg-rot')) $('cfg-rot').checked = this.cfg.rotateMode;
      save();
      this.updateRotateUI();
      toast(this.cfg.rotateMode ? '🧭 Sürüş Yönü (Yöne Göre Döndür Aktif)' : '🧭 Kuzey Yukarı (Harita Sabit)');
    };
    $('btn-compass')?.addEventListener('click', toggleRot);
    $('btn-mode-rot')?.addEventListener('click', toggleRot);
    this.updateRotateUI();

    $('btn-zoom-in')?.addEventListener('click', () => { if (this.map && this.map.map) this.map.map.zoomIn(); });
    $('btn-zoom-out')?.addEventListener('click', () => { if (this.map && this.map.map) this.map.map.zoomOut(); });

    const renderDestHistory = () => {
      const wrap = $('dest-history-wrap');
      const box = $('dest-history');
      if (!wrap || !box) return;
      const hist = (() => { const h = store.json('rp_dest_history', []); return Array.isArray(h) ? h : []; })();
      if (!hist || !hist.length) { wrap.style.display = 'none'; return; }
      box.innerHTML = '';
      hist.slice(0, 5).forEach(h => {
        const btn = document.createElement('button');
        btn.className = 'dest-row';
        btn.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:8px;"><span>📍</span><span>${esc(h.name)}</span></div>`;
        btn.addEventListener('click', () => {
          this.destSheet.close();
          this.fx.setDestination(h.la, h.ln, h.name);
        });
        box.appendChild(btn);
      });
      wrap.style.display = 'block';
    };
    $('btn-dest')?.addEventListener('click', renderDestHistory);

    $('btn-theme')?.addEventListener('click', () => {
      const light = !document.body.classList.contains('light-theme');
      if ($('cfg-lt')) $('cfg-lt').checked = light;
      this.map.setTheme(light);
      save();
    });

    $('btn-refresh-status')?.addEventListener('click', () => this.fx.testServices());
    this.initBle();

    $('btn-clear-hazards')?.addEventListener('click', () => {
      if (confirm('Eklenen tüm özel tehlike, kaza ve radarlar silinsin mi?')) {
        store.set('rp_hazards', '[]');
        this.state.poi = [];
        this.fx.refreshPOIs();
        toast('Tüm özel uyarılar temizlendi.');
      }
    });

    $('btn-reset-dur')?.addEventListener('click', () => this.fx.resetTrip());

    document.querySelectorAll('.quick-dest-btn').forEach(btn => {
      const q = btn.getAttribute('data-q'); let lp = null;
      btn.addEventListener('click', () => this.fx.quickDest(q));
      if (q === 'Ev' || q === 'İş Yeri') {
        btn.addEventListener('touchstart', () => { lp = setTimeout(() => { lp = 'done'; this.fx.forgetPlace(q); }, 800); }, { passive: true });
        btn.addEventListener('touchend', e => { if (lp === 'done') e.preventDefault(); clearTimeout(lp); }, { passive: false });
      }
    });

    const searchAddr = () => { const q = $('dest-q')?.value.trim(); if (q) this.fx.search(q, false); };
    $('dest-go')?.addEventListener('click', searchAddr);
    $('dest-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });

    $('dest-pick')?.addEventListener('click', () => {
      this.destSheet.close();
      document.body.classList.add('picking'); this.map.unfollow();
    });

    $('pick-no')?.addEventListener('click', () => { document.body.classList.remove('picking'); this.fx.pendingSave = null; });
    $('pick-ok')?.addEventListener('click', () => { document.body.classList.remove('picking'); this.fx.onPick(); });

    document.querySelectorAll('.hazard-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-type');
        let lat = this.state.lat, lng = this.state.lng;
        if (!lat || !lng) {
          const center = this.map.map.getCenter();
          lat = center.lat; lng = center.lng;
        }
        const newPoi = { lat, lng, kind, timestamp: Date.now() };
        this.state.poi.push(newPoi);
        store.set('rp_hazards', JSON.stringify(this.state.poi));
        this.fx.refreshPOIs();
        toast('Tehlike / yol durumu bildirimi eklendi!');
        this.hazardSheet.close();
      });
    });
  }

  startClock() {
    const tick = () => {
      const d = new Date();
      if (this.dom.ftClock)
        this.dom.ftClock.textContent = String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
      
      if (this.dom.dur && this.state.startTime) {
        const elapsed = Math.floor((Date.now() - this.state.startTime) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        this.dom.dur.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
      }
    };
    tick();
    setInterval(tick, 1000);
  }

  startSplash() {
    const splash = $('splash');
    const bar = document.querySelector('.sp-bar-fill');
    const pct = document.querySelector('.sp-pct');
    if (splash) splash.addEventListener('click', _killSplashNow);

    let progress = 0;
    const itv = setInterval(() => {
      progress += 2;
      if (bar) bar.style.transform = `scaleX(${progress / 100})`;
      if (pct) pct.textContent = `${Math.min(100, progress)}%`;
      if (progress >= 100) {
        clearInterval(itv);
        _killSplashNow();
      }
    }, 100);
  }

  startGPS() {
    if (!('geolocation' in navigator)) {
      if (this.dom.ftGps) this.dom.ftGps.textContent = 'GPS Desteklenmiyor';
      return;
    }
    this._kf = new GPSFilter();
    this._onPos = (pos, ext) => {
        if (!ext && this._bleOn && Date.now() - (this._bleT || 0) < 5000) return;
        _killSplashNow();
        const { latitude: rla, longitude: rln, speed, heading, accuracy } = pos.coords;
        const tNow = pos.timestamp || Date.now();
        const acc = Number.isFinite(accuracy) ? accuracy : 50;
        this._gpsT0 = this._gpsT0 || Date.now();
        if (acc <= 50) this._goodFix = true;
        if (acc > (this._goodFix ? 150 : 100) && (this._goodFix || Date.now() - this._gpsT0 < 8000)) {
          if (this.dom.ftGps) this.dom.ftGps.textContent = `GPS aranıyor (±${Math.round(acc)} m)`;
          return;
        }
        if (acc > 500 && !this._warnedCoarse && Date.now() - this._gpsT0 > 10000) {
          this._warnedCoarse = true;
          toast(`Konum çok kaba (±${Math.round(acc)} m).`, 9000);
        }
        const kmhRaw = (speed !== null && Number.isFinite(speed)) ? Math.max(0, speed * 3.6) : null;
        const [la, ln] = this._kf.process(rla, rln, acc, tNow, kmhRaw === null ? 0 : kmhRaw / 3.6);
        let kmh = kmhRaw;
        if (kmh === null) {
          const p = this._lastFix; kmh = 0;
          if (p) {
            const dt = (tNow - p.t) / 1000, dd = hav(p.la, p.ln, la, ln);
            if (dt >= 0.5 && dt <= 15 && dd >= 3 && acc <= 50) kmh = dd / dt * 3.6;
          }
        }
        this._lastFix = { la, ln, t: tNow };
        const S = this.state, prevD = this._distFix;
        S.lat = la; S.lng = ln; S.spd = kmh; S.acc = acc;
        if (prevD && kmh > 3 && acc <= 50) {
          const d = hav(prevD[0], prevD[1], la, ln);
          if (d < 500) S.dist += d / 1000;
        }
        this._distFix = [la, ln];
        if (kmh > 3) { S.sumSpd += kmh; S.spdN++; S.avgSpd = S.sumSpd / S.spdN; }
        if (kmh > S.maxSpd && kmh < 300) S.maxSpd = kmh;
        this._lastPosT = Date.now();
        this._hdgNow = Number.isFinite(pos.coords.heading) ? pos.coords.heading : this.map._targetHd;

        this.map.pushFix(la, ln, acc, pos.coords.heading, kmh);
        this.updateHUD(kmh, acc, pos.coords.altitude);
        this.fx.onFix(la, ln, kmh, acc);
      };

    const opts = { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 };
    const onErr = err => {
      const m = { 1: 'Konum izni reddedildi', 2: 'Konum alınamıyor', 3: 'GPS zaman aşımı' }[err.code] || 'GPS hatası';
      if (this.dom.ftGps) this.dom.ftGps.textContent = m;
      if (this.dom.ftDot) this.dom.ftDot.classList.remove('on');
      if (err.code === 1) toast('Konum izni gerekli. Tarayıcı/ayarlardan izin verin.', 6000);
      else if (err.code === 3 || err.code === 2) { setTimeout(() => this._watchGPS(), 1500); }
      _killSplashNow();
    };
    this._watchGPS = () => {
      try { if (this._wid != null) navigator.geolocation.clearWatch(this._wid); } catch (_) {}
      this._wid = navigator.geolocation.watchPosition(p => this._onPos(p, false), onErr, opts);
    };
    this._watchGPS();
    navigator.geolocation.getCurrentPosition(p => this._onPos(p, false), () => {}, { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') { this.enableWakeLock(); this._watchGPS(); }
    });
    setInterval(() => {
      if (!this._lastPosT) return;
      const age = Date.now() - this._lastPosT;
      if (age > 8000 && this.dom.ftGps) { this.dom.ftGps.textContent = 'Sinyal zayıf'; this.dom.ftDot?.classList.remove('on'); }
    }, 3000);
  }

  updateHUD(kmh, acc, alt) {
    const D = this.dom, S = this.state, lim = this.fx.limit;
    const k = Math.round(kmh);
    if (D.spdVal) D.spdVal.textContent = k;
    if (D.spdBar) D.spdBar.style.transform = `scaleX(${clamp(kmh / 180, 0, 1).toFixed(3)})`;
    if (D.ftDot) D.ftDot.classList.add('on');
    if (D.ftGps) D.ftGps.textContent = this._bleOn && Date.now() - (this._bleT || 0) < 5000 ? 'Harici GPS (BT)' : `GPS Aktif (±${Math.round(acc)} m)`;
    const bars = document.querySelectorAll('#ft-bars .ft-bar'), q = acc <= 8 ? 4 : acc <= 20 ? 3 : acc <= 50 ? 2 : 1;
    bars.forEach((b, i) => b.classList.toggle('active', i < q));
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('ss-max', Math.round(S.maxSpd)); set('ss-avg', Math.round(S.avgSpd)); set('ss-trip', S.dist.toFixed(1));
    set('m-alt', Number.isFinite(alt) ? Math.round(alt) + ' m' : '-- m');
    const h = this._hdgNow; if (Number.isFinite(h)) set('m-dir', ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'][Math.round(h / 45) % 8]);
    set('m-acc', '±' + Math.round(acc) + ' m');
    let trf = 'Normal';
    if (lim && kmh > 3 && lim >= 50) trf = kmh < lim * 0.35 ? 'Yoğun' : kmh < lim * 0.65 ? 'Orta' : 'Akıcı';
    set('m-trf', trf);
    this.fx.updateFuel();
    // Hız uyarısı
    const dash = this.dom.speedDash;
    if (dash) {
      const over = lim && kmh > lim + this.cfg.threshold, warn = lim && kmh > lim;
      dash.classList.toggle('over', !!over); dash.classList.toggle('warn', !!warn && !over);
      $('ovr')?.classList.toggle('on', !!over);
      if (over && Date.now() - (this._warnT || 0) > 15000) {
        this._warnT = Date.now();
        if (this.cfg.soundOn) beep(880, 0.25);
        if (this.cfg.ttsOn) speak('Hız sınırını aşıyorsunuz');
      }
    }
  }

  initBle() {
    const btn = $('btn-bt'), st = $('bt-status');
    const setUI = (txt, on) => { if (st) st.textContent = txt; if (btn) btn.textContent = on ? 'Kes' : 'Bağlan'; };
    if (!BleGPS.supported) {
      const ios = BleGPS.isIOS;
      setUI(ios ? 'iPhone: Bluefy tarayıcısı gerekir' : (window.isSecureContext ? 'Bu tarayıcı desteklemiyor' : 'HTTPS gerekli'), false);
      btn?.addEventListener('click', () => toast(ios
        ? 'iOS Safari/Chrome Web Bluetooth desteklemez. Harici GPS için App Store\'dan "Bluefy" tarayıcısında açın; aksi halde cihaz GPS\'i kullanılır.'
        : 'Chrome/Edge (Android) ve HTTPS gerekir. Cihaz GPS\'i kullanılıyor.', 7000));
      return;
    }
    this.ble = new BleGPS(pos => { this._bleOn = true; this._bleT = Date.now(); this._onPos(pos, true); }, s => {
      const n = this.ble.name;
      if (s === 'on') { this._bleOn = true; setUI(`Bağlı: ${n}`, true); toast('Bluetooth GPS bağlandı'); }
      else if (s === 'nofix') setUI(`Bağlı: ${n} — uydu bekleniyor`, true);
      else if (s === 'connecting') setUI('Bağlanıyor…', false);
      else if (s === 'lost') { setUI('Bağlantı koptu, yeniden deneniyor…', true); toast('Bluetooth bağlantısı koptu, cihaz GPS\'ine geçildi'); }
      else { this._bleOn = false; setUI('Bağlı değil', false); }
    });
    btn?.addEventListener('click', async () => {
      if (this.ble.connected || this.ble._busy) { this.ble.disconnect(); return; }
      try { await this.ble.connect(); }
      catch (e) {
        this._bleOn = false; setUI('Bağlı değil', false);
        const n = e && e.name, m = e && e.message;
        if (n === 'NotFoundError' || n === 'AbortError') return; // kullanıcı iptal etti
        if (m === 'NO_GPS_SERVICE') toast('Bu cihazda desteklenen GPS servisi yok (Nordic UART / FFE0 / Konum-Hız). Klasik (SPP) BT GPS Web Bluetooth ile çalışmaz.', 8000);
        else if (n === 'SecurityError' || n === 'NotAllowedError') toast('Bluetooth izni reddedildi. Tarayıcı ve sistem ayarlarından izin verin.', 6000);
        else toast('Bluetooth bağlantısı kurulamadı: ' + (m || n || 'bilinmeyen hata'), 6000);
      }
    });
  }

  startLoop() {
    const loop = () => { try { this.map.frame && this.map.map && this.map.frame(); } catch (_) {} requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
}

/* ═══════ Helpers ═══════ */
const _rad = Math.PI / 180;
function hav(a, b, c, d) {
  const R = 6371000, dl = (c - a) * _rad, dn = (d - b) * _rad;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a * _rad) * Math.cos(c * _rad) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
function bearingTo(a, b, c, d) {
  const y = Math.sin((d - b) * _rad) * Math.cos(c * _rad);
  const x = Math.cos(a * _rad) * Math.sin(c * _rad) - Math.sin(a * _rad) * Math.cos(c * _rad) * Math.cos((d - b) * _rad);
  return (Math.atan2(y, x) / _rad + 360) % 360;
}
let _toastT = null;
function toast(msg, ms = 2800) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(_toastT); _toastT = setTimeout(() => t.classList.remove('on'), ms);
}
let _actx = null;
function beep(f = 800, d = 0.2) {
  try {
    _actx = _actx || new (window.AudioContext || window.webkitAudioContext)();
    if (_actx.state === 'suspended') _actx.resume();
    const o = _actx.createOscillator(), g = _actx.createGain();
    o.frequency.value = f; g.gain.value = 0.12; o.connect(g); g.connect(_actx.destination);
    o.start(); o.stop(_actx.currentTime + d);
  } catch (_) {}
}
function speak(t) {
  try {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(t); u.lang = 'tr-TR'; u.rate = 1;
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (_) {}
}
// iOS ses/konuşma kilidini ilk dokunuşta aç
addEventListener('pointerdown', function u() {
  removeEventListener('pointerdown', u);
  try { _actx = _actx || new (window.AudioContext || window.webkitAudioContext)(); _actx.resume(); } catch (_) {}
  try { if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (_) {}
}, { once: true });

const TR_MAN = { turn: 'dönün', 'new name': 'devam edin', depart: 'yola çıkın', arrive: 'varış', merge: 'birleşin', 'on ramp': 'rampaya girin', 'off ramp': 'çıkıştan çıkın', fork: 'ayrımda', 'end of road': 'yol sonunda', continue: 'devam edin', roundabout: 'kavşaktan', rotary: 'kavşaktan', 'exit roundabout': 'kavşaktan çıkın' };
const TR_MOD = { left: 'sola', right: 'sağa', 'slight left': 'hafif sola', 'slight right': 'hafif sağa', 'sharp left': 'keskin sola', 'sharp right': 'keskin sağa', straight: 'düz', uturn: 'U dönüşü yapın' };
const HW_LIMIT = { motorway: 120, trunk: 110, primary: 90, secondary: 82, tertiary: 70, unclassified: 50, residential: 50, living_street: 20, service: 30 };
const fmtD = m => m < 1000 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(1) + ' km';

/* ═══════ Features ═══════ */
class Features {
  constructor(app) {
    this.app = app; this.limit = null; this.route = null; this.dest = null; this.pendingSave = null;
    this.net = []; this._netPos = null; this._netT = 0; this._limPos = null; this._limT = 0;
    this._wxT = 0; this._geoPos = null; this._offN = 0; this._camWarn = {};
    this.parkL = null;
    this.routeL = (typeof L !== 'undefined' && app.map.map) ? L.polyline([], { color: '#2d7aff', weight: 7, opacity: 0.9, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(app.map.map) : null;
    this.bindTools();
    this.updateCarIntegration();
    const pk = store.json('rp_park', null); if (pk) this.showPark(pk);
  }
  get m() { return this.app.map; }
  get S() { return this.app.state; }

  bindTools() {
    const A = this.app;
    $('btn-voice')?.addEventListener('click', () => {
      A.cfg.ttsOn = !A.cfg.ttsOn; if ($('cfg-tts')) $('cfg-tts').checked = A.cfg.ttsOn;
      $('cfg-tts')?.dispatchEvent(new Event('change')); toast(A.cfg.ttsOn ? '🔊 Sesli uyarı açık' : '🔇 Sesli uyarı kapalı');
    });
    $('btn-trail')?.addEventListener('click', () => {
      const m = this.m; if (!m.trailL) return;
      m._trailOn = m._trailOn === false; m.trailL.setStyle({ opacity: m._trailOn === false ? 0 : 0.35 });
      toast(m._trailOn === false ? 'İz gizlendi' : 'İz gösteriliyor');
    });
    $('btn-park')?.addEventListener('click', () => {
      const pk = store.json('rp_park', null);
      if (pk && confirm('Kayıtlı park yerine gidilsin mi? (İptal: yeni park yeri kaydet)')) { A.modesSheet.close(); this.setDestination(pk.la, pk.ln, 'Park Yerim'); return; }
      if (this.S.lat == null) return toast('Konum bekleniyor…');
      const p = { la: this.S.lat, ln: this.S.lng }; store.set('rp_park', JSON.stringify(p)); this.showPark(p); toast('🅿️ Park yeri kaydedildi');
    });
    const share = async (txt) => {
      if (this.S.lat == null) return toast('Konum bekleniyor…');
      const url = `https://maps.google.com/?q=${this.S.lat.toFixed(6)},${this.S.lng.toFixed(6)}`;
      try { if (navigator.share) await navigator.share({ title: 'RotaPro', text: txt, url }); else { await navigator.clipboard.writeText(txt + ' ' + url); toast('Bağlantı kopyalandı'); } } catch (_) {}
    };
    $('btn-share-pos')?.addEventListener('click', () => share('Konumum:'));
    $('btn-share-eta')?.addEventListener('click', () => share(this.route ? `Varışıma ${$('nb-eta')?.textContent || ''} kaldı.` : 'Konumum:'));
    $('nb-x')?.addEventListener('click', () => this.cancelRoute());
    $('dest-clear')?.addEventListener('click', () => { this.cancelRoute(); A.destSheet.close(); });
    $('trip-close-btn')?.addEventListener('click', () => { const b = $('trip-bg'); if (b) b.style.display = 'none'; });

    $('btn-hud')?.addEventListener('click', () => { A.modesSheet.close(); document.body.classList.add('hud-mode'); });
    let ex = $('btn-exit-hud');
    if (!ex) { ex = document.createElement('button'); ex.id = 'btn-exit-hud'; ex.textContent = '✕ HUD\'dan Çık'; ex.style.cssText = 'position:fixed;top:calc(env(safe-area-inset-top,0px)+12px);right:12px;z-index:9999;padding:10px 14px;border-radius:12px;display:none;background:rgba(0,0,0,.6);color:#fff;border:1px solid rgba(255,255,255,.2)'; document.body.appendChild(ex); }
    ex.addEventListener('click', () => document.body.classList.remove('hud-mode'));
    new MutationObserver(() => { ex.style.display = document.body.classList.contains('hud-mode') ? 'flex' : 'none'; }).observe(document.body, { attributes: true, attributeFilter: ['class'] });

    // Müzik: tarayıcı başka uygulamayı kontrol edemez; seçili uygulamayı açar
    const src = store.get('rp_music') || 'spotify';
    const setSrc = s => {
      store.set('rp_music', s);
      $('ms-spotify')?.classList.toggle('on', s === 'spotify'); $('ms-ytm')?.classList.toggle('on', s === 'ytm');
      if ($('mw-title')) $('mw-title').textContent = s === 'spotify' ? 'Spotify' : 'YouTube Music';
      if ($('mw-sub')) $('mw-sub').textContent = 'Uygulamayı açmak için ▶';
      if ($('ms-login')) $('ms-login').textContent = s === 'spotify' ? "Spotify'a Bağlan" : "YouTube Music'e Giriş";
    };
    setSrc(src);
    $('ms-spotify')?.addEventListener('click', () => setSrc('spotify'));
    $('ms-ytm')?.addEventListener('click', () => setSrc('ytm'));
    const openMusic = (login) => {
      const s = store.get('rp_music') || 'spotify';
      const web = s === 'spotify' ? (login ? 'https://accounts.spotify.com/login' : 'https://open.spotify.com/') : (login ? 'https://accounts.google.com/ServiceLogin?service=youtube' : 'https://music.youtube.com/');
      window.open(web, '_blank', 'noopener');
    };
    $('ms-open')?.addEventListener('click', () => openMusic(false));
    $('ms-login')?.addEventListener('click', () => openMusic(true));
    $('mw-play')?.addEventListener('click', () => openMusic(false));
    $('mw-prev')?.addEventListener('click', () => toast('Parça kontrolü için müzik uygulamasını kullanın'));
    $('mw-next')?.addEventListener('click', () => toast('Parça kontrolü için müzik uygulamasını kullanın'));
  }

  showPark(p) {
    if (!this.m.map) return;
    if (this.parkL) this.parkL.remove();
    this.parkL = L.marker([p.la, p.ln], { icon: L.divIcon({ className: '', html: '<div style="font-size:26px;filter:drop-shadow(0 2px 3px #000)">🅿️</div>', iconSize: [28, 28], iconAnchor: [14, 14] }), keyboard: false }).addTo(this.m.map);
  }

  updateCarIntegration() {
    const n = this.app.cfg.carName; document.title = 'RotaPro — ' + n;
  }
  updateFuel() {
    const C = this.app.cfg, el = $('m-fuel'), box = el?.closest('.metric');
    if (box) box.style.display = C.showFuel ? '' : 'none';
    if (!el) return;
    const cons = { benzin: 7.5, dizel: 6, lpg: 9.5, elektrik: 16 }[C.vehicle] || 7.5;
    el.textContent = '₺' + (this.S.dist * cons / 100 * C.fuelPrice).toFixed(1);
    const l = $('m-fuel-lbl'); if (l) l.textContent = 'YAKIT MALİYETİ';
  }

  /* ── POI (kamera / ışık / özel uyarı) ── */
  async refreshPOIs(force) {
    const S = this.S, ctr = S.lat != null ? [S.lat, S.lng] : (this.m.map ? [this.m.map.getCenter().lat, this.m.map.getCenter().lng] : null);
    if (ctr && (force || !this._netPos || hav(this._netPos[0], this._netPos[1], ctr[0], ctr[1]) > 1200 || Date.now() - this._netT > 600000) && navigator.onLine) {
      this._netPos = ctr; this._netT = Date.now();
      const q = `[out:json][timeout:8];(node["highway"="speed_camera"](around:3500,${ctr[0]},${ctr[1]});node["enforcement"="maxspeed"](around:3500,${ctr[0]},${ctr[1]});node["highway"="traffic_signals"](around:1500,${ctr[0]},${ctr[1]}););out 250;`;
      try {
        const j = await fetchOverpass(q);
        this.net = (j.elements || []).map(e => ({ lat: e.lat, lng: e.lon, kind: e.tags?.highway === 'traffic_signals' ? 'light' : 'cam', net: true }));
      } catch (_) {}
    }
    this.m.setPOIs([...this.net, ...S.poi], this.app.cfg);
  }

  /* ── Her GPS noktasında ── */
  onFix(la, ln, kmh, acc) {
    const now = Date.now();
    if (!this._wxT || now - this._wxT > 600000) { this._wxT = now; this.weather(la, ln); }
    if (!this._geoPos || hav(this._geoPos[0], this._geoPos[1], la, ln) > 1500) { this._geoPos = [la, ln]; this.reverse(la, ln); }
    if (!this._netPos || hav(this._netPos[0], this._netPos[1], la, ln) > 1200) this.refreshPOIs();
    if ((!this._limPos || hav(this._limPos[0], this._limPos[1], la, ln) > 60 || now - this._limT > 30000) && now - this._limT > 6000) this.roadInfo(la, ln);
    // Kamera yakınlık uyarısı
    if (kmh > 5 && this.app.cfg.showCams) {
      for (const p of this.net) {
        if (p.kind !== 'cam') continue;
        const d = hav(la, ln, p.lat, p.lng);
        if (d < 350) {
          const key = p.lat + ',' + p.lng;
          if (now - (this._camWarn[key] || 0) > 120000) {
            const br = bearingTo(la, ln, p.lat, p.lng), h = this.m._targetHd, df = Math.abs(((br - h + 540) % 360) - 180);
            if (!this.m._hasHd || df < 50) {
              this._camWarn[key] = now; toast('📷 Hız kamerası ' + fmtD(d) + ' ileride', 4000);
              if (this.app.cfg.soundOn) beep(1000, 0.2); if (this.app.cfg.ttsOn) speak('İleride hız kamerası');
            }
          }
        }
      }
    }
    if (this.route) this.trackRoute(la, ln, kmh);
  }

  async weather(la, ln) {
    try {
      const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la.toFixed(3)}&longitude=${ln.toFixed(3)}&current=temperature_2m,wind_speed_10m`);
      const c = j.current || {};
      if ($('is-temp')) $('is-temp').textContent = Math.round(c.temperature_2m) + '°C';
      if ($('is-wind')) $('is-wind').textContent = Math.round(c.wind_speed_10m) + ' km/s';
    } catch (_) {}
  }
  async reverse(la, ln) {
    try {
      const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=tr&lat=${la}&lon=${ln}`);
      const a = j.address || {};
      const n = a.suburb || a.neighbourhood || a.town || a.city_district || a.city || a.county || '';
      const c = a.city || a.town || a.province || '';
      if ($('is-loc')) $('is-loc').textContent = [n, c].filter((v, i, r) => v && r.indexOf(v) === i).join(', ') || 'Konum';
    } catch (_) {}
  }
  async roadInfo(la, ln) {
    this._limT = Date.now(); this._limPos = [la, ln];
    if (!navigator.onLine) return;
    try {
      const j = await fetchOverpass(`[out:json][timeout:7];way(around:25,${la},${ln})["highway"];out tags geom 8;`, 7000);
      let best = null, bd = 1e9;
      for (const w of j.elements || []) {
        const g = w.geometry || []; if (!w.tags || g.length < 2) continue;
        if (['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track'].includes(w.tags.highway)) continue;
        for (let i = 0; i < g.length - 1; i++) {
          const r = segProj(la, ln, [g[i].lat, g[i].lon], [g[i + 1].lat, g[i + 1].lon]);
          if (r.d < bd) { bd = r.d; best = w; }
        }
      }
      if (!best) return;
      const t = best.tags; let lim = parseInt(t.maxspeed, 10);
      if (!Number.isFinite(lim)) lim = HW_LIMIT[String(t.highway).replace('_link', '')] || null;
      this.limit = lim;
      const b = $('limit-badge'); if (b) b.classList.toggle('off', !lim);
      if ($('limit-num')) $('limit-num').textContent = lim || '';
      if ($('hdr-road')) $('hdr-road').textContent = t.name || t.ref || '';
      this.setSt('st-lim', true);
    } catch (_) { this.setSt('st-lim', false); }
  }
  setSt(id, ok, txt) { const e = $(id); if (!e) return; e.textContent = txt || (ok ? 'Çevrimiçi / Hazır' : 'Erişilemiyor'); e.classList.toggle('ok', !!ok); }
  async testServices() {
    toast('Servisler test ediliyor…');
    const t = async (id, fn) => { try { await fn(); this.setSt(id, true); } catch (_) { this.setSt(id, false); } };
    await Promise.all([
      t('st-lim', () => fetchOverpass('[out:json][timeout:5];node(1);out;', 6000)),
      t('st-wx', () => fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=39&longitude=32&current=temperature_2m', 6000)),
      t('st-trf', () => fetchJSON('https://router.project-osrm.org/route/v1/driving/32.85,39.92;32.86,39.93?overview=false', 6000)),
      t('st-geo', () => fetchJSON('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=Ankara', 6000))
    ]);
    toast('Test tamamlandı');
  }

  /* ── Arama / hedef ── */
  async search(q, silent) {
    const box = $('dest-res'); if (!box) return;
    box.innerHTML = '<div style="padding:12px;opacity:.7">Aranıyor…</div>';
    try {
      let u = `https://nominatim.openstreetmap.org/search?format=json&limit=7&accept-language=tr&addressdetails=0&q=${encodeURIComponent(q)}`;
      if (this.S.lat != null) { const d = 0.6; u += `&viewbox=${this.S.lng - d},${this.S.lat + d},${this.S.lng + d},${this.S.lat - d}`; }
      const r = await fetchJSON(u, 9000);
      if (!r.length) { box.innerHTML = '<div style="padding:12px;opacity:.7">Sonuç bulunamadı</div>'; return; }
      box.innerHTML = '';
      r.forEach(x => {
        const b = document.createElement('button'); b.className = 'dest-row';
        const d = this.S.lat != null ? ' · ' + fmtD(hav(this.S.lat, this.S.lng, +x.lat, +x.lon)) : '';
        b.innerHTML = `<div style="font-weight:600;font-size:13px;text-align:left">📍 ${esc(x.display_name.split(',').slice(0, 3).join(','))}<span style="opacity:.6;font-weight:500">${esc(d)}</span></div>`;
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(+x.lat, +x.lon, x.display_name.split(',')[0]); });
        box.appendChild(b);
      });
    } catch (_) { box.innerHTML = '<div style="padding:12px;color:var(--red)">Arama başarısız. Bağlantıyı kontrol edin.</div>'; }
  }
  quickDest(q) {
    if (q === 'Ev' || q === 'İş Yeri') {
      const p = store.json('rp_place_' + q, null);
      if (p) { this.app.destSheet.close(); return this.setDestination(p.la, p.ln, q); }
      this.pendingSave = q; this.app.destSheet.close(); document.body.classList.add('picking'); this.m.unfollow();
      return toast(`${q} konumunu haritadan seçin`);
    }
    const input = $('dest-q'); if (input) input.value = q;
    this.search(q + (this.S.lat != null ? '' : ''), true);
  }
  forgetPlace(q) { if (confirm(q + ' konumu silinsin mi?')) { try { localStorage.removeItem('rp_place_' + q); } catch (_) {} toast(q + ' silindi'); } }
  onPick() {
    const c = this.m.map.getCenter();
    if (this.pendingSave) {
      const q = this.pendingSave; this.pendingSave = null;
      store.set('rp_place_' + q, JSON.stringify({ la: c.lat, ln: c.lng })); toast(q + ' kaydedildi');
      return this.setDestination(c.lat, c.lng, q);
    }
    this.setDestination(c.lat, c.lng, 'Seçilen Hedef');
  }
  async setDestination(la, ln, name) {
    if (this.S.lat == null) return toast('Önce konum bulunmalı…');
    this.dest = { la, ln, name };
    const h = store.json('rp_dest_history', []); const arr = (Array.isArray(h) ? h : []).filter(x => x.name !== name);
    arr.unshift({ la, ln, name }); store.set('rp_dest_history', JSON.stringify(arr.slice(0, 10)));
    this.m.setDestinationPin(la, ln, name);
    toast('Rota hesaplanıyor…');
    await this.fetchRoute();
  }
  async fetchRoute() {
    const d = this.dest, S = this.S; if (!d) return;
    try {
      const j = await fetchJSON(`https://router.project-osrm.org/route/v1/driving/${S.lng},${S.lat};${d.ln},${d.la}?overview=full&geometries=geojson&steps=true`, 12000);
      const r = j.routes && j.routes[0]; if (!r) throw new Error('no route');
      const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
      const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
      const steps = []; let acc = 0;
      (r.legs || []).forEach(l => (l.steps || []).forEach(s => { steps.push({ at: acc, loc: [s.maneuver.location[1], s.maneuver.location[0]], type: s.maneuver.type, mod: s.maneuver.modifier, name: s.name || '' }); acc += s.distance; }));
      // adım konumunu rota üzerindeki mesafeye çevir
      steps.forEach(s => { let bi = 0, bd = 1e12; for (let i = 0; i < pts.length; i++) { const dd = (pts[i][0] - s.loc[0]) ** 2 + (pts[i][1] - s.loc[1]) ** 2; if (dd < bd) { bd = dd; bi = i; } } s.at = cum[bi]; });
      this.route = { pts, cum, total: cum[cum.length - 1], dur: r.duration, steps, spoken: {}, idx: 0 };
      this.routeL?.setLatLngs(pts);
      $('nav-banner')?.classList.add('show'); if ($('nav-banner')) $('nav-banner').style.display = 'flex';
      if ($('dest-clear')) $('dest-clear').style.display = 'block';
      this._offN = 0; this.m.follow();
      if (this.m && this.m.map) try { this.m.map.setZoom(Math.max(this.m.map.getZoom(), 16), { animate: false }); } catch (_) {}
      this.setSt('st-trf', true);
      this.trackRoute(S.lat, S.lng, S.spd);
      if (this.app.cfg.ttsOn) speak('Rota hazır. ' + fmtD(r.distance) + ', yaklaşık ' + Math.round(r.duration / 60) + ' dakika.');
    } catch (e) { this.setSt('st-trf', false); toast('Rota bulunamadı. Bağlantıyı kontrol edin.', 4500); }
  }
  trackRoute(la, ln, kmh) {
    const R = this.route; if (!R) return;
    // rotaya en yakın nokta (ileri yönlü pencere)
    let bi = R.idx, bd = 1e12;
    for (let i = Math.max(0, R.idx - 3); i < Math.min(R.pts.length - 1, R.idx + 80); i++) {
      const r = segProj(la, ln, R.pts[i], R.pts[i + 1]); if (r.d < bd) { bd = r.d; bi = i; }
    }
    if (bd > 80) { // pencere dışı: tüm rotada ara
      for (let i = 0; i < R.pts.length - 1; i++) { const r = segProj(la, ln, R.pts[i], R.pts[i + 1]); if (r.d < bd) { bd = r.d; bi = i; } }
    }
    R.idx = bi;
    const along = R.cum[bi] + hav(R.pts[bi][0], R.pts[bi][1], la, ln);
    const rem = Math.max(0, R.total - along);
    if (bd > 60 && kmh > 5) { if (++this._offN >= 4 && Date.now() - (this._rrT || 0) > 12000) { this._rrT = Date.now(); this._offN = 0; toast('Rota yeniden hesaplanıyor…'); if (this.app.cfg.ttsOn) speak('Rota yeniden hesaplanıyor'); this.fetchRoute(); return; } } else this._offN = 0;
    // sonraki manevra
    let nx = R.steps.find(s => s.at > along + 5 && s.type !== 'depart') || R.steps[R.steps.length - 1];
    const dn = nx ? Math.max(0, nx.at - along) : rem;
    let txt = 'Düz devam edin';
    if (nx) {
      if (nx.type === 'arrive') txt = 'Varış noktası';
      else { const mod = TR_MOD[nx.mod] || ''; txt = nx.mod === 'uturn' ? mod : (mod ? mod + ' ' : '') + (TR_MAN[nx.type] || 'devam edin'); txt = txt.charAt(0).toUpperCase() + txt.slice(1) + (nx.name ? ' · ' + nx.name : ''); }
    }
    if ($('nb-dist')) $('nb-dist').textContent = fmtD(dn);
    if ($('nb-txt')) $('nb-txt').textContent = txt;
    const eta = Math.round((rem / Math.max(8, kmh > 5 ? kmh : 30) * 3.6) / 60);
    if ($('nb-eta')) $('nb-eta').textContent = eta >= 60 ? Math.floor(eta / 60) + ' sa ' + (eta % 60) + ' dk' : Math.max(1, eta) + ' dk';
    const ar = $('nb-arrow')?.querySelector('svg'); if (ar && nx) { const deg = { left: -90, right: 90, 'slight left': -45, 'slight right': 45, 'sharp left': -135, 'sharp right': 135, uturn: 180 }[nx.mod] || 0; ar.style.transform = `rotate(${deg}deg)`; }
    if (this.app.cfg.ttsOn && nx) {
      const key = nx.at + nx.type; const th = kmh > 70 ? 400 : 150;
      if (dn < th && !R.spoken[key]) { R.spoken[key] = 1; speak(`${fmtD(dn)} sonra ${txt}`); }
    }
    if (rem < 30) { speak('Varış noktasına ulaştınız'); toast('🏁 Varış noktasına ulaştınız', 5000); this.cancelRoute(); this.tripSummary(); }
  }
  cancelRoute() {
    this.route = null; this.dest = null; this.routeL?.setLatLngs([]); this.m.destMarkerL?.clearLayers();
    const nb = $('nav-banner'); if (nb) { nb.classList.remove('show'); nb.style.display = 'none'; }
    if ($('dest-clear')) $('dest-clear').style.display = 'none';
  }
  tripSummary() {
    const S = this.S, el = Math.floor((Date.now() - S.startTime) / 1000), m = Math.floor(el / 60);
    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('ts-dist', S.dist.toFixed(1) + ' km'); set('ts-dur', String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
    set('ts-avg', Math.round(S.avgSpd) + ' km/s'); set('ts-cost', $('m-fuel')?.textContent || '₺0');
    const b = $('trip-bg'); if (b) b.style.display = 'flex';
  }
  resetTrip() {
    if (this.S.dist > 0.2) this.tripSummary();
    Object.assign(this.S, { startTime: Date.now(), maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0, dist: 0 });
    this.m.trail = []; this.m.trailL?.setLatLngs([]); this.updateFuel(); toast('Yolculuk sıfırlandı');
  }
}

/* ═══════ Başlat ═══════ */
(function boot() {
  const go = () => { try { window.rotaApp = new AppManager(); } catch (e) { console.error(e); _killSplashNow(); } };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', go) : go();
})();
