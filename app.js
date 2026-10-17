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
setTimeout(_killSplashNow, 6000); // 5 saniye açılış süresi için güvenli fallback

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

/* ═══════ Config (Araba Entegrasyonlu) ═══════ */
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

      L.control.attribution({ prefix: false, position: 'bottomright' }).addTo(this.map);
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

  pushFix(la, ln, ac, hdg, kmh) {
    if (this.init && Number.isFinite(ac) && ac > 300) return;
    this.pos = [la, ln];
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
      if (d >= 2) {
        this._lastMoveHdg = bearingTo(this._prevPos[0], this._prevPos[1], la, ln);
      }
    }
    this._prevPos = [la, ln];

    let candidate = null;
    if (Number.isFinite(hdg) && hdg >= 0 && kmh > 2.5) {
      candidate = hdg;
    } else if (this._lastMoveHdg !== null && kmh > 3) {
      candidate = this._lastMoveHdg;
    }

    if (candidate !== null) {
      const dAngle = Math.abs(((candidate - this._targetHd + 540) % 360) - 180);
      if (dAngle > 1.2 || !this._hasHd) {
        this._targetHd = (candidate % 360 + 360) % 360;
        this._hd = this._targetHd;
        this._hasHd = true;
        if (this.meEl) this.meEl.classList.add('has-hd');
      }
    }
    this._syncRecenter();
  }

  frame() {
    if (this.disp && this.pos) {
      const dla = this.pos[0] - this.disp[0], dln = this.pos[1] - this.disp[1];
      if (Math.abs(dla) > 1e-8 || Math.abs(dln) > 1e-8) {
        const k = 0.16;
        this.disp = [this.disp[0] + dla * k, this.disp[1] + dln * k];
        this.meMarker.setLatLng(this.disp);
        if (this.following) this.map.setView(this.disp, this.map.getZoom(), { animate: false });
      }
    }

    const shouldRotate = this.cfg.rotateMode && this.following && this._hasHd;
    const mapRotEl = this.mapRot || $('map-rot');
    const meRotEl = $('me-rot');
    const compassNeedle = $('compass-needle');

    if (shouldRotate) {
      const targetMap = -this._targetHd;
      const diffMap = ((targetMap - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.12;

      if (mapRotEl) mapRotEl.style.transform = `rotate(${this._renderMapAngle.toFixed(2)}deg)`;
      if (meRotEl) meRotEl.style.transform = 'rotate(0deg)';
    } else {
      const diffMap = ((0 - this._renderMapAngle + 540) % 360) - 180;
      this._renderMapAngle += diffMap * 0.15;

      if (mapRotEl) mapRotEl.style.transform = `rotate(${this._renderMapAngle.toFixed(2)}deg)`;
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
    L.circleMarker([la, ln], {
      radius: 10, color: '#ffffff', weight: 2.5,
      fillColor: '#2d7aff', fillOpacity: 1.0
    }).addTo(this.destMarkerL).bindPopup(title).openPopup();
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
    if (compassBtn) {
      compassBtn.classList.toggle('active', isRot);
    }
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

    if ($('cfg-as'))$('cfg-as').checked = this.cfg.autoStart;
    if ($('cfg-ac'))$('cfg-ac').checked = this.cfg.autoCenter;
    if ($('cfg-rot'))$('cfg-rot').checked = this.cfg.rotateMode;
    if ($('cfg-snd'))$('cfg-snd').checked = this.cfg.soundOn;
    if ($('cfg-tts'))$('cfg-tts').checked = this.cfg.ttsOn;
    if ($('cfg-wk'))$('cfg-wk').checked = this.cfg.wakeOn;
    if ($('cfg-lt'))$('cfg-lt').checked = this.cfg.lightTheme;
    if ($('cfg-thr'))$('cfg-thr').value = this.cfg.threshold;
    if ($('cfg-lights'))$('cfg-lights').checked = this.cfg.showLights;
    if ($('cfg-cams'))$('cfg-cams').checked = this.cfg.showCams;
    if ($('cfg-works'))$('cfg-works').checked = this.cfg.showWorks;
    if ($('cfg-vehicle'))$('cfg-vehicle').value = this.cfg.vehicle;
    if ($('cfg-fuel-price'))$('cfg-fuel-price').value = this.cfg.fuelPrice;
    if ($('cfg-show-fuel'))$('cfg-show-fuel').checked = this.cfg.showFuel;
    if ($('cfg-car-name'))$('cfg-car-name').value = this.cfg.carName;

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

    $('btn-zoom-in')?.addEventListener('click', () => {
      if (this.map && this.map.map) this.map.map.zoomIn();
    });
    $('btn-zoom-out')?.addEventListener('click', () => {
      if (this.map && this.map.map) this.map.map.zoomOut();
    });

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

    $('btn-theme')?.addEventListener('click', () => {
      const light = !document.body.classList.contains('light-theme');
      if ($('cfg-lt')) $('cfg-lt').checked = light;
      this.map.setTheme(light);
      save();
    });

    $('btn-refresh-status')?.addEventListener('click', () => this.fx.testServices());

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
    this._watchId = navigator.geolocation.watchPosition(
      pos => {
        _killSplashNow();
        const { latitude: la, longitude: ln, speed, heading, accuracy } = pos.coords;
        const kmh = (speed !== null && Number.isFinite(speed) && speed > 0) ? speed * 3.6 : 0;
        this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
        
        if (this.dom.ftDot) this.dom.ftDot.classList.add('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = `${this.cfg.carName} (GPS Aktif)`;
        if (this.dom.isLoc) this.dom.isLoc.textContent = `${la.toFixed(4)}, ${ln.toFixed(4)}`;

        this.map.pushFix(la, ln, accuracy, heading, kmh);
        this.fx.onFix(la, ln, kmh, pos.coords.altitude, heading, accuracy);
        this.render();
      },
      err => {
        if (this.dom.ftDot) this.dom.ftDot.classList.remove('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent =
          err && err.code === 1 ? 'Konum İzni Reddedildi — Ayarlardan izin ver' :
          err && err.code === 3 ? 'GPS Sinyali Aranıyor...' :
          err && err.code === 2 ? 'Konum Alınamıyor' : 'Konum İzni Bekleniyor';
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
  }

  render() {
    const spd = Math.round(this.state.spd);
    if (this.dom.spdVal) this.dom.spdVal.textContent = spd;
    if (this.dom.spdBar) this.dom.spdBar.style.transform = `scaleX(${clamp(spd / 120, 0, 1)})`;
  }

  startLoop() {
    const loop = () => {
      this.map.frame();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

/* ═══════ Yardımcılar ═══════ */
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
const angDiff = (a, b) => Math.abs(((a - b) + 540) % 360 - 180);
const fmtDist = m => m >= 1000 ? (m / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(m / 10) * 10) + ' m';
const fmtDur = s => { const m = Math.max(1, Math.round(s / 60)); return m >= 60 ? Math.floor(m / 60) + ' sa ' + String(m % 60).padStart(2, '0') + ' dk' : m + ' dk'; };

function toast(msg, ms = 3200) {
  let t = $('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}


/* ═══════ Müzik: Spotify (uzaktan kumanda) / YouTube Music (uygulamada aç) ═══════ */
class MusicController {
  constructor() {
    const c = store.json('rp_music', {});
    this.src = c.src === 'ytm' ? 'ytm' : 'spotify';
    this.clientId = c.clientId || '';
    this.tok = store.json('rp_sp_tok', null);
    this.playing = false;
    this.title = '';
    this.redirect = location.origin + location.pathname;
    this.links = { spotify: 'https://open.spotify.com/', ytm: 'https://music.youtube.com/' };
    this._busy = false;
    this._bind();
    this._render();
    this._handleRedirect().finally(() => { this._render(); this._poll(); });
    setInterval(() => { if (!document.hidden) this._poll(); }, 6000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this._poll(); });
  }

  _save() { store.set('rp_music', JSON.stringify({ src: this.src, clientId: this.clientId })); }
  get connected() { return !!(this.tok && this.tok.r); }
  get remote() { return this.src === 'spotify' && this.connected; }

  _bind() {
    $('ms-spotify')?.addEventListener('click', () => { this.src = 'spotify'; this._save(); this._render(); this._poll(); });
    $('ms-ytm')?.addEventListener('click', () => { this.src = 'ytm'; this._save(); this._render(); });
    $('ms-open')?.addEventListener('click', () => this.openApp());
    $('ms-login')?.addEventListener('click', () => this.connected ? this.logout() : this.login());
  }

  _render() {
    const sp = this.src === 'spotify', rem = this.remote;
    $('ms-spotify')?.classList.toggle('on', sp);
    $('ms-ytm')?.classList.toggle('on', !sp);
    const show = (id, v) => { const e = $(id); if (e) e.style.display = v ? '' : 'none'; };
    show('mw-prev', rem); show('mw-next', rem);
    show('ms-login', sp);
    const lg = $('ms-login'); if (lg) lg.textContent = this.connected ? 'Bağlantıyı Kes' : 'Spotify\'a Bağlan';
    const pl = $('mw-play');
    if (pl) pl.textContent = rem ? (this.playing ? '⏸' : '▶') : '↗';
    const t = $('mw-title'), sub = $('mw-sub');
    if (t) t.textContent = rem && this.title ? this.title : (sp ? 'Spotify' : 'YouTube Music');
    if (sub) sub.textContent = rem ? 'Spotify uzaktan kumanda aktif'
      : sp ? 'Uygulamayı aç veya kumanda için bağlan'
      : 'Çalma için uygulamayı aç (kumanda araç/kulaklıktan)';
  }

  openApp() {
    // https bağlantısı: yüklüyse mobil uygulama açılır, değilse web sayfası
    window.open(this.links[this.src], '_blank', 'noopener');
  }

  /* ── Spotify OAuth (PKCE, sunucusuz) ── */
  _b64u(buf) { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }

  async login() {
    if (!this.clientId) {
      const v = prompt('Spotify Client ID gir (developer.spotify.com/dashboard).\nUygulamaya şu Redirect URI eklenmeli:\n' + this.redirect, '');
      if (!v || !v.trim()) return;
      this.clientId = v.trim(); this._save();
    }
    try {
      const ver = this._b64u(crypto.getRandomValues(new Uint8Array(48)));
      const ch = this._b64u(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ver)));
      const st = this._b64u(crypto.getRandomValues(new Uint8Array(12)));
      store.set('rp_sp_ver', ver); store.set('rp_sp_state', st);
      const p = new URLSearchParams({
        client_id: this.clientId, response_type: 'code', redirect_uri: this.redirect,
        code_challenge_method: 'S256', code_challenge: ch, state: st,
        scope: 'user-read-playback-state user-modify-playback-state user-read-currently-playing'
      });
      location.href = 'https://accounts.spotify.com/authorize?' + p;
    } catch (_) { toast('Bağlantı başlatılamadı (HTTPS gerekli)'); }
  }

  logout() {
    this.tok = null; this.playing = false; this.title = '';
    try { localStorage.removeItem('rp_sp_tok'); } catch (_) {}
    this._render(); toast('Spotify bağlantısı kesildi');
  }

  async _token(body) {
    const r = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, ...body })
    });
    if (!r.ok) throw new Error('token ' + r.status);
    const j = await r.json();
    this.tok = { a: j.access_token, r: j.refresh_token || (this.tok && this.tok.r), exp: Date.now() + (j.expires_in - 60) * 1000 };
    store.set('rp_sp_tok', JSON.stringify(this.tok));
  }

  async _handleRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), ver = store.get('rp_sp_ver');
    if (q.get('error') && store.get('rp_sp_state')) { history.replaceState({}, '', location.pathname); toast('Spotify izni verilmedi'); return; }
    if (!code || !ver) return;
    const okState = q.get('state') && q.get('state') === store.get('rp_sp_state');
    history.replaceState({}, '', location.pathname);
    try { localStorage.removeItem('rp_sp_ver'); localStorage.removeItem('rp_sp_state'); } catch (_) {}
    if (!okState) { toast('Spotify doğrulaması başarısız'); return; }
    try { await this._token({ grant_type: 'authorization_code', code, redirect_uri: this.redirect, code_verifier: ver }); toast('🎵 Spotify bağlandı'); }
    catch (_) { toast('Spotify bağlantısı kurulamadı'); }
  }

  async _ensure() {
    if (!this.connected) return false;
    if (this.tok.a && Date.now() < this.tok.exp) return true;
    try { await this._token({ grant_type: 'refresh_token', refresh_token: this.tok.r }); return true; }
    catch (_) { this.logout(); return false; }
  }

  async _api(method, path) {
    if (!(await this._ensure())) return null;
    try {
      const r = await fetch('https://api.spotify.com/v1' + path, { method, headers: { Authorization: 'Bearer ' + this.tok.a } });
      if (r.status === 204 || r.status === 202) return {};
      if (r.status === 404) { toast('Aktif Spotify cihazı yok — Spotify uygulamasında bir şarkı başlat'); return null; }
      if (r.status === 403) { toast('Spotify Premium ve izinli hesap gerekli'); return null; }
      if (r.status === 429) { toast('Spotify istek sınırı — biraz bekle'); return null; }
      if (!r.ok) return null;
      return await r.json().catch(() => ({}));
    } catch (_) { return null; }
  }

  async _poll() {
    if (!this.remote || this._busy) return;
    const j = await this._api('GET', '/me/player/currently-playing');
    if (j === null) return;
    this.playing = !!j.is_playing;
    this.title = j.item ? `${j.item.name} — ${(j.item.artists || []).map(a => a.name).join(', ')}` : '';
    this._render();
    this._mediaMeta();
  }

  _mediaMeta() {
    if (!('mediaSession' in navigator) || !this.title) return;
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: this.title, artist: 'Spotify', album: 'RotaPro' }); } catch (_) {}
  }

  async _act(fn) {
    if (!this.remote) { this.openApp(); return; }
    this._busy = true;
    try { await fn(); } finally { this._busy = false; }
    setTimeout(() => this._poll(), 700);
  }

  toggle() {
    return this._act(async () => {
      const was = this.playing;
      const r = await this._api('PUT', was ? '/me/player/pause' : '/me/player/play');
      if (r) { this.playing = !was; this._render(); toast(was ? '⏸ Müzik duraklatıldı' : '🎵 Müzik çalıyor', 1500); }
    });
  }
  play() { if (!this.remote) { toast('Kumanda için Spotify\'a bağlan veya uygulamayı elle aç'); return; } return this.playing ? null : this.toggle(); }
  pause() { return this.remote && this.playing ? this.toggle() : null; }
  next() { return this._act(() => this._api('POST', '/me/player/next')); }
  prev() { return this._act(() => this._api('POST', '/me/player/previous')); }
}

/* ═══════ Features (Araba Tam Entegrasyonu) ═══════ */
class Features {
  constructor(app) {
    this.app = app; this.cfg = app.cfg; this.rm = app.map;
    this.s = { max: 0, sum: 0, n: 0, dist: 0 };
    this.prev = null; this.hd = null;
    this.limit = null; this.limAt = { t: 0, la: 0, ln: 0 };
    this.wxAt = 0; this.geoAt = { t: 0, la: 0, ln: 0 };
    this.osm = []; this.poiAt = { t: 0, la: 0, ln: 0 };
    this.alerted = new Map(); this.lastBeep = 0; this.lastSpeak = 0;
    this.route = null; this.dest = null; this.pendingDest = null; this.pendingSave = null;
    this.off = 0; this.lastReroute = 0; this.lowSince = 0;
    this.audioCtx = null;
    this.routeL = L.layerGroup().addTo(this.rm.map);
    this.trackL = L.layerGroup().addTo(this.rm.map);

    this.music = new MusicController();

    const unlock = () => {
      try {
        this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
          this.audioCtx.resume();
        }
      } catch (_) {}
    };
    ['touchstart', 'touchend', 'click', 'pointerdown'].forEach(ev => {
      document.addEventListener(ev, unlock, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        app.enableWakeLock();
        unlock();
      }
    });

    this.setupMediaSession();
    
    $('nb-x')?.addEventListener('click', () => this.clearRoute());
    $('dest-clear')?.addEventListener('click', () => { this.app.destSheet.close(); this.clearRoute(); });
    $('btn-trail')?.addEventListener('click', () => this.toggleRecord());
    $('btn-park')?.addEventListener('click', () => this.toggleParkLocation());
    $('btn-hud')?.addEventListener('click', () => this.toggleHUD());
    $('btn-voice')?.addEventListener('click', () => this.startVoiceCommand());
    $('btn-share-eta')?.addEventListener('click', () => this.shareETA());
    $('btn-share-pos')?.addEventListener('click', () => this.shareETA());

    $('mw-play')?.addEventListener('click', () => this.toggleMusicPlay());
    $('mw-next')?.addEventListener('click', () => this.nextTrack());
    $('mw-prev')?.addEventListener('click', () => this.prevTrack());
    
    this.updateFuel();
    this.updateCarIntegration();
    try { const d = JSON.parse(store.get('rp_dest') || 'null'); if (d) setTimeout(() => this.setDestination(d.la, d.ln, d.name), 1200); } catch (_) {}
  }

  updateCarIntegration() {
    if ($('ft-gps')) {
      $('ft-gps').textContent = `${this.cfg.carName} (GPS Aktif)`;
    }
    this.setupMediaSession();
  }

  setupMediaSession() {}

  toggleMusicPlay() { this.music.toggle(); }
  playMusic() { this.music.play(); }
  pauseMusic() { this.music.pause(); }
  nextTrack() { this.music.next(); }
  prevTrack() { this.music.prev(); }

  beep(freq = 880, ms = 160, times = 1) {
    if (!this.cfg.soundOn || !this.audioCtx) return;
    for (let i = 0; i < times; i++) {
      try {
        const o = this.audioCtx.createOscillator(), g = this.audioCtx.createGain();
        o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.18;
        o.connect(g); g.connect(this.audioCtx.destination);
        const t0 = this.audioCtx.currentTime + i * (ms + 90) / 1000;
        o.start(t0); o.stop(t0 + ms / 1000);
      } catch (_) {}
    }
  }

  speak(txt, gap = 3500) {
    if (!this.cfg.ttsOn || !('speechSynthesis' in window)) return;
    if (Date.now() - this.lastSpeak < gap) return;
    this.lastSpeak = Date.now();
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(txt);
      u.lang = 'tr-TR';
      u.rate = 1.05;
      const voices = speechSynthesis.getVoices ? speechSynthesis.getVoices() : [];
      const trVoice = voices.find(v => v.lang && (v.lang.startsWith('tr') || v.lang.includes('TR')));
      if (trVoice) u.voice = trVoice;
      speechSynthesis.speak(u);
    } catch (_) {}
  }

  toggleHUD() {
    const isHud = document.body.classList.toggle('hud-mode');
    let exitBtn = $('btn-exit-hud');
    if (isHud && !exitBtn) {
      exitBtn = document.createElement('button');
      exitBtn.id = 'btn-exit-hud';
      exitBtn.innerHTML = '✕';
      exitBtn.title = 'HUD Modundan Çık';
      exitBtn.addEventListener('click', () => this.toggleHUD());
      document.body.appendChild(exitBtn);
    }
    toast(isHud ? 'HUD Modu Aktif (Ön Cam Görünümü)' : 'Normal Moda Dönüldü');
  }

  startVoiceCommand() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast('Tarayıcınız sesli komutları desteklemiyor.');
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.interimResults = false;
      
      toast('🎤 Dinleniyor... Konuşun');
      this.speak('Dinliyorum', 0);
      
      recognition.onresult = event => {
        const text = event.results[0][0].transcript.toLowerCase();
        toast(`🗣️ "${text}"`);
        
        if (text.includes('eve git') || text.includes('eve götür')) {
          this.quickDest('Ev');
        } else if (text.includes('işe git') || text.includes('iş yerine')) {
          this.quickDest('İş Yeri');
        } else if (text.includes('benzin') || text.includes('yakıt') || text.includes('istasyon')) {
          this.quickDest('Benzin İstasyonu');
        } else if (text.includes('otopark') || text.includes('park yeri')) {
          this.quickDest('Otopark');
        } else if (text.includes('müzik aç') || text.includes('oynat')) {
          this.playMusic();
        } else if (text.includes('müzik kapat') || text.includes('durdur')) {
          this.pauseMusic();
        } else if (text.includes('sonraki şarkı')) {
          this.nextTrack();
        } else if (text.includes('hastane')) {
          this.quickDest('Hastane');
        } else if (text.includes('hud') || text.includes('ön cam')) {
          this.toggleHUD();
        } else if (text.includes('rotayı sil') || text.includes('iptal et')) {
          this.clearRoute();
          toast('Rota iptal edildi.');
        } else {
          this.search(text, true);
        }
      };
      
      recognition.onerror = () => toast('Ses algılanamadı, tekrar deneyin.');
      recognition.start();
    } catch (_) {
      toast('Sesli komut başlatılamadı.');
    }
  }

  shareETA() {
    if (!navigator.share) return toast('Tarayıcınız paylaşım özelliğini desteklemiyor.');
    const d = this.dest;
    const etaText = this.route ? `Hedefim: ${d ? d.name : 'Belirleniyor'}. Tahmini varış sürem ve rotadayım!` : `${this.cfg.carName} ile yoldayım!`;
    
    navigator.share({
      title: 'RotaPro Canlı Konum',
      text: `🚗 ${etaText} Konumum: https://maps.google.com/?q=${this.app.state.lat},${this.app.state.lng}`,
    }).catch(() => {});
  }

  toggleParkLocation() {
    const saved = store.get('rp_parked');
    if (!saved || saved === 'null') {
      const la = this.app.state.lat, ln = this.app.state.lng;
      if (!la || !ln) return toast('GPS konumu henüz alınamadı.');
      store.set('rp_parked', JSON.stringify({ la, ln, time: Date.now() }));
      toast('🅿️ Park konumu kaydedildi!');
      this.speak('Park konumu kaydedildi', 0);
    } else {
      const p = JSON.parse(saved);
      if (confirm('Kayıtlı park yerine rota çizilsin mi?')) {
        this.setDestination(p.la, p.ln, '🅿️ Park Edilen Araç');
      } else if (confirm('Park konumunu hafızadan silmek istiyor musunuz?')) {
        store.set('rp_parked', 'null');
        toast('Park konumu silindi.');
      }
    }
  }

  onFix(la, ln, kmh, alt, hdg, acc) {
    const now = Date.now(), s = this.s;
    if (this.prev) {
      const dd = hav(this.prev[0], this.prev[1], la, ln);
      if (dd > 3 && dd < 500 && kmh > 1) { s.dist += dd; if (this.rec) this.rec.dist += dd; }
    }
    this.prev = [la, ln];
    if (kmh > 1) { s.sum += kmh; s.n++; }
    s.max = Math.max(s.max, kmh);
    if (Number.isFinite(hdg) && kmh > 3) this.hd = hdg;

    const set = (id, v) => { const e = $(id); if (e) e.textContent = v; };
    set('ss-max', Math.round(s.max)); set('ss-avg', s.n ? Math.round(s.sum / s.n) : 0); set('ss-trip', (s.dist / 1000).toFixed(1));
    set('m-alt', Number.isFinite(alt) ? Math.round(alt) + ' m' : '--');
    set('m-acc', Number.isFinite(acc) ? '±' + Math.round(acc) + ' m' : '--');
    if (this.hd !== null) set('m-dir', ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'][Math.round(this.hd / 45) % 8] + ' ' + Math.round(this.hd) + '°');
    store.set('rp_last', JSON.stringify([la, ln]));
    this.updateFuel();

    if (now - this.wxAt > 600000) { this.wxAt = now; this.weather(la, ln); }
    if (now - this.geoAt.t > 25000 && hav(la, ln, this.geoAt.la, this.geoAt.ln) > 40) { this.geoAt = { t: now, la, ln }; this.reverse(la, ln); }
    if (now - this.limAt.t > 12000 && (hav(la, ln, this.limAt.la, this.limAt.ln) > 120 || now - this.limAt.t > 60000)) { this.limAt = { t: now, la, ln }; this.fetchLimit(la, ln); }
    if (now - this.poiAt.t > 600000 || hav(la, ln, this.poiAt.la, this.poiAt.ln) > 1500) { this.poiAt = { t: now, la, ln }; this.fetchPOIs(la, ln); }

    this.checkSpeed(kmh);
    this.checkProximity(la, ln, kmh);
    if (this.pendingDest && !this.route) { const p = this.pendingDest; this.pendingDest = null; this.setDestination(p.la, p.ln, p.name); }
    if (this.route) this.navTick(la, ln);
    if (this.rec) this.recTick(la, ln);
  }

  async weather(la, ln) {
    try {
      const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,wind_speed_10m&wind_speed_unit=kmh`);
      const c = j.current;
      if ($('is-temp'))$('is-temp').textContent = Math.round(c.temperature_2m) + '°C';
      if ($('is-wind'))$('is-wind').textContent = Math.round(c.wind_speed_10m) + ' km/s';
    } catch (_) { this.wxAt = Date.now() - 540000; }
  }

  async reverse(la, ln) {
    try {
      const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&accept-language=tr&lat=${la}&lon=${ln}`);
      const a = j.address || {};
      const road = a.road || a.pedestrian || a.suburb || j.name;
      if (road && this.app.dom.hdrRoad) this.app.dom.hdrRoad.textContent = road;
      const area = a.suburb || a.city_district || a.town || a.city || a.county;
      if (area && this.app.dom.isLoc) this.app.dom.isLoc.textContent = area;
    } catch (_) {}
  }

  async fetchLimit(la, ln) {
    try {
      const q = `[out:json][timeout:6];way(around:40,${la},${ln})[highway];out tags;`;
      const j = await fetchOverpass(q, 8000);
      const skip = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway'];
      const ways = (j.elements || []).filter(w => w.tags && !skip.includes(w.tags.highway));
      if (!ways.length) return;
      const defaults = { motorway: 120, motorway_link: 80, trunk: 110, trunk_link: 70, primary: 90, secondary: 90, tertiary: 70, residential: 50, unclassified: 70, living_street: 20, service: 30 };
      let lim = null;
      for (const w of ways) {
        const m = w.tags.maxspeed;
        if (m) { lim = /urban/.test(m) ? 50 : /rural/.test(m) ? 90 : /motorway/.test(m) ? 120 : parseInt(m, 10) || null; if (lim) break; }
      }
      if (!lim) lim = defaults[ways[0].tags.highway] || null;
      this.setLimit(lim);
    } catch (_) {}
  }

  setLimit(v) {
    this.limit = v;
    const b = this.app.dom.limBadge, n = this.app.dom.limNum;
    if (!b || !n) return;
    if (v) { n.textContent = v; b.classList.remove('off'); } else b.classList.add('off');
  }

  checkSpeed(kmh) {
    const dash = this.app.dom.speedDash, ovr = $('ovr');
    const over = !!this.limit && kmh > this.limit * (1 + this.cfg.threshold / 100);
    const warn = !!this.limit && kmh > this.limit && !over;
    if (dash) {
      dash.classList.toggle('over', over);
      dash.classList.toggle('warn', warn);
    }
    if (ovr) ovr.classList.toggle('on', over);
    if (over) {
      const now = Date.now();
      if (now - this.lastBeep > 4000) { this.lastBeep = now; this.beep(1000, 140, 2); }
      this.speak(`Hız sınırını aşıyorsunuz. Sınır ${this.limit}`, 15000);
    }
    const trf = $('m-trf');
    if (trf && this.limit && this.limit >= 50) {
      if (kmh > 1 && kmh < this.limit * 0.4) { this.lowSince = this.lowSince || Date.now(); }
      else this.lowSince = 0;
      const slow = this.lowSince && Date.now() - this.lowSince > 20000;
      trf.textContent = slow ? 'Yoğun' : kmh > 1 && kmh < this.limit * 0.7 ? 'Orta' : 'Akıcı';
      trf.style.color = slow ? 'var(--red)' : kmh > 1 && kmh < this.limit * 0.7 ? 'var(--yellow)' : 'var(--green)';
    }
  }

  async fetchPOIs(la, ln) {
    try {
      const q = `[out:json][timeout:8];(node(around:5000,${la},${ln})[highway=speed_camera];node(around:3000,${la},${ln})[highway=traffic_signals];);out 300;`;
      const j = await fetchOverpass(q, 10000);
      this.osm = (j.elements || []).map(e => ({ lat: e.lat, lng: e.lon, kind: e.tags && e.tags.highway === 'speed_camera' ? 'cam' : 'light', osm: true }));
      this.refreshPOIs();
    } catch (_) { this.poiAt.t = Date.now() - 540000; }
  }

  refreshPOIs() { this.rm.setPOIs(this.app.state.poi.concat(this.osm), this.cfg); }

  checkProximity(la, ln, kmh) {
    const heading = this.hd !== null ? this.hd : this.rm._hd;
    const now = Date.now();
    const names = { 
      cam: 'Radar', 
      pothole: 'Çukur / Yol Bozukluğu', 
      work: 'Yol Çalışması', 
      accident: 'Kaza Tehlikesi', 
      closed: 'Kapalı Yol Uyarısı', 
      oneway: 'Tek Yön Değişikliği' 
    };
    for (const p of this.app.state.poi.concat(this.osm)) {
      if (!names[p.kind]) continue;
      if (p.kind === 'cam' && !this.cfg.showCams) continue;
      const d = hav(la, ln, p.lat, p.lng);
      if (d > 500) continue;
      if (kmh > 8 && heading != null && angDiff(bearingTo(la, ln, p.lat, p.lng), heading) > 80) continue;
      const key = p.lat.toFixed(5) + p.lng.toFixed(5);
      if (now - (this.alerted.get(key) || 0) < 120000) continue;
      this.alerted.set(key, now);
      const txt = `${names[p.kind]} ${Math.round(d / 50) * 50} metre ileride`;
      toast('⚠️ ' + txt, 4000); this.beep(700, 200, 3); this.speak(txt, 1500);
    }
  }

  updateFuel() {
    const v = $('m-fuel'); if (!v) return;
    const box = v.parentElement; if (box) box.style.display = this.cfg.showFuel ? '' : 'none';
    if (!this.cfg.showFuel) return;
    const l100 = { benzin: 7.5, dizel: 6, lpg: 9.5, elektrik: 16 }[this.cfg.vehicle] || 7.5;
    const amt = this.s.dist / 1000 * l100 / 100;
    v.textContent = amt.toFixed(2) + (this.cfg.vehicle === 'elektrik' ? ' kWh' : ' L');
    const lbl = $('m-fuel-lbl'); if (lbl) lbl.textContent = '₺' + (amt * this.cfg.fuelPrice).toFixed(0) + ' YAKIT';
  }

  resetTrip() {
    this.app.state.startTime = Date.now();
    this.s = { max: 0, sum: 0, n: 0, dist: 0 };
    ['ss-max', 'ss-avg'].forEach(i => { if ($(i))$(i).textContent = '0'; });
    if ($('ss-trip'))$('ss-trip').textContent = '0.0';
    this.updateFuel(); toast('Sürüş istatistikleri sıfırlandı.');
  }

  async search(q, nearby) {
    const res = $('dest-res'); if (!res) return;
    const msg = (t, c) => res.innerHTML = `<div style="text-align:center;padding:12px;color:${c || 'var(--text-secondary)'}">${t}</div>`;
    msg('🔍 Aranıyor...');
    const la = this.app.state.lat, ln = this.app.state.lng;
    let url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&accept-language=tr&q=${encodeURIComponent(q)}`;
    if (la != null) { const dl = nearby ? 0.15 : 0.6; url += `&viewbox=${ln - dl},${la + dl},${ln + dl},${la - dl}` + (nearby ? '&bounded=1' : ''); }
    try {
      let list = await fetchJSON(url, 9000);
      if (!list || !list.length) return msg('Sonuç bulunamadı.');
      list = list.map(i => ({ la: +i.lat, ln: +i.lon, name: i.display_name, d: la != null ? hav(la, ln, +i.lat, +i.lon) : null }));
      if (nearby && la != null) list.sort((a, b) => a.d - b.d);
      res.innerHTML = '';
      list.forEach(it => {
        const b = document.createElement('button');
        b.className = 'dest-row';
        const parts = it.name.split(',');
        const mainTitle = parts[0].trim();
        const subTitle = parts.slice(1, 4).join(',').trim();
        const distBadge = it.d != null ? `<span style="color:var(--accent);font-weight:700;">${fmtDist(it.d)}</span> · ` : '';
        b.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);">${distBadge}${esc(mainTitle)}</div>` +
                      (subTitle ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(subTitle)}</div>` : '');
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(it.la, it.ln, mainTitle); });
        res.appendChild(b);
      });
    } catch (_) { msg('Arama hatası. Bağlantınızı kontrol edin.', 'var(--red)'); }
  }

  quickDest(q) {
    if (q === 'Ev' || q === 'İş Yeri') {
      const key = q === 'Ev' ? 'rp_home' : 'rp_work';
      const saved = JSON.parse(store.get(key) || 'null');
      if (saved) { this.app.destSheet.close(); return this.setDestination(saved.la, saved.ln, q); }
      this.pendingSave = key; this.app.destSheet.close();
      document.body.classList.add('picking'); this.rm.unfollow();
      return toast(`${q} konumunu haritayı kaydırıp "Burayı Seç" ile belirleyin.`, 4500);
    }
    const map = { 'Hastane': 'hastane', 'AVM': 'alışveriş merkezi', 'Benzin İstasyonu': 'benzin istasyonu', 'Otopark': 'otopark' };
    const inp = $('dest-q'); if (inp) inp.value = q;
    this.search(map[q] || q, true);
  }

  forgetPlace(q) {
    store.set(q === 'Ev' ? 'rp_home' : 'rp_work', 'null'); toast(`${q} konumu silindi.`);
  }

  async onPick() {
    const c = this.rm.map.getCenter();
    if (this.pendingSave) {
      const key = this.pendingSave; this.pendingSave = null;
      store.set(key, JSON.stringify({ la: c.lat, ln: c.lng }));
      toast((key === 'rp_home' ? 'Ev' : 'İş Yeri') + ' kaydedildi.');
      return this.setDestination(c.lat, c.lng, key === 'rp_home' ? 'Ev' : 'İş Yeri');
    }
    let name = 'Seçilen Konum';
    try {
      const j = await fetchJSON(`https://nominatim.openstreetmap.org/reverse?format=json&zoom=17&accept-language=tr&lat=${c.lat}&lon=${c.lng}`, 3500);
      if (j && j.address) {
        name = j.address.road || j.address.suburb || j.address.neighbourhood || j.name || 'Seçilen Konum';
      }
    } catch (_) {}
    this.setDestination(c.lat, c.lng, name);
  }

  setDestination(la, ln, name, waypoint = null) {
    this.dest = { la, ln, name };
    store.set('rp_dest', JSON.stringify(this.dest));

    try {
      let hist = (() => { const h = store.json('rp_dest_history', []); return Array.isArray(h) ? h : []; })();
      hist = hist.filter(item => item.name !== name && hav(item.la, item.ln, la, ln) > 50);
      hist.unshift({ la, ln, name, time: Date.now() });
      store.set('rp_dest_history', JSON.stringify(hist.slice(0, 5)));
    } catch (_) {}

    this.rm.setDestinationPin(la, ln, name);
    this.fetchRoute(true, waypoint);
  }

  async fetchRoute(first, waypoint = null) {
    const d = this.dest; if (!d) return;
    const a = this.app.state;
    let sl = a.lat, sn = a.lng;
    if (sl == null) { try { [sl, sn] = JSON.parse(store.get('rp_last')); } catch (_) {} }
    if (sl == null) { const c = this.rm.map.getCenter(); sl = c.lat; sn = c.lng; }

    let coordsStr = `${sn},${sl};`;
    if (waypoint) {
      coordsStr += `${waypoint.ln},${waypoint.la};`;
    }
    coordsStr += `${d.ln},${d.la}`;

    const q = `${coordsStr}?overview=full&geometries=geojson&steps=true`;
    const hosts = ['https://router.project-osrm.org/route/v1/driving/', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'];
    let route = null;
    for (let t = 0; t < 4 && !route; t++) {
      try {
        const j = await fetchJSON(hosts[t % 2] + q, 10000);
        if (j.code === 'Ok' && j.routes && j.routes[0]) route = j.routes[0];
      } catch (_) {}
    }
    let approx = false;
    if (!route) {
      approx = true;
      const dist = hav(sl, sn, d.la, d.ln) * 1.3;
      route = { distance: dist, duration: dist / 13.9, geometry: { coordinates: [[sn, sl], [d.ln, d.la]] },
        legs: [{ steps: [{ name: '', maneuver: { type: 'depart', location: [sn, sl] } }, { name: '', maneuver: { type: 'arrive', location: [d.ln, d.la] } }] }] };
    }
    this.buildRoute(route, approx);
    if (first || approx) {
      const bounds = L.latLngBounds(this.route.pts);
      this.rm.unfollow();
      this.rm.map.fitBounds(bounds, { padding: [70, 150], animate: true, maxZoom: 17 });
      clearTimeout(this._ft); this._ft = setTimeout(() => { if (this.route && this.rm.pos) this.rm.follow(); }, 4500);
      toast(approx ? 'Yol verisine ulaşılamadı, düz çizgi gösteriliyor.' : `${d.name}: ${fmtDist(this.route.dist)} · ${fmtDur(this.route.dur)}`, approx ? 6000 : 4500);
      if (!approx) this.speak(`Rota hazır. ${fmtDist(this.route.dist)}, yaklaşık ${fmtDur(this.route.dur)}`, 0);
    }
  }

  stepText(st) {
    const m = st.maneuver || {}, mod = m.modifier || '', nm = st.name ? ' — ' + st.name : '';
    const turn = { 'left': 'Sola dönün', 'right': 'Sağa dönün', 'slight left': 'Hafif sola dönün', 'slight right': 'Hafif sağa dönün', 'sharp left': 'Keskin sola dönün', 'sharp right': 'Keskin sağa dönün', 'straight': 'Düz devam edin', 'uturn': 'U dönüşü yapın' };
    switch (m.type) {
      case 'depart': return 'Yola çıkın' + nm;
      case 'arrive': return 'Hedefe vardınız';
      case 'roundabout': case 'rotary': case 'roundabout turn': return `Döner kavşakta ${m.exit || ''}. çıkıştan çıkın` + nm;
      case 'merge': return 'Yola katılın' + nm;
      case 'fork': return (mod.includes('left') ? 'Çatalda sola' : mod.includes('right') ? 'Çatalda sağa' : 'Çatalda düz') + ' gidin' + nm;
      case 'on ramp': case 'off ramp': return 'Bağlantı yoluna girin' + nm;
      case 'end of road': return (turn[mod] || 'Dönün') + nm;
      default: return (turn[mod] || 'Devam edin') + nm;
    }
  }

  buildRoute(r, approx) {
    const pts = r.geometry.coordinates.map(c => [c[1], c[0]]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    const steps = []; let from = 0;
    for (const st of r.legs.flatMap(l => l.steps)) {
      const loc = st.maneuver.location, la = loc[1], ln = loc[0];
      let bi = from, bd = 1e12;
      for (let i = from; i < Math.min(pts.length, from + 400); i++) { const d = hav(la, ln, pts[i][0], pts[i][1]); if (d < bd) { bd = d; bi = i; } }
      from = bi;
      steps.push({ idx: bi, type: st.maneuver.type, mod: st.maneuver.modifier || '', text: this.stepText(st) });
    }
    this.routeL.clearLayers();
    L.polyline(pts, { color: '#ffffff', weight: 11, opacity: 0.9, lineCap: 'round' }).addTo(this.routeL);
    L.polyline(pts, { color: '#2d7aff', weight: 7, opacity: 1, lineCap: 'round' }).addTo(this.routeL);
    this.route = { pts, cum, steps, idx: 0, dist: r.distance, dur: r.duration, approx: !!approx };
    this.off = 0;
    const nb = $('nav-banner'); if (nb) nb.style.display = 'flex';
    const dc = $('dest-clear'); if (dc) dc.style.display = 'block';
    this.navTick(this.app.state.lat, this.app.state.lng);
  }

  navTick(la, ln) {
    const r = this.route; if (!r || la == null) return;
    
    let best = r.idx, bd = 1e12;
    const scanLimit = Math.min(r.pts.length, r.idx + 150);
    for (let i = r.idx; i < scanLimit; i++) {
      const d = hav(la, ln, r.pts[i][0], r.pts[i][1]);
      if (d < bd) { bd = d; best = i; }
    }
    if (bd > 120) {
      let minD = 1e12, bestIdx = r.idx;
      for (let i = 0; i < r.pts.length; i += 2) {
        const d = hav(la, ln, r.pts[i][0], r.pts[i][1]);
        if (d < minD) { minD = d; bestIdx = i; }
      }
      bd = minD;
      best = bestIdx;
    }
    r.idx = best;

    const now = Date.now();
    if (r.approx && now - this.lastReroute > 20000) { this.lastReroute = now; this.fetchRoute(false); }
    if (bd > 70 && !r.approx) { this.off++; } else { this.off = 0; }
    if (this.off >= 4 && now - this.lastReroute > 15000) {
      this.lastReroute = now; this.off = 0; toast('Rotadan çıkıldı, yeniden hesaplanıyor...'); this.speak('Yeniden rota hesaplanıyor', 0); this.fetchRoute(false); return;
    }

    const total = r.cum[r.cum.length - 1], remain = Math.max(0, total - r.cum[best]);
    if (this.dest) {
      const dLa = this.dest.la ?? this.dest.lat;
      const dLn = this.dest.ln ?? this.dest.lng;
      if (remain < 30 || (dLa != null && dLn != null && hav(la, ln, dLa, dLn) < 35)) {
        toast('🏁 Hedefe vardınız', 5000); this.beep(900, 220, 2); this.speak('Hedefe vardınız', 0); return this.clearRoute();
      }
    }

    const st = r.steps.find(s => s.idx > best && s.type !== 'depart') || r.steps[r.steps.length - 1];
    const dd = Math.max(0, r.cum[st.idx] - r.cum[best]);
    if ($('nb-dist'))$('nb-dist').textContent = fmtDist(dd);
    if ($('nb-txt'))$('nb-txt').textContent = st.text;
    if ($('nb-eta'))$('nb-eta').textContent = fmtDur(r.dur * (remain / (r.dist || 1)));
    const ang = { 'left': -90, 'right': 90, 'slight left': -45, 'slight right': 45, 'sharp left': -135, 'sharp right': 135, 'uturn': 180 }[st.mod] || 0;
    const sv = document.querySelector('#nb-arrow svg'); if (sv) sv.style.transform = `rotate(${ang}deg)`;
    if (!st.a1 && dd < 450 && dd > 150) { st.a1 = 1; this.speak(`${Math.round(dd / 50) * 50} metre sonra ${st.text}`, 0); }
    if (!st.a2 && dd < 120) { st.a2 = 1; this.speak(st.text, 0); this.beep(600, 120, 1); }
  }

  clearRoute() {
    this.route = null; this.dest = null; this.pendingDest = null; store.set('rp_dest', 'null');
    this.routeL.clearLayers(); this.rm.destMarkerL.clearLayers();
    const nb = $('nav-banner'); if (nb) nb.style.display = 'none';
    const dc = $('dest-clear'); if (dc) dc.style.display = 'none';
    if (this.app.dom.hdrRoad && !this.app.dom.hdrRoad.textContent) this.app.dom.hdrRoad.textContent = 'Sürüşe Hazır';
  }

  toggleRecord() {
    const btn = $('btn-trail');
    if (!this.rec) {
      this.rec = { t: Date.now(), dist: 0, pts: [], max: 0, sumSpd: 0, nSpd: 0 };
      this.trackL.clearLayers(); 
      this.rec.line = L.polyline([], { color: '#1db954', weight: 5, opacity: 0.9 }).addTo(this.trackL);
      if (btn) btn.classList.add('active'); 
      return toast('🔴 Sürüş kaydı başladı');
    }
    
    const r = this.rec; 
    this.rec = null; 
    if (btn) btn.classList.remove('active');
    
    const sec = (Date.now() - r.t) / 1000;
    const distKm = r.dist / 1000;
    const avg = sec >= 30 ? distKm / (sec / 3600) : 0;
    
    const l100 = { benzin: 7.5, dizel: 6, lpg: 9.5, elektrik: 16 }[this.cfg.vehicle] || 7.5;
    const fuelAmt = distKm * l100 / 100;
    const cost = fuelAmt * this.cfg.fuelPrice;

    const bgEl = $('trip-bg');
    if (bgEl) {
      $('ts-dist').textContent = distKm.toFixed(1) + ' km';$('ts-dur').textContent = fmtDur(sec);
      $('ts-avg').textContent = Math.round(avg) + ' km/s';$('ts-cost').textContent = '₺' + cost.toFixed(0);
      bgEl.style.display = 'flex';
      
      const closeBtn = $('trip-close-btn');
      if (closeBtn) {
        closeBtn.onclick = () => {
          bgEl.style.display = 'none';
          this.trackL.clearLayers();
        };
      }
    }

    store.set('rp_trip', JSON.stringify({ t: r.t, dist: r.dist, sec, pts: r.pts.length }));
  }

  recTick(la, ln) {
    const r = this.rec, last = r.pts[r.pts.length - 1];
    if (last && hav(last[0], last[1], la, ln) < 5) return;
    r.pts.push([la, ln]); r.line.addLatLng([la, ln]);
  }

  async testServices() {
    const ids = ['st-lim', 'st-wx', 'st-trf', 'st-geo'];
    ids.forEach(id => { const e = $(id); if (e) { e.textContent = 'Test Ediliyor...'; e.className = 'm-status'; } });
    const ping = async (id, url) => {
      let ok = false;
      try { const r = url ? await fetchJSON(url, 6000) : await fetchOverpass('[out:json];node(1);out;', 6000); ok = !!r; } catch (_) {}
      const e = $(id); if (e) { e.textContent = ok ? 'Çevrimiçi / Hazır' : 'Erişilemiyor'; e.className = 'm-status ' + (ok ? 'ok' : 'err'); }
      return ok;
    };
    await Promise.all([
      ping('st-lim', null),
      ping('st-wx', 'https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=32.8&current=temperature_2m'),
      ping('st-trf', 'https://router.project-osrm.org/nearest/v1/driving/32.85,39.92'),
      ping('st-geo', 'https://nominatim.openstreetmap.org/search?format=json&q=Ankara')
    ]);
    toast('Servis durumları güncellendi.');
  }
}

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });

/* ═══════ Mobil: bağlantı durumu ═══════ */
(() => {
  const notify = m => { try { toast(m, 2500); } catch (_) {} };
  window.addEventListener('offline', () => notify('Çevrimdışı — harita ve rota sınırlı'));
  window.addEventListener('online', () => notify('Bağlantı geri geldi'));
})();
