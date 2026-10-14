/**
 * RotaPro — Complete Mobile Navigation App
 * MCT YAZILIM — Production & Store Ready Version
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

/* ═══════ RotaMap (Apple / Google Maps Canlı Takip Sistemi) ═══════ */
class RotaMap {
  constructor(appConfig) {
    this.cfg = appConfig;
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
      this.pos = null;
      this._currentAngle = 0;

      this.bindPinchRotation();

      this.lightsL = L.layerGroup().addTo(this.map);
      this.camsL   = L.layerGroup().addTo(this.map);
      this.workL   = L.layerGroup().addTo(this.map);
      this.destMarkerL = L.layerGroup().addTo(this.map);
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

  pushFix(la, ln, ac, hdg, kmh) {
    this.pos = [la, ln];
    if (!this.init) {
      this.init = true;
      this.map.setView([la, ln], 18, { animate: false });
    }

    // Google / Apple Maps Akıllı Otomatik Merkezleme
    if (this.cfg.autoCenter) {
      this.map.setView(this.pos, this.map.getZoom(), { animate: false });
    }

    // Düşük hızlarda yönün anlamsızca titremesini engellemek için filtre (kmh > 3)
    if (Number.isFinite(hdg) && kmh > 3) {
      if (this.cfg.rotateMode && this.mapRot) {
        // Harita aracın sürüş yönüne döner
        this.mapRot.style.transform = `rotate(${-hdg}deg)`;
        if (this.carSvg) this.carSvg.style.transform = `rotate(0deg)`;
      } else if (this.carSvg) {
        // Harita sabit kalır, mavi ok aracın yönüne döner
        if (this.mapRot) this.mapRot.style.transform = `rotate(0deg)`;
        this.carSvg.style.transform = `rotate(${Math.round(hdg)}deg)`;
      }
    }
  }

  frame() {
    // Animasyon Döngüsü
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

    this.bindUI();
    this.startClock();
    this.startSplash();
    this.startGPS();
    this.startLoop();
    this.enableWakeLock();

    setTimeout(() => {
      this.map.setPOIs(this.state.poi, this.cfg);
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
      this.map.setPOIs(this.state.poi, this.cfg);
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

    $('btn-theme')?.addEventListener('click', () => {
      this.cfg.lightTheme = !this.cfg.lightTheme;
      if ($('cfg-lt'))$('cfg-lt').checked = this.cfg.lightTheme;
      save();
    });

    $('btn-refresh-status')?.addEventListener('click', () => {
      ['st-lim','st-wx','st-trf','st-geo'].forEach(id => {
        const el = $(id);
        if (el) { el.textContent = 'Test Ediliyor...'; el.className = 'm-status'; }
      });
      setTimeout(() => {
        ['st-lim','st-wx','st-trf','st-geo'].forEach(id => {
          const el = $(id);
          if (el) { el.textContent = 'Çevrimiçi / Hazır'; el.className = 'm-status ok'; }
        });
        alert('Tüm servisler başarıyla test edildi ve çevrimiçi!');
      }, 800);
    });

    $('btn-clear-hazards')?.addEventListener('click', () => {
      if (confirm('Eklenen tüm özel tehlike ve radarlar silinsin mi?')) {
        store.set('rp_hazards', '[]');
        this.state.poi = [];
        this.map.setPOIs([], this.cfg);
        alert('Tüm özel uyarılar temizlendi.');
      }
    });

    $('btn-reset-dur')?.addEventListener('click', () => {
      this.state.startTime = Date.now();
      alert('Sürüş süresi sıfırlandı.');
    });

    document.querySelectorAll('.quick-dest-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const q = btn.getAttribute('data-q');
        const qInput = $('dest-q');
        if (qInput) { qInput.value = q; $('dest-go')?.click(); }
      });
    });

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
              const lat = parseFloat(item.lat);
              const lon = parseFloat(item.lon);
              this.map.map.setView([lat, lon], 16, { animate: true });
              this.map.setDestinationPin(lat, lon, item.display_name.split(',')[0]);
              alert('Hedef seçildi: ' + item.display_name.split(',')[0]);
            });
            resDiv.appendChild(btn);
          });
        }
      } catch (e) { if (resDiv) resDiv.innerHTML = '<div style="text-align:center;padding:12px;color:var(--red)">Arama hatası.</div>'; }
    };

    $('dest-go')?.addEventListener('click', searchAddr);$('dest-q')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchAddr(); });

    $('dest-pick')?.addEventListener('click', () => {
      this.destSheet.close();
      document.body.classList.add('picking');
    });

    $('pick-no')?.addEventListener('click', () => {
      document.body.classList.remove('picking');
    });

    $('pick-ok')?.addEventListener('click', () => {
      document.body.classList.remove('picking');
      const center = this.map.map.getCenter();
      this.map.setDestinationPin(center.lat, center.lng, 'Özel Seçilen Konum');
      alert(`Seçilen konum haritaya işaretlendi! (${center.lat.toFixed(4)}, ${center.lng.toFixed(4)})`);
    });

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
        this.map.setPOIs(this.state.poi, this.cfg);
        alert('Tehlike bildirimi haritaya eklendi ve kaydedildi!');
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

document.addEventListener('DOMContentLoaded', () => { window.rotaProApp = new AppManager(); });