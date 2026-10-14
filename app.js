/**
 * RotaPro — Complete Mobile Navigation App
 * MCT YAZILIM
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

/* ═══════ RotaMap (İki Parmak Döndürme & Kararlı Araç) ═══════ */
class RotaMap {
  constructor() {
    if (typeof L === 'undefined') return;
    try {
      this.map = L.map('map', {
        center: [39.92, 32.85], zoom: 18, zoomControl: false,
        attributionControl: false, preferCanvas: true
      });

      this.tl = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        subdomains: 'abc', maxZoom: 19, minZoom: 3
      }).addTo(this.map);

      this.mapRot = $('map-rot');
      this.carSvg = $('car-arrow-svg');
      this.following = false;
      this.rotate = true;
      this.fix = null;
      this.pos = null;
      this._currentAngle = 0;

      this.bindPinchRotation();

      this.lightsL = L.layerGroup().addTo(this.map);
      this.camsL   = L.layerGroup().addTo(this.map);
      this.workL   = L.layerGroup().addTo(this.map);
      this.navL    = L.layerGroup().addTo(this.map);
    } catch (e) {
      console.error(e);
    }
  }

  setTheme(light) {
    document.body.classList.toggle('dark-map', !light);
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
        }
      }
    }, { passive: true });
  }

  setMode(follow, rotate) {
    this.following = !!follow;
    this.rotate = !!rotate;
    if (this.following) this.map.dragging.disable();
    else this.map.dragging.enable();
  }

  pushFix(la, ln, ac, hdg, kmh) {
    this.fix = { la, ln, v: kmh };
    this.pos = [la, ln];
    if (!this.init) {
      this.init = true;
      this.map.setView([la, ln], 18, { animate: false });
    }
    if (Number.isFinite(hdg) && this.carSvg && !this.rotate) {
      this.carSvg.style.transform = `rotate(${Math.round(hdg)}deg)`;
    }
  }

  frame() {
    if (!this.pos || !this.map) return;
    if (this.following) {
      this.map.setView(this.pos, this.map.getZoom(), { animate: false });
    }
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
        else if (cfg.showCams) target = this.camsL;
        if (!target) continue;

        L.circleMarker([p.lat, p.lng], {
          radius: 6, color: '#ffffff', weight: 1.5,
          fillColor: '#dc3545', fillOpacity: 0.9
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
    this.map = new RotaMap();

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

    this.state = {
      lat: null, lng: null, spd: 0, startTime: Date.now(),
      maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0, dist: 0, poi: []
    };

    this.bindUI();
    this.startClock();
    this.startSplash();
    this.startGPS();
    this.startLoop();
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
      this.map.setMode(this.cfg.autoCenter, this.cfg.rotateMode);
    };

    ['cfg-as','cfg-ac','cfg-rot','cfg-snd','cfg-tts','cfg-wk','cfg-lt','cfg-thr',
     'cfg-lights','cfg-cams','cfg-works','cfg-vehicle','cfg-fuel-price','cfg-show-fuel'].forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('change', save);
    });

    $('btn-theme')?.addEventListener('click', () => {
      this.cfg.lightTheme = !this.cfg.lightTheme;
      save();
    });

    // Süre Sıfırlama
    $('btn-reset-dur')?.addEventListener('click', () => {
      this.state.startTime = Date.now();
      alert('Sürüş süresi sıfırlandı.');
    });

    // Hızlı Hedef Butonları
    document.querySelectorAll('.quick-dest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-q');
        const qInput = $('dest-q');
        if (qInput) { qInput.value = q; $('dest-go')?.click(); }
      });
    });

    // Hedef Arama Mantığı (Adres Arama)
    const searchAddr = async () => {
      const qInput = $('dest-q'); const resDiv =$('dest-res');
      const q = qInput ? qInput.value.trim() : ''; if (!q) return;
      if (resDiv) resDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary)">🔍 Aranıyor...</div>';
      try {
        const data = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5`);
        if (resDiv) {
          resDiv.innerHTML = '';
          if (!data || !data.length) { resDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--text-secondary)">Sonuç bulunamadı.</div>'; return; }
          data.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'dest-row'; btn.textContent = item.display_name;
            btn.addEventListener('click', () => {
              this.destSheet.close();
              this.map.map.setView([parseFloat(item.lat), parseFloat(item.lon)], 16, { animate: true });
              alert('Hedef seçildi: ' + item.display_name.split(',')[0]);
            });
            resDiv.appendChild(btn);
          });
        }
      } catch (e) { if (resDiv) resDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--red)">Arama hatası.</div>'; }
    };

    $('dest-go')?.addEventListener('click', searchAddr);$('dest-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });

    // Tehlike Ekleme
    document.querySelectorAll('.hazard-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const kind = btn.getAttribute('data-type');
        if (this.state.lat && this.state.lng) {
          const list = JSON.parse(store.get('rp_hazards') || '[]');
          list.push({ lat: this.state.lat, lng: this.state.lng, kind, timestamp: Date.now() });
          store.set('rp_hazards', JSON.stringify(list));
          this.state.poi.push({ lat: this.state.lat, lng: this.state.lng, kind });
          this.map.setPOIs(this.state.poi, this.cfg);
          alert('Tehlike bildirimi başarıyla kaydedildi!');
          this.hazardSheet.close();
        } else {
          alert('GPS konumu henüz alınmadı.');
        }
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
    if (!('geolocation' in navigator)) return;
    navigator.geolocation.watchPosition(
      pos => {
        _killSplashNow();
        const { latitude: la, longitude: ln, speed, heading, altitude, accuracy } = pos.coords;
        const kmh = speed ? speed * 3.6 : 0;
        this.state.lat = la; this.state.lng = ln; this.state.spd = kmh;
        
        if (this.dom.ftDot) this.dom.ftDot.classList.add('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = 'GPS (Aktif)';
        if (this.dom.isLoc) this.dom.isLoc.textContent = `${la.toFixed(4)}, ${ln.toFixed(4)}`;

        this.map.pushFix(la, ln, accuracy, heading, kmh);
        this.render();
      },
      err => {
        if (this.dom.ftDot) this.dom.ftDot.classList.remove('on');
        if (this.dom.ftGps) this.dom.ftGps.textContent = 'GPS Arıyor...';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
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

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });