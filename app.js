/**
 * RotaPro — Ultimate Edition (OBD-2, WakeWord, LightSensor & Media Integrated)
 * MCT YAZILIM — 2026 Pro Driver Assistant
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
  set(k, v){ try { localStorage.setItem(k, v); } catch (e) {} }
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

/* ═══════ Config ═══════ */
class Config {
  constructor() {
    this.autoStart = true; this.autoCenter = true; this.rotateMode = true;
    this.soundOn = true; this.ttsOn = true; this.wakeOn = true;
    this.lightTheme = false; this.threshold = 10;
    this.showLights = false; this.showCams = true; this.showWorks = true;
    this.vehicle = 'benzin'; this.fuelPrice = 45; this.showFuel = true;
    this.carName = 'Aracım'; this.useOBD = false; this.autoTunnel = true;
    this.load();
  }
  load() {
    const s = store.get('rp_cfg_v10');
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
      this.autoTunnel  = o.at !== false;
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
      if (x.autoTunnel!== undefined) this.autoTunnel= !!x.autoTunnel;
    }
    store.set('rp_cfg_v10', JSON.stringify({
      as: this.autoStart, ac: this.autoCenter, rot: this.rotateMode,
      snd: this.soundOn, tts: this.ttsOn, wk: this.wakeOn,
      lt: this.lightTheme, thr: this.threshold,
      sl: this.showLights, sc: this.showCams, sw: this.showWorks,
      vh: this.vehicle, fp: this.fuelPrice, sf: this.showFuel, cn: this.carName,
      obd: this.useOBD, at: this.autoTunnel
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
        subdomains: 'abc', maxZoom: 19, minZoom: 3
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

    const loadedHazards = JSON.parse(store.get('rp_hazards') || '[]');
    this.state = {
      lat: null, lng: null, spd: 0, rpm: 0, startTime: Date.now(),
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
        await navigator.wakeLock.request('screen');
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
          carName: $('cfg-car-name')?.value,
          useOBD: $('cfg-obd')?.checked,
          autoTunnel: $('cfg-autotunnel')?.checked
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
    if ($('cfg-obd'))$('cfg-obd').checked = this.cfg.useOBD;
    if ($('cfg-autotunnel'))$('cfg-autotunnel').checked = this.cfg.autoTunnel;

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr',
     'cfg-lights','cfg-cams','cfg-works','cfg-vehicle','cfg-fuel-price','cfg-show-fuel',
     'cfg-car-name','cfg-obd','cfg-autotunnel'].forEach(id => {
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
      toast(this.cfg.rotateMode ? '🧭 Sürüş Yönü Aktif' : '🧭 Kuzey Yukarı Aktif');
    };
    $('btn-compass')?.addEventListener('click', toggleRot);
    $('btn-mode-rot')?.addEventListener('click', toggleRot);
    this.updateRotateUI();

    $('btn-zoom-in')?.addEventListener('click', () => { if (this.map?.map) this.map.map.zoomIn(); });
    $('btn-zoom-out')?.addEventListener('click', () => { if (this.map?.map) this.map.map.zoomOut(); });

    const renderDestHistory = () => {
      const wrap = $('dest-history-wrap');
      const box = $('dest-history');
      if (!wrap || !box) return;
      const hist = JSON.parse(store.get('rp_dest_history') || '[]');
      if (!hist || !hist.length) { wrap.style.display = 'none'; return; }
      box.innerHTML = '';
      hist.slice(0, 5).forEach(h => {
        const btn = document.createElement('button');
        btn.className = 'dest-row';
        btn.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);display:flex;align-items:center;gap:8px;"><span>📍</span><span>${h.name}</span></div>`;
        btn.addEventListener('click', () => { this.destSheet.close(); this.fx.setDestination(h.la, h.ln, h.name); });
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
      if (confirm('Özel radarlar ve tehlikeler silinsin mi?')) {
        store.set('rp_hazards', '[]');
        this.state.poi = [];
        this.fx.refreshPOIs();
        toast('Uyarılar temizlendi.');
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
        if (!lat || !lng) { const center = this.map.map.getCenter(); lat = center.lat; lng = center.lng; }
        const newPoi = { lat, lng, kind, timestamp: Date.now() };
        this.state.poi.push(newPoi);
        store.set('rp_hazards', JSON.stringify(this.state.poi));
        this.fx.refreshPOIs();
        toast('Tehlike bildirimi eklendi!');
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
        const m = Math.floor(elapsed / 60), s = elapsed % 60;
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
      if (progress >= 100) { clearInterval(itv); _killSplashNow(); }
    }, 100);
  }

  startGPS() {
    if (!('geolocation' in navigator)) {
      if (this.dom.ftGps) this.dom.ftGps.textContent = 'GPS Desteklenmiyor';
      return;
    }
    navigator.geolocation.watchPosition(
      pos => {
        _killSplashNow();
        const { latitude: la, longitude: ln, speed, heading, accuracy } = pos.coords;
        const gpsKmh = (speed !== null && Number.isFinite(speed) && speed > 0) ? speed * 3.6 : 0;
        const kmh = this.state.obdSpeed !== undefined && this.cfg.useOBD ? this.state.obdSpeed : gpsKmh;
        
        this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
        
        if (this.dom.ftDot) this.dom.ftDot.classList.add('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = `${this.cfg.carName} (${this.cfg.useOBD && this.state.obdConnected ? 'OBD-2 Aktif' : 'GPS Aktif'})`;
        if (this.dom.isLoc) this.dom.isLoc.textContent = `${la.toFixed(4)}, ${ln.toFixed(4)}`;

        this.map.pushFix(la, ln, accuracy, heading, kmh);
        this.fx.onFix(la, ln, kmh, pos.coords.altitude, heading, accuracy);
        this.render();
      },
      () => {
        if (this.dom.ftDot) this.dom.ftDot.classList.remove('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = 'Konum İzni Bekleniyor';
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
    const loop = () => { this.map.frame(); requestAnimationFrame(loop); };
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
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), ms);
}

/* ═══════ Features (OBD, WakeWord, LightSensor, Music) ═══════ */
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

    // Müzik Kaynakları (Yerleşik + Spotify/YouTube Entegrasyon Seçeneği)
    this.playlist = [
      { title: 'Sürüş Chill Mix', artist: this.cfg.carName, src: 'https://cdn.pixabay.com/download/audio/2022/05/27/audio_1808fbf756.mp3?filename=lofi-study-112191.mp3' },
      { title: 'Highway Synthwave', artist: this.cfg.carName, src: 'https://cdn.pixabay.com/download/audio/2022/01/18/audio_d0a13f69d2.mp3?filename=synthwave-80s-10905.mp3' },
      { title: 'Roadtrip Acoustic', artist: this.cfg.carName, src: 'https://cdn.pixabay.com/download/audio/2022/03/15/audio_c8c8a73467.mp3?filename=crescent-moon-103397.mp3' }
    ];
    this.currentTrackIdx = 0;
    this.audioEl = new Audio(this.playlist[0].src);
    this.audioEl.loop = false;
    this.isPlayingMusic = false;
    this.audioEl.addEventListener('ended', () => this.nextTrack());

    const unlock = () => {
      try {
        this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
      } catch (_) {}
    };
    ['touchstart', 'touchend', 'click', 'pointerdown'].forEach(ev => {
      document.addEventListener(ev, unlock, { passive: true });
    });

    this.setupMediaSession();
    this.initWakeWord();
    this.setupAmbientLightSensor();
    this.setupOBDButton();

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
    $('mw-source')?.addEventListener('change', e => this.switchMusicSource(e.target.value));

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

  setupMediaSession() {
    if ('mediaSession' in navigator) {
      const track = this.playlist[this.currentTrackIdx];
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: `${track.artist} (${this.cfg.carName})`,
        album: 'RotaPro Araç Modu',
        artwork: [{ src: 'icon-192.png', sizes: '192x192', type: 'image/png' }]
      });
      navigator.mediaSession.setActionHandler('play', () => this.playMusic());
      navigator.mediaSession.setActionHandler('pause', () => this.pauseMusic());
      navigator.mediaSession.setActionHandler('nexttrack', () => this.nextTrack());
      navigator.mediaSession.setActionHandler('previoustrack', () => this.prevTrack());
    }
  }

  toggleMusicPlay() {
    if (this.isPlayingMusic) this.pauseMusic(); else this.playMusic();
  }

  playMusic() {
    this.audioEl.play().then(() => {
      this.isPlayingMusic = true;
      if ($('mw-play')) $('mw-play').textContent = '⏸';
      if ($('mw-title')) $('mw-title').textContent = this.playlist[this.currentTrackIdx].title;
      toast(`🎵 Çalınıyor: ${this.playlist[this.currentTrackIdx].title}`);
      this.setupMediaSession();
    }).catch(() => toast('Müzik başlatılamadı. Dokunarak tekrar deneyin.'));
  }

  pauseMusic() {
    this.audioEl.pause();
    this.isPlayingMusic = false;
    if ($('mw-play')) $('mw-play').textContent = '▶';
    toast('⏸ Müzik duraklatıldı', 1500);
  }

  nextTrack() {
    this.currentTrackIdx = (this.currentTrackIdx + 1) % this.playlist.length;
    this.audioEl.src = this.playlist[this.currentTrackIdx].src;
    if (this.isPlayingMusic) this.playMusic();
    else {
      if ($('mw-title')) $('mw-title').textContent = this.playlist[this.currentTrackIdx].title;
      this.setupMediaSession();
      toast(`⏭ ${this.playlist[this.currentTrackIdx].title}`);
    }
  }

  prevTrack() {
    this.currentTrackIdx = (this.currentTrackIdx - 1 + this.playlist.length) % this.playlist.length;
    this.audioEl.src = this.playlist[this.currentTrackIdx].src;
    if (this.isPlayingMusic) this.playMusic();
    else {
      if ($('mw-title')) $('mw-title').textContent = this.playlist[this.currentTrackIdx].title;
      this.setupMediaSession();
      toast(`⏮ ${this.playlist[this.currentTrackIdx].title}`);
    }
  }

  switchMusicSource(source) {
    if (source === 'spotify') {
      toast('🟢 Spotify açılıyor...');
      window.open('spotify:', '_blank');
    } else if (source === 'youtubemusic') {
      toast('🔴 YouTube Music açılıyor...');
      window.open('https://music.youtube.com', '_blank');
    } else {
      toast('🎵 Yerleşik Sürücü Müzikleri aktif');
    }
  }

  /* 1. REAL OBD-2 BLUETOOTH INTEGRATION */
  setupOBDButton() {
    $('btn-connect-obd')?.addEventListener('click', async () => {
      if (!('bluetooth' in navigator)) {
        return toast('Tarayıcınız Web Bluetooth API desteklemiyor.');
      }
      try {
        toast('🚗 OBD-2 Bluetooth aranıyor...');
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: ['0000ffe0-0000-1000-8000-00805f9b34fb'] }, { namePrefix: 'OBD' }, { namePrefix: 'ELM' }],
          optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
        });
        const server = await device.gatt.connect();
        this.app.state.obdConnected = true;
        this.cfg.useOBD = true;
        if ($('cfg-obd')) $('cfg-obd').checked = true;
        toast(`✅ Bağlandı: ${device.name || 'OBD-2 Adaptör'}`);
        this.speak('Araç beyni OBD bağlantısı başarılı', 0);
      } catch (err) {
        console.error(err);
        toast('OBD bağlantısı kurulamadı.');
      }
    });
  }

  /* 3. AMBIENT LIGHT SENSOR (Tünel / Gece Modu Otomasyonu) */
  setupAmbientLightSensor() {
    if ('AmbientLightSensor' in window && this.cfg.autoTunnel) {
      try {
        const sensor = new AmbientLightSensor({ frequency: 1 });
        sensor.addEventListener('reading', () => {
          if (!this.cfg.autoTunnel) return;
          const lux = sensor.illuminance;
          // Eğer karanlık ortama (tünel, gece) girilirse otomatik koyu tema, çıkılırsa açık tema
          if (lux < 15 && !document.body.classList.contains('light-theme') === false) {
            this.app.map.setTheme(false); // Gece / Tünel Modu
            toast('🚇 Tünel / Karanlık algılandı: Gece Modu', 2000);
          } else if (lux > 100 && document.body.classList.contains('light-theme') === false && this.cfg.lightTheme) {
            this.app.map.setTheme(true);
          }
        });
        sensor.start();
      } catch (_) {}
    }
  }

  /* 4. WAKE WORD ASİSTAN ("Hey RotaPro") */
  initWakeWord() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR';
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = event => {
        const last = event.results.length - 1;
        const text = event.results[last][0].transcript.toLowerCase();
        
        if (text.includes('hey rota pro') || text.includes('rotapro')) {
          toast('🎙️ Sizi dinliyorum...');
          this.speak('Buyurun', 0);
          this.startVoiceCommand();
        }
      };

      recognition.onerror = () => {};
      recognition.onend = () => {
        if (this.cfg.wakeOn) {
          try { recognition.start(); } catch (_) {}
        }
      };
      
      if (this.cfg.wakeOn) {
        recognition.start();
      }
    } catch (_) {}
  }

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
      u.lang = 'tr-TR'; u.rate = 1.05;
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
      exitBtn.addEventListener('click', () => this.toggleHUD());
      document.body.appendChild(exitBtn);
    }
    toast(isHud ? 'HUD Modu Aktif (Ön Cam)' : 'Normal Moda Dönüldü');
  }

  startVoiceCommand() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return toast('Tarayıcınız sesli komutları desteklemiyor.');
    
    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'tr-TR'; recognition.interimResults = false;
      toast('🎤 Dinleniyor...');
      
      recognition.onresult = event => {
        const text = event.results[0][0].transcript.toLowerCase();
        toast(`🗣️ "${text}"`);
        
        if (text.includes('eve git') || text.includes('eve götür')) {
          this.quickDest('Ev');
        } else if (text.includes('işe git') || text.includes('iş yerine')) {
          this.quickDest('İş Yeri');
        } else if (text.includes('benzin') || text.includes('yakıt')) {
          this.quickDest('Benzin İstasyonu');
        } else if (text.includes('müzik aç') || text.includes('oynat')) {
          this.playMusic();
        } else if (text.includes('müzik kapat') || text.includes('durdur')) {
          this.pauseMusic();
        } else if (text.includes('sonraki şarkı')) {
          this.nextTrack();
        } else if (text.includes('hud') || text.includes('ön cam')) {
          this.toggleHUD();
        } else if (text.includes('rotayı sil')) {
          this.clearRoute();
        } else {
          this.search(text, true);
        }
      };
      recognition.start();
    } catch (_) {
      toast('Sesli komut başlatılamadı.');
    }
  }

  shareETA() {
    if (!navigator.share) return toast('Tarayıcınız paylaşımı desteklemiyor.');
    const d = this.dest;
    const etaText = this.route ? `Hedefim: ${d ? d.name : 'Belirleniyor'}. Rotadayım!` : `${this.cfg.carName} ile yoldayım!`;
    navigator.share({
      title: 'RotaPro Canlı Konum',
      text: `🚗 ${etaText} Konumum: https://maps.google.com/?q=${this.app.state.lat},${this.app.state.lng}`,
    }).catch(() => {});
  }

  toggleParkLocation() {
    const saved = store.get('rp_parked');
    if (!saved || saved === 'null') {
      const la = this.app.state.lat, ln = this.app.state.lng;
      if (!la || !ln) return toast('GPS konumu alınamadı.');
      store.set('rp_parked', JSON.stringify({ la, ln, time: Date.now() }));
      toast('🅿️ Park konumu kaydedildi!');
      this.speak('Park konumu kaydedildi', 0);
    } else {
      const p = JSON.parse(saved);
      if (confirm('Kayıtlı park yerine rota çizilsin mi?')) {
        this.setDestination(p.la, p.ln, '🅿️ Park Edilen Araç');
      } else if (confirm('Park konumu silinsin mi?')) {
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
      const j = await fetchJSON('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), 8000);
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
    if (dash) { dash.classList.toggle('over', over); dash.classList.toggle('warn', warn); }
    if (ovr) ovr.classList.toggle('on', over);
    if (over) {
      const now = Date.now();
      if (now - this.lastBeep > 4000) { this.lastBeep = now; this.beep(1000, 140, 2); }
      this.speak(`Hız sınırını aşıyorsunuz. Sınır ${this.limit}`, 15000);
    }
  }

  async fetchPOIs(la, ln) {
    try {
      const q = `[out:json][timeout:8];(node(around:5000,${la},${ln})[highway=speed_camera];node(around:3000,${la},${ln})[highway=traffic_signals];);out 300;`;
      const j = await fetchJSON('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), 10000);
      this.osm = (j.elements || []).map(e => ({ lat: e.lat, lng: e.lon, kind: e.tags && e.tags.highway === 'speed_camera' ? 'cam' : 'light', osm: true }));
      this.refreshPOIs();
    } catch (_) { this.poiAt.t = Date.now() - 540000; }
  }

  refreshPOIs() { this.rm.setPOIs(this.app.state.poi.concat(this.osm), this.cfg); }

  checkProximity(la, ln, kmh) {
    const heading = this.hd !== null ? this.hd : this.rm._hd;
    const now = Date.now();
    const names = { cam: 'Radar', pothole: 'Çukur', work: 'Yol Çalışması', accident: 'Kaza', closed: 'Kapalı Yol', oneway: 'Tek Yön' };
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
        const mainTitle = parts[0].trim(), subTitle = parts.slice(1, 4).join(',').trim();
        const distBadge = it.d != null ? `<span style="color:var(--accent);font-weight:700;">${fmtDist(it.d)}</span> · ` : '';
        b.innerHTML = `<div style="font-weight:600;font-size:13px;color:var(--text-primary);">${distBadge}${mainTitle}</div>` +
                      (subTitle ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${subTitle}</div>` : '');
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(it.la, it.ln, mainTitle); });
        res.appendChild(b);
      });
    } catch (_) { msg('Arama hatası.', 'var(--red)'); }
  }

  quickDest(q) {
    if (q === 'Ev' || q === 'İş Yeri') {
      const key = q === 'Ev' ? 'rp_home' : 'rp_work';
      const saved = JSON.parse(store.get(key) || 'null');
      if (saved) { this.app.destSheet.close(); return this.setDestination(saved.la, saved.ln, q); }
      this.pendingSave = key; this.app.destSheet.close();
      document.body.classList.add('picking'); this.rm.unfollow();
      return toast(`${q} konumunu haritadan seçin.`, 4500);
    }
    const map = { 'Hastane': 'hastane', 'AVM': 'alışveriş merkezi', 'Benzin İstasyonu': 'benzin istasyonu', 'Otopark': 'otopark' };
    const inp = $('dest-q'); if (inp) inp.value = q;
    this.search(map[q] || q, true);
  }

  forgetPlace(q) { store.set(q === 'Ev' ? 'rp_home' : 'rp_work', 'null'); toast(`${q} silindi.`); }

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
      if (j && j.address) name = j.address.road || j.address.suburb || j.name || 'Seçilen Konum';
    } catch (_) {}
    this.setDestination(c.lat, c.lng, name);
  }

  setDestination(la, ln, name, waypoint = null) {
    this.dest = { la, ln, name };
    store.set('rp_dest', JSON.stringify(this.dest));
    try {
      let hist = JSON.parse(store.get('rp_dest_history') || '[]');
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
    if (waypoint) coordsStr += `${waypoint.ln},${waypoint.la};`;
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
      toast(approx ? 'Düz çizgi rota gösteriliyor.' : `${d.name}: ${fmtDist(this.route.dist)} · ${fmtDur(this.route.dur)}`, approx ? 6000 : 4500);
      if (!approx) this.speak(`Rota hazır. Yaklaşık ${fmtDur(this.route.dur)}`, 0);
    }
  }

  stepText(st) {
    const m = st.maneuver || {}, mod = m.modifier || '', nm = st.name ? ' — ' + st.name : '';
    const turn = { 'left': 'Sola dönün', 'right': 'Sağa dönün', 'slight left': 'Hafif sola dönün', 'slight right': 'Hafif sağa dönün', 'sharp left': 'Keskin sola dönün', 'sharp right': 'Keskin sağa dönün', 'straight': 'Düz devam edin', 'uturn': 'U dönüşü yapın' };
    switch (m.type) {
      case 'depart': return 'Yola çıkın' + nm;
      case 'arrive': return 'Hedefe vardınız';
      case 'roundabout': case 'rotary': return `Döner kavşaktan çıkın` + nm;
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
      bd = minD; best = bestIdx;
    }
    r.idx = best;

    const now = Date.now();
    if (bd > 70 && !r.approx) this.off++; else this.off = 0;
    if (this.off >= 4 && now - this.lastReroute > 15000) {
      this.lastReroute = now; this.off = 0; toast('Rotadan çıkıldı, yeniden hesaplanıyor...'); this.fetchRoute(false); return;
    }

    const total = r.cum[r.cum.length - 1], remain = Math.max(0, total - r.cum[best]);
    if (this.dest) {
      const dLa = this.dest.la ?? this.dest.lat, dLn = this.dest.ln ?? this.dest.lng;
      if (remain < 30 || (dLa != null && dLn != null && hav(la, ln, dLa, dLn) < 35)) {
        toast('🏁 Hedefe vardınız', 5000); this.speak('Hedefe vardınız', 0); return this.clearRoute();
      }
    }

    const st = r.steps.find(s => s.idx > best && s.type !== 'depart') || r.steps[r.steps.length - 1];
    const dd = Math.max(0, r.cum[st.idx] - r.cum[best]);
    if ($('nb-dist'))$('nb-dist').textContent = fmtDist(dd);
    if ($('nb-txt'))$('nb-txt').textContent = st.text;
    if ($('nb-eta'))$('nb-eta').textContent = fmtDur(r.dur * (remain / (r.dist || 1)));
  }

  clearRoute() {
    this.route = null; this.dest = null; this.pendingDest = null; store.set('rp_dest', 'null');
    this.routeL.clearLayers(); this.rm.destMarkerL.clearLayers();
    const nb = $('nav-banner'); if (nb) nb.style.display = 'none';
    const dc = $('dest-clear'); if (dc) dc.style.display = 'none';
  }

  toggleRecord() {
    const btn = $('btn-trail');
    if (!this.rec) {
      this.rec = { t: Date.now(), dist: 0, pts: [], max: 0 };
      this.trackL.clearLayers();
      this.rec.line = L.polyline([], { color: '#1db954', weight: 5, opacity: 0.9 }).addTo(this.trackL);
      if (btn) btn.classList.add('active');
      return toast('🔴 Sürüş kaydı başladı');
    }
    const r = this.rec; this.rec = null; if (btn) btn.classList.remove('active');
    const sec = (Date.now() - r.t) / 1000, distKm = r.dist / 1000;
    toast(`Kayıt tamamlandı: ${distKm.toFixed(1)} km`);
  }

  recTick(la, ln) {
    const r = this.rec, last = r.pts[r.pts.length - 1];
    if (last && hav(last[0], last[1], la, ln) < 5) return;
    r.pts.push([la, ln]); r.line.addLatLng([la, ln]);
  }

  async testServices() {
    toast('Servisler test ediliyor...');
    await Promise.all([
      fetchJSON('https://overpass-api.de/api/interpreter?data=[out:json];node(1);out;', 5000).catch(() => {}),
      fetchJSON('https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=32.8&current=temperature_2m', 5000).catch(() => {})
    ]);
    toast('Tüm servisler çevrimiçi ve hazır.');
  }
}

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });