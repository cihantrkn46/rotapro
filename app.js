/**
 * RotaPro — Complete Mobile Navigation App (Car Integrated Edition)
 * MCT YAZILIM — 2026 Production Ready (With Animated Splash & Offline Compass Fallback)
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

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const store = {
  get(k){ try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} },
  json(k, fb){ try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; } catch (e) { return fb; } }
};

/**
 * Üstel Geri Çekilme (Exponential Backoff) ile Güçlendirilmiş Ağ İstekleri
 */
async function fetchJSON(url, options = {}, retries = 3, delay = 1000) {
  for (let i = 0; i < retries; i++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    try {
      const r = await fetch(url, { ...options, signal: ac.signal, headers: { Accept: 'application/json', ...(options.headers || {}) } });
      clearTimeout(t);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } catch (e) {
      clearTimeout(t);
      if (i === retries - 1) throw e;
      await new Promise(res => setTimeout(res, delay * Math.pow(2, i)));
    }
  }
}

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const OVERPASS_HOSTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
async function fetchOverpass(q, ms = 8000) {
  let lastErr;
  for (const h of OVERPASS_HOSTS) {
    try { return await fetchJSON(h + '?data=' + encodeURIComponent(q), {}, 2, 1000); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

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

      setTimeout(() => { try { this.map.invalidateSize(); } catch (_) {} }, 250);
      window.addEventListener('resize', () => { try { this.map.invalidateSize(); } catch (_) {} });
    } catch (e) {
      console.error(e);
    }
  }

  setTheme(light) {
    document.body.classList.toggle('light-theme', !!light);
    const mt = document.getElementById('meta-theme');
    if (mt) mt.setAttribute('content', light ? '#f0f2f5' : '#000000');
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
    if (!this.init) {
      this.init = true;
      this.disp = [la, ln];
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
    if (candidate !== null) this._blendHeading(candidate, kmh > 25 ? 0.5 : kmh > 8 ? 0.35 : 0.2);

    this._autoZoom(kmh);
    this._syncRecenter();
  }

  /**
   * Dead Reckoning (Tünel Koruması)
   */
  frame() {
    const now = Date.now();
    if (this.disp && this.pos) {
      let tgt = this.pos;
      const timeSinceFix = this._fixT ? (now - this._fixT) / 1000 : 0;
      
      if (timeSinceFix > 1.5 && timeSinceFix < 60 && this._spd > 1.0 && this._hasHd) {
        const dm = this._spd * Math.min(timeSinceFix, 3.0);
        const h = this._targetHd * _rad;
        tgt = [
          this.pos[0] + dm * Math.cos(h) / 111320,
          this.pos[1] + dm * Math.sin(h) / (111320 * Math.cos(this.pos[0] * _rad))
        ];
      } else if (this._fixT && this._spd > 1.5 && this._hasHd) {
        const dm = this._spd * Math.min((now - this._fixT) / 1000, 1.2), h = this._targetHd * _rad;
        tgt = [this.pos[0] + dm * Math.cos(h) / 111320,
               this.pos[1] + dm * Math.sin(h) / (111320 * Math.cos(this.pos[0] * _rad))];
      }

      const dla = tgt[0] - this.disp[0], dln = tgt[1] - this.disp[1];
      if (Math.abs(dla) > 1e-8 || Math.abs(dln) > 1e-8) {
        const k = 0.2;
        this.disp = [this.disp[0] + dla * k, this.disp[1] + dln * k];
        this.meMarker.setLatLng(this.disp);
        if (this.following) this.map.setView(this.disp, this.map.getZoom(), { animate: false });
      }
    }

    const shouldRotate = this.cfg.rotateMode && this.following && this._hasHd;
    const mapRotEl = this.mapRot || $('map-rot');
    const meRotEl = $('me-rot');
    const compassNeedle = $('compass-needle');

    const wantOff = shouldRotate ? Math.round(window.innerHeight * 0.2) : 0;
    this._renderOff = (this._renderOff || 0) + (wantOff - (this._renderOff || 0)) * 0.08;
    const off = this._renderOff.toFixed(1);

    if (shouldRotate) {
      const targetMap = -this._targetHd;
      const diffMap = ((targetMap - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.14;

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
    L.circleMarker([la, ln], {
      radius: 10, color: '#ffffff', weight: 2.5,
      fillColor: '#2d7aff', fillOpacity: 1.0
    }).addTo(this.destMarkerL).bindPopup(pop).openPopup();
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
        else if (cfg.showCams || p.kind === 'cam') target = this.camsL;
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

class AppManager {
  constructor() {
    this.cfg = new Config();
    this.sheet = new SheetManager();
    this.destSheet = new SheetManager('dest-bg', 'dest-sheet', 'dest-handle', 'btn-dest', 'dest-close');
    this.map = new RotaMap(this.cfg);

    this.dom = {
      spdVal: $('spd-val'),
      speedDash: $('speed-dash'),
      limBadge: $('limit-badge'),
      limNum: $('limit-num'),
      isLoc: $('is-loc'),
      hdrRoad: $('hdr-road')
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
    this.startSplash();
    this.startGPS();
    this.startLoop();
    this.enableWakeLock();

    this.checkAutoTheme();
    setInterval(() => this.checkAutoTheme(), 300000);

    setTimeout(() => { this.fx.refreshPOIs(); }, 600);
  }

  checkAutoTheme() {
    const hour = new Date().getHours();
    const isNight = hour >= 19 || hour < 6;
    if (this.cfg.lightTheme === isNight) {
      this.cfg.lightTheme = !isNight;
      this.map.setTheme(this.cfg.lightTheme);
      if ($('cfg-lt'))$('cfg-lt').checked = this.cfg.lightTheme;
    }
  }

  async enableWakeLock() {
    try {
      if ('wakeLock' in navigator && this.cfg.wakeOn) {
        if (this._wl && !this._wl.released) return;
        this._wl = await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
  }

  bindUI() {
    const renderDestHistory = () => {
      const wrap = $('dest-history-wrap');
      const box = $('dest-history');
      if (!wrap || !box) return;
      const hist = (() => { const h = store.json('rp_dest_history', []); return Array.isArray(h) ? h : []; })();
      if (!hist || !hist.length) {
        wrap.style.display = 'none';
        return;
      }
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

    $('dest-history-clear')?.addEventListener('click', () => {
      store.set('rp_dest_history', '[]');
      renderDestHistory();
      toast('Son gidilen hedefler temizlendi.');
    });

    $('btn-compass')?.addEventListener('click', () => {
      this.cfg.rotateMode = !this.cfg.rotateMode;
      toast(this.cfg.rotateMode ? '🧭 Sürüş Yönü Aktif' : '🧭 Kuzey Yukarı');
    });

    const searchAddr = () => { const q = $('dest-q')?.value.trim(); if (q) this.fx.search(q, false); };
    $('dest-go')?.addEventListener('click', searchAddr);$('dest-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });
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
    }, 40);
  }

  startGPS() {
    if (!('geolocation' in navigator)) return;
    this._kf = new GPSFilter();
    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        _killSplashNow();
        const { latitude: rla, longitude: rln, speed, heading, accuracy } = pos.coords;
        const tNow = pos.timestamp || Date.now();
        const acc = Number.isFinite(accuracy) ? accuracy : 50;
        const kmhRaw = (speed !== null && Number.isFinite(speed)) ? Math.max(0, speed * 3.6) : null;
        const [la, ln] = this._kf.process(rla, rln, acc, tNow, kmhRaw === null ? 0 : kmhRaw / 3.6);
        let kmh = kmhRaw === null ? 0 : kmhRaw;

        this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
        if (this.dom.isLoc) this.dom.isLoc.textContent = `${la.toFixed(4)}, ${ln.toFixed(4)}`;

        this.map.pushFix(la, ln, acc, heading, kmh);
        this.fx.onFix(la, ln, kmh, heading, acc);
        this.render();
      },
      err => {},
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    );
  }

  render() {
    const spd = Math.round(this.state.spd);
    if (this.dom.spdVal) this.dom.spdVal.textContent = spd;
  }

  startLoop() {
    const loop = () => {
      this.map.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

const _R = 6371000, _rad = Math.PI / 180;
const hav = (a, b, c, d) => {
  const dl = (c - a) * _rad, dn = (d - b) * _rad;
  const x = Math.sin(dl / 2) ** 2 + Math.cos(a * _rad) * Math.cos(c * _rad) * Math.sin(dn / 2) ** 2;
  return 2 * _R * Math.asin(Math.sqrt(x));
};
const bearingTo = (a, b, c, d) => {
  const y = Math.sin((d - b) * _rad) * Math.cos(c * _rad);
  const x = Math.cos(a * _rad) * Math.sin(c * _rad) - Math.sin(a * _rad) * Math.cos(c * _rad) * Math.cos((d - b) * _rad);
  return (Math.atan2(y, x) / _rad + 360) % 360;
};
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(m / 10) * 10) + ' m';
const fmtDur = s => { const m = Math.max(1, Math.round(s / 60)); return m >= 60 ? Math.floor(m / 60) + ' sa ' + String(m % 60).padStart(2, '0') + ' dk' : m + ' dk'; };

function toast(msg, ms = 3200) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}

class Features {
  constructor(app) {
    this.app = app; this.cfg = app.cfg; this.rm = app.map;
    this.route = null; this.dest = null;
    this.routeL = L.layerGroup().addTo(this.rm.map);
    this._initOfflineCompassUI();
  }

  _initOfflineCompassUI() {
    if ($('offline-compass-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'offline-compass-badge';
    badge.innerHTML = `<span id="offline-arrow">⬆</span> <span id="offline-txt">Hedef Yönü</span>`;
    document.body.appendChild(badge);
    this.offlineBadge = badge;
  }

  updateOfflineCompass(la, ln) {
    if (!this.dest || !this.offlineBadge) return;
    if (navigator.onLine && this.route && !this.route.approx) {
      this.offlineBadge.style.display = 'none';
      return;
    }
    const targetBrg = bearingTo(la, ln, this.dest.la, this.dest.ln);
    const myHdg = this.rm._hd || 0;
    const relAngle = (targetBrg - myHdg + 360) % 360;
    const dist = hav(la, ln, this.dest.la, this.dest.ln);

    const arrow = $('offline-arrow');
    const txt = $('offline-txt');
    if (arrow) arrow.style.transform = `rotate(${relAngle}deg)`;
    if (txt) txt.textContent = `Çevrimdışı Yön: ${fmtDist(dist)}`;
    this.offlineBadge.style.display = 'flex';
  }

  onFix(la, ln, kmh, hdg, acc) {
    this.updateOfflineCompass(la, ln);
  }

  async search(q) {
    const res = $('dest-res'); if (!res) return;
    res.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary)">🔍 Aranıyor...</div>';
    try {
      const list = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=tr&q=${encodeURIComponent(q)}`);
      if (!list || !list.length) return res.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary)">Sonuç bulunamadı.</div>';
      res.innerHTML = '';
      list.forEach(it => {
        const b = document.createElement('button');
        b.className = 'dest-row';
        b.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);">${esc(it.display_name.split(',')[0])}</div>`;
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(+it.lat, +it.lon, it.display_name.split(',')[0]); });
        res.appendChild(b);
      });
    } catch (_) {}
  }

  setDestination(la, ln, name) {
    this.dest = { la, ln, name };
    store.set('rp_dest', JSON.stringify(this.dest));

    let hist = (() => { const h = store.json('rp_dest_history', []); return Array.isArray(h) ? h : []; })();
    hist = hist.filter(item => item.name !== name);
    hist.unshift({ la, ln, name, time: Date.now() });
    store.set('rp_dest_history', JSON.stringify(hist.slice(0, 5)));

    this.rm.setDestinationPin(la, ln, name);
    this.fetchRoute();
  }

  async fetchRoute() {
    const d = this.dest; if (!d) return;
    const a = this.app.state;
    let sl = a.lat || 39.92, sn = a.lng || 32.85;

    const q = `${sn},${sl};${d.ln},${d.la}?overview=full&geometries=geojson&steps=true`;
    try {
      const j = await fetchJSON('https://router.project-osrm.org/route/v1/driving/' + q);
      if (j.code === 'Ok' && j.routes && j.routes[0]) this.buildRoute(j.routes[0]);
    } catch (_) {
      toast('İnternet yok, çevrimdışı pusula devreye girdi.');
    }
  }

  buildRoute(r) {
    const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
    this.routeL.clearLayers();
    L.polyline(pts, { color: '#2d7aff', weight: 7, opacity: 1, lineCap: 'round' }).addTo(this.routeL);
    this.route = { pts, dist: r.distance, dur: r.duration };
    const nb = $('nav-banner'); if (nb) nb.style.display = 'flex';
  }

  clearRoute() {
    this.route = null; this.dest = null; store.set('rp_dest', 'null');
    this.routeL.clearLayers(); this.rm.destMarkerL.clearLayers();
    if (this.offlineBadge) this.offlineBadge.style.display = 'none';
    const nb = $('nav-banner'); if (nb) nb.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof L === 'undefined') {
    _killSplashNow();
    return;
  }
  window.rotaProApp = new AppManager();
});