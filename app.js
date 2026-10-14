/**
 * RotaPro — Complete Mobile Navigation App
 * MCT YAZILIM — Production Ready
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
setTimeout(_killSplashNow, 3500);

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
      this.fuelPrice   = Number.isFinite(fp) ? Math.max(0, fp) : 45;
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
      if (x.vehicle !== undefined) this.vehicle = x.vehicle;
      if (x.fuelPrice !== undefined) this.fuelPrice = parseFloat(x.fuelPrice) || 0;
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
      this.carSvg = null;
      this.pos = null;
      this._currentAngle = 0;

      this.bindPinchRotation();
      this._initMe();

      this.lightsL = L.layerGroup().addTo(this.map);
      this.camsL   = L.layerGroup().addTo(this.map);
      this.workL   = L.layerGroup().addTo(this.map);
      this.destMarkerL = L.layerGroup().addTo(this.map);
    } catch (e) {
      console.error(e);
    }
  }

  setTheme(light) {
    document.body.classList.toggle('light-theme', !!light);
    const mt = document.getElementById('meta-theme');
    if (mt) mt.setAttribute('content', light ? '#f0f2f5' : '#0a0a0f');
  }

  bindPinchRotation() {
    const box = $('map-box');
    if (!box) return;
    let initialAngle = 0;

    box.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        initialAngle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI) - this._currentAngle;
      }
    }, { passive: true });

    box.addEventListener('touchmove', e => {
      if (e.touches.length === 2) {
        const t1 = e.touches[0], t2 = e.touches[1];
        const angle = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);
        this._currentAngle = angle - initialAngle;
        if (this.mapRot) {
          this.mapRot.style.transform = `rotate(${this._currentAngle}deg)`;
          this._applyRot();
        }
      }
    }, { passive: true });
  }

  /* ── Google/Apple Haritalar tarzı konum işareti ── */
  _initMe() {
    this.following = this.cfg.autoCenter;
    this.disp = null;            // ekranda gösterilen (yumuşatılmış) konum
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
    // Kullanıcı haritayı sürükleyince takibi bırak (Google gibi)
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
    if (this.btnRecenter) this.btnRecenter.classList.toggle('show', !this.following && !!this.pos);
  }
  _applyRot() {
    const r = $('me-rot');
    if (!r || this._hd === undefined) return;
    r.style.transform = `rotate(${this._hd + (this._currentAngle || 0)}deg)`;
  }

  pushFix(la, ln, ac, hdg, kmh) {
    // Sıçrayan (düşük doğruluklu) konumları yoksay
    if (this.init && Number.isFinite(ac) && ac > 60) return;
    this.pos = [la, ln];
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

    // Hareket durumu: yürürken/dururken nokta+koni, sürerken ok
    this.moving = kmh > 5;
    if (this.meEl) this.meEl.classList.toggle('moving', this.moving);

    // Yön: filtreli, en kısa yoldan dönüş
    if (Number.isFinite(hdg) && kmh > 3) {
      if (this._hd === undefined) this._hd = hdg;
      const d = ((hdg - (this._hd % 360)) + 540) % 360 - 180;
      this._hd += d * 0.25;
      if (this.meEl) this.meEl.classList.add('has-hd');
      if (this.moving && this.cfg.rotateMode && this.following && this.mapRot) {
        this.mapRot.style.transform = `rotate(${-this._hd}deg)`;
        this._currentAngle = -this._hd;
      } else if (!this.cfg.rotateMode && this.mapRot && this._currentAngle) {
        this.mapRot.style.transform = 'rotate(0deg)';
        this._currentAngle = 0;
      }
      this._applyRot();
    }
    this._syncRecenter();
  }

  // Her karede konumu hedefe doğru kaydır (kayar gibi akıcı takip)
  frame() {
    if (!this.disp || !this.pos) return;
    const dla = this.pos[0] - this.disp[0], dln = this.pos[1] - this.disp[1];
    if (Math.abs(dla) < 1e-8 && Math.abs(dln) < 1e-8) return;
    const k = 0.12;
    this.disp = [this.disp[0] + dla * k, this.disp[1] + dln * k];
    this.meMarker.setLatLng(this.disp);
    if (this.following) this.map.setView(this.disp, this.map.getZoom(), { animate: false });
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
        else if ((p.kind === 'work' || p.kind === 'pothole' || p.kind === 'accident') && cfg.showWorks) target = this.workL;
        else if (cfg.showCams || p.kind === 'cam') target = this.camsL;
        if (!target) continue;

        let col = '#dc3545';
        if (p.kind === 'work') col = '#f59e0b';
        if (p.kind === 'pothole') col = '#f97316';
        if (p.kind === 'accident') col = '#8b5cf6';

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
      lat: null, lng: null, spd: 0, startTime: Date.now(),
      maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0, dist: 0,
      poi: loadedHazards
    };

    // Tema Başlangıç Ayarı
    this.map.setTheme(this.cfg.lightTheme);

    this.fx = new Features(this);
    this.bindUI();
    this.startClock();
    this.startSplash();
    this.startGPS();
    this.startLoop();
    this.enableWakeLock();

    setTimeout(() => {
      this.fx.refreshPOIs();
    }, 600);
  }

  async enableWakeLock() {
    try {
      if ('wakeLock' in navigator && this.cfg.wakeOn) {
        await navigator.wakeLock.request('screen');
      }
    } catch (_) {}
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
          showFuel: $('cfg-show-fuel')?.checked
        }
      );
      this.map.setTheme(this.cfg.lightTheme);
      this.fx.refreshPOIs();
      this.fx.updateFuel();
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

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr',
     'cfg-lights','cfg-cams','cfg-works','cfg-vehicle','cfg-fuel-price','cfg-show-fuel'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', save);
    });

    // Kesin Çalışan Tema Butonu
    $('btn-theme')?.addEventListener('click', () => {
      const light = !document.body.classList.contains('light-theme');
      if ($('cfg-lt')) $('cfg-lt').checked = light;
      this.map.setTheme(light);
      save();
    });

    $('btn-refresh-status')?.addEventListener('click', () => this.fx.testServices());

    $('btn-clear-hazards')?.addEventListener('click', () => {
      if (confirm('Eklenen tüm özel tehlike ve radarlar silinsin mi?')) {
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
      if (q === 'Ev' || q === 'İş Yeri') {   // uzun basınca kayıtlı yeri sil
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
        let lat = this.state.lat;
        let lng = this.state.lng;
        if (!lat || !lng) {
          const center = this.map.map.getCenter();
          lat = center.lat;
          lng = center.lng;
        }
        const newPoi = { lat, lng, kind, timestamp: Date.now() };
        this.state.poi.push(newPoi);
        store.set('rp_hazards', JSON.stringify(this.state.poi));
        this.fx.refreshPOIs();
        toast('Tehlike bildirimi haritaya eklendi ve kaydedildi!');
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
      progress += 15;
      if (bar) bar.style.transform = `scaleX(${progress / 100})`;
      if (pct) pct.textContent = `${Math.min(100, progress)}%`;
      if (progress >= 100) {
        clearInterval(itv);
        _killSplashNow();
      }
    }, 150);
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
        const kmh = speed ? speed * 3.6 : 0;
        this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
        
        if (this.dom.ftDot) this.dom.ftDot.classList.add('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = 'GPS (Aktif)';
        if (this.dom.isLoc) this.dom.isLoc.textContent = `${la.toFixed(4)}, ${ln.toFixed(4)}`;

        this.map.pushFix(la, ln, accuracy, heading, kmh);
        this.fx.onFix(la, ln, kmh, pos.coords.altitude, heading, accuracy);
        this.render();
      },
      err => {
        if (this.dom.ftDot) this.dom.ftDot.classList.remove('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = 'Konum İzni Bekleniyor';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
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

/* ═══════ Yardımcılar (mesafe, yön, bildirim) ═══════ */
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

/* ═══════ Features: rota, hız sınırı, radar, hava, istatistik, kayıt ═══════ */
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
    this.rec = null; this.audio = null;
    this.routeL = L.layerGroup().addTo(this.rm.map);
    this.trackL = L.layerGroup().addTo(this.rm.map);
    const unlock = () => { try { this.audio = this.audio || new (window.AudioContext || window.webkitAudioContext)(); this.audio.resume(); } catch (_) {} };
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
    document.addEventListener('click', unlock, { once: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) app.enableWakeLock(); });
    $('nb-x')?.addEventListener('click', () => this.clearRoute());
    $('dest-clear')?.addEventListener('click', () => { this.app.destSheet.close(); this.clearRoute(); });
    $('btn-trail')?.addEventListener('click', () => this.toggleRecord());
    this.updateFuel();
    try { const d = JSON.parse(store.get('rp_dest') || 'null'); if (d) setTimeout(() => this.setDestination(d.la, d.ln, d.name), 1200); } catch (_) {}
  }

  /* ── ses ── */
  beep(freq = 880, ms = 160, times = 1) {
    if (!this.cfg.soundOn || !this.audio) return;
    for (let i = 0; i < times; i++) {
      try {
        const o = this.audio.createOscillator(), g = this.audio.createGain();
        o.frequency.value = freq; o.type = 'sine'; g.gain.value = 0.18;
        o.connect(g); g.connect(this.audio.destination);
        const t0 = this.audio.currentTime + i * (ms + 90) / 1000;
        o.start(t0); o.stop(t0 + ms / 1000);
      } catch (_) {}
    }
  }
  speak(txt, gap = 4000) {
    if (!this.cfg.ttsOn || !('speechSynthesis' in window)) return;
    if (Date.now() - this.lastSpeak < gap) return;
    this.lastSpeak = Date.now();
    try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(txt); u.lang = 'tr-TR'; speechSynthesis.speak(u); } catch (_) {}
  }

  /* ── her GPS verisinde ── */
  onFix(la, ln, kmh, alt, hdg, acc) {
    const now = Date.now(), s = this.s, d = this.app.dom;
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

  /* ── hava / adres ── */
  async weather(la, ln) {
    try {
      const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}&current=temperature_2m,wind_speed_10m&wind_speed_unit=kmh`);
      const c = j.current;
      if ($('is-temp')) $('is-temp').textContent = Math.round(c.temperature_2m) + '°C';
      if ($('is-wind')) $('is-wind').textContent = Math.round(c.wind_speed_10m) + ' km/s';
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

  /* ── hız sınırı ── */
  async fetchLimit(la, ln) {
    try {
      const q = `[out:json][timeout:6];way(around:20,${la},${ln})[highway];out tags;`;
      const j = await fetchJSON('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q), 8000);
      const skip = ['footway', 'path', 'cycleway', 'steps', 'pedestrian', 'track', 'bridleway'];
      const ways = (j.elements || []).filter(w => w.tags && !skip.includes(w.tags.highway));
      if (!ways.length) return;
      const defaults = { motorway: 120, motorway_link: 80, trunk: 110, trunk_link: 70, primary: 90, secondary: 82, tertiary: 70, residential: 50, unclassified: 70, living_street: 20, service: 30 };
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
    if (dash) dash.classList.toggle('over', over);
    if (ovr) ovr.classList.toggle('on', over);
    if (over) {
      const now = Date.now();
      if (now - this.lastBeep > 4000) { this.lastBeep = now; this.beep(1000, 140, 2); }
      this.speak(`Hız sınırını aşıyorsunuz. Sınır ${this.limit}`, 15000);
    }
    // yol durumu tahmini
    const trf = $('m-trf');
    if (trf && this.limit && this.limit >= 50) {
      if (kmh > 1 && kmh < this.limit * 0.4) { this.lowSince = this.lowSince || Date.now(); }
      else this.lowSince = 0;
      const slow = this.lowSince && Date.now() - this.lowSince > 20000;
      trf.textContent = slow ? 'Yoğun' : kmh > 1 && kmh < this.limit * 0.7 ? 'Orta' : 'Akıcı';
      trf.style.color = slow ? 'var(--red)' : kmh > 1 && kmh < this.limit * 0.7 ? 'var(--yellow)' : 'var(--green)';
    }
  }

  /* ── radar / tehlike ── */
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
    const names = { cam: 'Radar', pothole: 'Çukur', work: 'Yol çalışması', accident: 'Kaza veya tehlike' };
    for (const p of this.app.state.poi.concat(this.osm)) {
      if (!names[p.kind]) continue;
      if (p.kind === 'cam' && !this.cfg.showCams) continue;
      const d = hav(la, ln, p.lat, p.lng);
      if (d > 400) continue;
      if (kmh > 8 && heading != null && angDiff(bearingTo(la, ln, p.lat, p.lng), heading) > 70) continue;
      const key = p.lat.toFixed(5) + p.lng.toFixed(5);
      if (now - (this.alerted.get(key) || 0) < 120000) continue;
      this.alerted.set(key, now);
      const txt = `${names[p.kind]} ${Math.round(d / 50) * 50} metre ileride`;
      toast('⚠️ ' + txt, 4000); this.beep(700, 200, 3); this.speak(txt, 1500);
    }
  }

  /* ── yakıt ── */
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
    ['ss-max', 'ss-avg'].forEach(i => { if ($(i)) $(i).textContent = '0'; });
    if ($('ss-trip')) $('ss-trip').textContent = '0.0';
    this.updateFuel(); toast('Sürüş istatistikleri sıfırlandı.');
  }

  /* ── arama ── */
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
        const b = document.createElement('button'); b.className = 'dest-row';
        b.textContent = (it.d != null ? fmtDist(it.d) + ' · ' : '') + it.name;
        b.addEventListener('click', () => { this.app.destSheet.close(); this.setDestination(it.la, it.ln, it.name.split(',')[0]); });
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
  onPick() {
    const c = this.rm.map.getCenter();
    if (this.pendingSave) {
      const key = this.pendingSave; this.pendingSave = null;
      store.set(key, JSON.stringify({ la: c.lat, ln: c.lng }));
      toast((key === 'rp_home' ? 'Ev' : 'İş yeri') + ' kaydedildi.');
      return this.setDestination(c.lat, c.lng, key === 'rp_home' ? 'Ev' : 'İş Yeri');
    }
    this.setDestination(c.lat, c.lng, 'Seçilen Konum');
  }

  /* ── rota ── */
  setDestination(la, ln, name) {
    this.dest = { la, ln, name };
    store.set('rp_dest', JSON.stringify(this.dest));
    this.rm.setDestinationPin(la, ln, name);
    this.fetchRoute(true);
  }
  async fetchRoute(first) {
    const d = this.dest; if (!d) return;
    const a = this.app.state;
    let sl = a.lat, sn = a.lng;
    if (sl == null) { try { [sl, sn] = JSON.parse(store.get('rp_last')); } catch (_) {} }
    if (sl == null) { const c = this.rm.map.getCenter(); sl = c.lat; sn = c.lng; }
    const q = `${sn},${sl};${d.ln},${d.la}?overview=full&geometries=geojson&steps=true`;
    const hosts = ['https://router.project-osrm.org/route/v1/driving/', 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'];
    let route = null;
    for (let t = 0; t < 4 && !route; t++) {
      try {
        const j = await fetchJSON(hosts[t % 2] + q, 10000);
        if (j.code === 'Ok' && j.routes && j.routes[0]) route = j.routes[0];
      } catch (_) {}
    }
    let approx = false;
    if (!route) {   // servis yoksa düz çizgi göster, rota çizimi hiç kaybolmasın
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
      toast(approx ? 'Yol verisine ulaşılamadı, düz çizgi gösteriliyor. Bağlantı gelince rota güncellenir.' : `${d.name}: ${fmtDist(this.route.dist)} · ${fmtDur(this.route.dur)}`, approx ? 6000 : 4500);
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
    const scan = (from, to) => { for (let i = from; i < to; i++) { const d = hav(la, ln, r.pts[i][0], r.pts[i][1]); if (d < bd) { bd = d; best = i; } } };
    scan(r.idx, Math.min(r.pts.length, r.idx + 150));
    if (bd > 120) scan(0, r.pts.length);
    r.idx = best;
    const now = Date.now();
    if (r.approx && now - this.lastReroute > 20000) { this.lastReroute = now; this.fetchRoute(false); }
    if (bd > 70 && !r.approx) { this.off++; } else this.off = 0;
    if (this.off >= 3 && now - this.lastReroute > 15000) {
      this.lastReroute = now; this.off = 0; toast('Rotadan çıkıldı, yeniden hesaplanıyor...'); this.speak('Yeniden rota hesaplanıyor', 0); this.fetchRoute(false); return;
    }
    const total = r.cum[r.cum.length - 1], remain = Math.max(0, total - r.cum[best]);
    if (this.dest && (remain < 30 || hav(la, ln, this.dest.la, this.dest.lng ?? this.dest.ln) < 35)) {
      toast('🏁 Hedefe vardınız', 5000); this.beep(900, 220, 2); this.speak('Hedefe vardınız', 0); return this.clearRoute();
    }
    const st = r.steps.find(s => s.idx > best && s.type !== 'depart') || r.steps[r.steps.length - 1];
    const dd = Math.max(0, r.cum[st.idx] - r.cum[best]);
    if ($('nb-dist')) $('nb-dist').textContent = fmtDist(dd);
    if ($('nb-txt')) $('nb-txt').textContent = st.text;
    if ($('nb-eta')) $('nb-eta').textContent = fmtDur(r.dur * (remain / (r.dist || 1)));
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

  /* ── sürüş kaydı ── */
  toggleRecord() {
    const btn = $('btn-trail');
    if (!this.rec) {
      this.rec = { t: Date.now(), dist: 0, pts: [], max: 0 };
      this.trackL.clearLayers(); this.rec.line = L.polyline([], { color: '#1db954', weight: 5, opacity: 0.9 }).addTo(this.trackL);
      if (btn) btn.classList.add('active'); return toast('🔴 Sürüş kaydı başladı');
    }
    const r = this.rec; this.rec = null; if (btn) btn.classList.remove('active');
    const sec = (Date.now() - r.t) / 1000;
    const avg = sec >= 30 ? r.dist / 1000 / (sec / 3600) : 0;
    store.set('rp_trip', JSON.stringify({ t: r.t, dist: r.dist, sec, pts: r.pts.length }));
    toast(`Kayıt bitti: ${(r.dist / 1000).toFixed(1)} km · ${fmtDur(sec)} ${avg ? ' · ort ' + Math.round(avg) + ' km/s' : ''}`, 7000);
    setTimeout(() => this.trackL.clearLayers(), 20000);
  }
  recTick(la, ln) {
    const r = this.rec, last = r.pts[r.pts.length - 1];
    if (last && hav(last[0], last[1], la, ln) < 5) return;
    r.pts.push([la, ln]); r.line.addLatLng([la, ln]);
  }

  /* ── gerçek servis testi ── */
  async testServices() {
    const ids = ['st-lim', 'st-wx', 'st-trf', 'st-geo'];
    ids.forEach(id => { const e = $(id); if (e) { e.textContent = 'Test Ediliyor...'; e.className = 'm-status'; } });
    const ping = async (id, url) => {
      let ok = false;
      try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 7000); const r = await fetch(url, { signal: c.signal }); clearTimeout(t); ok = r.ok; } catch (_) {}
      const e = $(id); if (e) { e.textContent = ok ? 'Çevrimiçi / Hazır' : 'Erişilemiyor'; e.className = 'm-status ' + (ok ? 'ok' : 'err'); }
      return ok;
    };
    const r = await Promise.all([
      ping('st-lim', 'https://overpass-api.de/api/status'),
      ping('st-wx', 'https://api.open-meteo.com/v1/forecast?latitude=39.9&longitude=32.8&current=temperature_2m'),
      ping('st-trf', 'https://router.project-osrm.org/nearest/v1/driving/32.85,39.92'),
      ping('st-geo', 'https://nominatim.openstreetmap.org/status.php?format=json')
    ]);
    toast(r.every(Boolean) ? 'Tüm servisler çevrimiçi.' : 'Bazı servislere ulaşılamadı.', 3500);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });