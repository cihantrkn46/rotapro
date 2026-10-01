/**
 * RotaPro Architecture (Iteration 8 – No Gauge, Horizontal Actions)
 */
'use strict';

/* ─── UTILITIES ─── */
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const hav = (a, b, c, d) => {
  const R = 6371, dr = Math.PI / 180;
  const x = Math.sin((c - a) * dr / 2) ** 2 +
            Math.cos(a * dr) * Math.cos(c * dr) *
            Math.sin((d - b) * dr / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
};

const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
};

async function fetchJSON(url, ms = 8000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal: ac.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

function distToPolyline(la, ln, geom) {
  if (!geom || !geom.length) return Infinity;
  const k = Math.cos(la * Math.PI / 180), m = 111320;
  const P = g => [(g.lon - ln) * k * m, (g.lat - la) * m];
  if (geom.length === 1) {
    const [x, y] = P(geom[0]);
    return Math.hypot(x, y);
  }
  let best = Infinity;
  for (let i = 0; i < geom.length - 1; i++) {
    const [ax, ay] = P(geom[i]);
    const [bx, by] = P(geom[i + 1]);
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? clamp(-(ax * dx + ay * dy) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}

function parseMaxspeed(s) {
  if (!s) return null;
  const n = parseInt(s, 10);
  if (!(n > 0)) return null;
  return /mph/i.test(s) ? Math.round(n * 1.609) : n;
}

const WARN_SVG = '<path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>';
const INFO_SVG = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
const OK_SVG   = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';

/* ─── CONFIG ─── */
class Config {
  constructor() {
    this.autoCenter = true;
    this.rotateMode = true;
    this.soundOn = true;
    this.wakeOn = true;
    this.threshold = 10;
    this.load();
  }
  load() {
    const s = store.get('rp8');
    if (s) {
      try {
        const o = JSON.parse(s);
        this.autoCenter = o.ac !== false;
        this.rotateMode = o.rot !== false;
        this.soundOn = o.snd !== false;
        this.wakeOn = o.wk !== false;
        this.threshold = clamp(parseInt(o.thr, 10) || 10, 1, 50);
      } catch (e) {}
    }
  }
  save(ac, rot, snd, wk, thr) {
    this.autoCenter = ac; this.rotateMode = rot;
    this.soundOn = snd; this.wakeOn = wk;
    this.threshold = clamp(parseInt(thr, 10) || 10, 1, 50);
    store.set('rp8', JSON.stringify({
      ac, rot, snd, wk, thr: this.threshold
    }));
  }
}

/* ─── SHEET MANAGER ─── */
class SheetManager {
  constructor() {
    this.bg = $('sheet-bg');
    this.sheet = $('sheet');
    this.handle = $('sheet-handle');
    this.isOpen = false;
    this.startY = 0; this.currentY = 0; this.dragging = false;
    this.bindEvents();
  }
  bindEvents() {
    $('btn-cfg').addEventListener('click', () => this.open());
    $('btn-save').addEventListener('click', () => this.close());

    this.handle.addEventListener('touchstart', e => this.onDragStart(e), { passive: true });
    document.addEventListener('touchmove', e => this.onDragMove(e), { passive: false });
    document.addEventListener('touchend', e => this.onDragEnd(e));
    document.addEventListener('touchcancel', e => this.onDragEnd(e));

    this.handle.addEventListener('mousedown', e => this.onDragStart(e));
    document.addEventListener('mousemove', e => this.onDragMove(e));
    document.addEventListener('mouseup', e => this.onDragEnd(e));

    this.bg.addEventListener('click', e => { if (e.target === this.bg) this.close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }
  open() {
    this.bg.style.display = 'flex';
    void this.bg.offsetWidth;
    this.bg.classList.add('open');
    this.sheet.classList.add('open');
    this.isOpen = true;
  }
  close() {
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
    const op = 1 - (this.currentY / window.innerHeight);
    this.bg.style.backgroundColor = `rgba(0,0,0,${Math.max(0, op * 0.55)})`;
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

/* ─── ROTA MAP ─── */
class RotaMap {
  constructor() {
    this.map = L.map('map', {
      center: [39.92, 32.85], zoom: 15,
      zoomControl: false, attributionControl: false, preferCanvas: true
    });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.uMk = null; this.uCr = null; this.rLine = null; this.rPts = [];
    this.arrowEl = null; this.rot = 0;
    this.hzLayer = L.layerGroup().addTo(this.map);
  }

  setArrowRotation(target) {
    const cur = ((this.rot % 360) + 360) % 360;
    const delta = ((target - cur + 540) % 360) - 180;
    this.rot += delta;
    if (this.arrowEl) this.arrowEl.style.transform = `rotate(${this.rot}deg)`;
  }

  updateUser(la, ln, ac, hdg, rotateMode) {
    const target = (rotateMode && Number.isFinite(hdg)) ? hdg : 0;

    if (!this.uMk) {
      const html = `<svg class="nav-arrow" viewBox="0 0 24 24"><path d="M12 2L2 22l10-4 10 4L12 2z" fill="#4d8eff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
      this.uMk = L.marker([la, ln], {
        icon: L.divIcon({
          className: '',
          html,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        }),
        interactive: false, keyboard: false
      }).addTo(this.map);
      this.uCr = L.circle([la, ln], {
        radius: 20, color: '#4d8eff', fillColor: '#4d8eff',
        fillOpacity: 0.1, weight: 1.5, interactive: false
      }).addTo(this.map);
    } else {
      this.uMk.setLatLng([la, ln]);
      this.uCr.setLatLng([la, ln]);
    }

    if (!this.arrowEl && this.uMk) {
      const el = this.uMk.getElement();
      if (el) this.arrowEl = el.querySelector('.nav-arrow');
    }

    if (ac) this.uCr.setRadius(clamp(ac, 8, 200));
    this.setArrowRotation(target);
  }

  addRoutePoint(la, ln) {
    const n = this.rPts.length;
    if (n > 0) {
      const [pla, pln] = this.rPts[n - 1];
      if (hav(pla, pln, la, ln) < 0.003) return;
    }
    this.rPts.push([la, ln]);

    if (this.rPts.length > 3000) {
      const simplified = [this.rPts[0]];
      let last = this.rPts[0];
      for (let i = 1; i < this.rPts.length - 1; i++) {
        const p = this.rPts[i];
        if (hav(last[0], last[1], p[0], p[1]) > 0.010) {
          simplified.push(p);
          last = p;
        }
      }
      simplified.push(this.rPts[this.rPts.length - 1]);
      this.rPts = simplified;
    }

    if (this.rPts.length > 1) {
      if (!this.rLine) {
        this.rLine = L.polyline(this.rPts, {
          color: '#4d8eff', weight: 4, opacity: 0.75, interactive: false
        }).addTo(this.map);
      } else {
        this.rLine.setLatLngs(this.rPts);
      }
    }
  }
  clearRoute() {
    this.rPts = [];
    if (this.rLine) { this.map.removeLayer(this.rLine); this.rLine = null; }
  }
  center(la, ln) {
    this.map.setView([la, ln], this.map.getZoom(), { animate: true, duration: 0.4 });
  }

  addHazard(la, ln) {
    const icon = L.divIcon({
      className: '',
      html: `<div class="hz-dot"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${WARN_SVG}</svg></div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14]
    });

    const mk = L.marker([la, ln], {
      icon,
      interactive: true,
      keyboard: false,
      riseOnHover: true
    });

    mk.bindPopup(
      `<div style="font-family:Inter,sans-serif;font-size:11px;color:#e8eaef;font-weight:600;">Tehlike Noktası</div>`,
      {
        className: 'hz-popup',
        closeButton: false,
        autoClose: true,
        closeOnClick: true,
        offset: [0, -4]
      }
    );

    mk.addTo(this.hzLayer);

    setTimeout(() => {
      try { this.hzLayer.removeLayer(mk); } catch (e) {}
    }, 1800000);

    return mk;
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
      lim: null,
      maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0, dist: 0,
      start: null, end: null, prev: null, prevT: null,
      tracking: false, gpsOn: false,
      smoothV: 0, dataAge: null, lastTK: '', gpsErr: ''
    };

    this.timers = { lim: null, wx: null, geo: null };
    this.busy   = { lim: false, wx: false, geo: false };
    this.cache  = {
      lim: { ts: 0, la: 0, ln: 0 },
      wx:  { ts: 0, code: null },
      geo: { ts: 0 }
    };

    this.wakeLock = null;
    this.watchId = null;
    this.audio = null;
    this.audioReady = false;
    this.lastB = 0;

    this.bindUI();
    this.startClock();

    $('o-center').checked = this.cfg.autoCenter;
    $('o-rotate').checked = this.cfg.rotateMode;
    $('o-sound').checked  = this.cfg.soundOn;
    $('o-wake').checked   = this.cfg.wakeOn;
    $('o-thr').value      = this.cfg.threshold;

    setTimeout(() => this.map.map.invalidateSize(), 300);
    window.addEventListener('resize', () => this.map.map.invalidateSize());

    this.render();
    this.checkAutoStart();
  }

  bindUI() {
    this.map.map.on('dragstart', () => {
      this.cfg.autoCenter = false;
      $('o-center').checked = false;
    });

    $('btn-save').addEventListener('click', () => {
      this.cfg.save(
        $('o-center').checked,
        $('o-rotate').checked,
        $('o-sound').checked,
        $('o-wake').checked,
        $('o-thr').value
      );
      $('o-thr').value = this.cfg.threshold;

      if (this.cfg.wakeOn && this.state.tracking) this.reqWake();
      else this.relWake();

      if (this.cfg.soundOn) this.unlockAudio();

      if (this.state.lat != null) {
        this.map.updateUser(
          this.state.lat, this.state.lng, this.state.acc,
          this.state.hdg, this.cfg.rotateMode
        );
      }
      this.render();
    });

    $('btn-loc').addEventListener('click', () => {
      if (this.state.lat != null) {
        this.map.center(this.state.lat, this.state.lng);
        this.cfg.autoCenter = true;
        $('o-center').checked = true;
        this.setTip('', 'Harita konumunuza odaklandı.', OK_SVG);
        this.state.lastTK = 'centered';
        setTimeout(() => {
          if (this.state.lastTK === 'centered') {
            this.state.lastTK = '';
            this.render();
          }
        }, 2000);
      } else {
        this.setTip('warn', 'Konum henüz hazır değil.', WARN_SVG);
        this.state.lastTK = 'noloc';
        setTimeout(() => {
          if (this.state.lastTK === 'noloc') {
            this.state.lastTK = '';
            this.render();
          }
        }, 2000);
      }
    });

    $('btn-hz').addEventListener('click', () => {
      if (this.state.lat != null) {
        this.map.addHazard(this.state.lat, this.state.lng);
        this.setTip('warn', 'Tehlike noktası işaretlendi.', WARN_SVG);
        this.state.lastTK = 'hazard';
        setTimeout(() => {
          if (this.state.lastTK === 'hazard') {
            this.state.lastTK = '';
            this.render();
          }
        }, 2500);
      } else {
        this.setTip('warn', 'Konum alınmadan işaretleme yapılamaz.', WARN_SVG);
        this.state.lastTK = 'nohaz';
        setTimeout(() => {
          if (this.state.lastTK === 'nohaz') {
            this.state.lastTK = '';
            this.render();
          }
        }, 2500);
      }
    });

    $('btn-go').addEventListener('click', () => this.toggleTracking());

    const unlock = () => {
      this.unlockAudio();
      if (this.audioReady) {
        document.removeEventListener('click', unlock);
        document.removeEventListener('touchend', unlock);
      }
    };
    document.addEventListener('click', unlock);
    document.addEventListener('touchend', unlock);

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        if (this.state.tracking && this.cfg.wakeOn) this.reqWake();
      }
    });
  }

  toggleTracking() {
    this.state.tracking = !this.state.tracking;
    const btn = $('btn-go');

    if (this.state.tracking) {
      if (this.watchId == null) this.startGPS();
      this.reqWake();
      this.map.clearRoute();
      Object.assign(this.state, {
        start: Date.now(), end: null,
        dist: 0, maxSpd: 0, avgSpd: 0, sumSpd: 0, spdN: 0,
        prev: null, prevT: null
      });
      if (this.state.lat != null) {
        this.map.addRoutePoint(this.state.lat, this.state.lng);
      }
      $('go-lbl').textContent = 'Sürüşü Durdur';
      btn.classList.remove('act-start');
      btn.classList.add('act-stop');
      btn.querySelector('svg').innerHTML = '<rect x="6" y="6" width="12" height="12" rx="2"/>';
    } else {
      this.state.end = Date.now();
      this.relWake();
      $('go-lbl').textContent = 'Sürüşü Başlat';
      btn.classList.remove('act-stop');
      btn.classList.add('act-start');
      btn.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
    this.render();
  }

  startGPS() {
    if (this.watchId != null) return;
    if (!navigator.geolocation) {
      this.gpsFail('Bu cihaz konum servisini desteklemiyor.');
      return;
    }
    if (window.isSecureContext === false) {
      this.gpsFail('Konum için güvenli bağlantı (HTTPS) gerekli.');
      return;
    }

    this.state.gpsErr = '';
    this.watchId = navigator.geolocation.watchPosition(
      p => this.onGPS(p),
      e => {
        if (e.code === 1) {
          navigator.geolocation.clearWatch(this.watchId);
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
    $('ft-dot').classList.add('on');
    $('ft-gps').textContent = 'Aranıyor';
    $('ft-gps').style.color = 'var(--amber)';
  }

  gpsFail(msg) {
    this.state.gpsOn = false;
    this.state.gpsErr = msg;
    $('ft-dot').classList.remove('on');
    $('ft-gps').textContent = 'Kapalı';
    $('ft-gps').style.color = 'var(--red)';
    this.render();
  }

  onGPS(p) {
    const { latitude: la, longitude: ln, speed: sp, heading: hd,
            altitude: al, accuracy: ac } = p.coords;
    const st = this.state;
    const now = p.timestamp || Date.now();

    if (st.gpsErr) st.gpsErr = '';
    $('ft-gps').textContent = 'Aktif';
    $('ft-gps').style.color = 'var(--green)';

    st.lat = la; st.lng = ln; st.acc = ac;
    st.alt = (al != null && Number.isFinite(al)) ? Math.round(al) : null;

    let raw;
    if (sp != null && Number.isFinite(sp) && sp >= 0) {
      raw = sp * 3.6;
    } else if (st.prev && st.prevT && now - st.prevT > 500) {
      raw = hav(st.prev[0], st.prev[1], la, ln) * 1000 /
            ((now - st.prevT) / 1000) * 3.6;
    } else {
      raw = st.smoothV;
    }
    if (raw < 2 && ac > 20) raw = 0;
    if (raw > 400) raw = st.smoothV;
    st.smoothV = st.smoothV * 0.3 + raw * 0.7;
    st.spd = Math.round(st.smoothV);

    if (hd != null && Number.isFinite(hd) && st.spd >= 3) st.hdg = hd;

    if (st.tracking) {
      if (st.spd > st.maxSpd) st.maxSpd = st.spd;
      if (st.spd > 0) {
        st.sumSpd += st.spd; st.spdN++;
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

    this.map.updateUser(la, ln, ac, st.hdg, this.cfg.rotateMode);
    if (this.cfg.autoCenter) this.map.center(la, ln);

    this.fetchServices(la, ln);
    this.render();
  }

  setStatus(id, ok, txt) {
    const el = $(id);
    if (!el) return;
    el.textContent = txt;
    el.className = 'm-status ' + (ok ? 'ok' : 'err');
  }

  fetchServices(la, ln) {
    const now = Date.now();

    if (!this.timers.lim && !this.busy.lim &&
        (now - this.cache.lim.ts > 12000 ||
         hav(la, ln, this.cache.lim.la, this.cache.lim.ln) > 0.15)) {
      this.cache.lim = { ts: now, la, ln };
      this.timers.lim = setTimeout(async () => {
        this.timers.lim = null;
        this.busy.lim = true;
        try {
          const q =
            `[out:json][timeout:6];` +
            `way(around:30,${la},${ln})` +
            `[highway~"^(motorway|trunk|primary|secondary|tertiary|residential|living_street|unclassified)$"]` +
            `[maxspeed];out tags geom;`;
          const j = await fetchJSON(
            'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q),
            9000
          );
          let best = null, bestD = Infinity;
          for (const el of (j.elements || [])) {
            const v = parseMaxspeed(el.tags && el.tags.maxspeed);
            if (!v) continue;
            const d = distToPolyline(la, ln, el.geometry);
            if (d < bestD) { bestD = d; best = v; }
          }
          this.state.lim = best;
          this.state.dataAge = Date.now();
          this.setStatus('st-lim', true, 'Aktif');
        } catch (e) {
          this.cache.lim.ts = now;
          this.setStatus('st-lim', false, 'Hata');
        } finally {
          this.busy.lim = false;
        }
      }, 800);
    }

    if (!this.timers.wx && !this.busy.wx &&
        (now - this.cache.wx.ts > 180000)) {
      this.cache.wx.ts = now - 120000;
      this.timers.wx = setTimeout(async () => {
        this.timers.wx = null;
        this.busy.wx = true;
        try {
          const j = await fetchJSON(
            `https://api.open-meteo.com/v1/forecast?latitude=${la}&longitude=${ln}` +
            `&current=temperature_2m,wind_speed_10m,weather_code&timezone=auto`
          );
          this.cache.wx = { ts: Date.now(), code: j.current.weather_code };
          $('is-temp').textContent = Math.round(j.current.temperature_2m) + '°C';
          $('is-wind').textContent = Math.round(j.current.wind_speed_10m) + ' km/s';
          this.setStatus('st-wx', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-wx', false, 'Hata');
        } finally {
          this.busy.wx = false;
        }
      }, 1500);
    }

    if (!this.timers.geo && !this.busy.geo &&
        (now - this.cache.geo.ts > 45000)) {
      this.cache.geo.ts = now - 30000;
      this.timers.geo = setTimeout(async () => {
        this.timers.geo = null;
        this.busy.geo = true;
        try {
          const j = await fetchJSON(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${la}&lon=${ln}` +
            `&zoom=17&addressdetails=1&accept-language=tr`
          );
          this.cache.geo.ts = Date.now();
          if (j.address) {
            const parts = [];
            if (j.address.road) parts.push(j.address.road);
            const sub = j.address.suburb || j.address.neighbourhood;
            if (sub) parts.push(sub);
            $('is-loc').textContent = parts.join(', ') || 'Bölge Saptandı';
            $('hdr-road').textContent = j.address.road || 'Navigasyon Sistemi';
          }
          this.setStatus('st-geo', true, 'Aktif');
        } catch (e) {
          this.setStatus('st-geo', false, 'Hata');
        } finally {
          this.busy.geo = false;
        }
      }, 2000);
    }
  }

  render() {
    const s = this.state, v = s.spd, lim = s.lim;

    $('spd-val').textContent = v;

    if (lim) {
      $('limit-badge').classList.remove('off');
      $('limit-num').textContent = lim;
    } else {
      $('limit-badge').classList.add('off');
      $('limit-num').textContent = '--';
    }

    const thr = 1 + this.cfg.threshold / 100;
    const over = !!(lim && v > lim * thr);
    const warn = !!(lim && v > lim && !over);

    $('ovr').classList.toggle('on', over);

    const bar = $('spd-bar-fill');
    if (over) {
      bar.style.background = 'var(--red)';
      $('spd-val').style.color = 'var(--red)';
      if (this.cfg.soundOn) this.beep();
    } else if (warn) {
      bar.style.background = 'var(--amber)';
      $('spd-val').style.color = 'var(--amber)';
    } else {
      bar.style.background = 'var(--accent)';
      $('spd-val').style.color = '';
    }

    const ref = lim ? lim * 1.3 : 220;
    const pct = clamp(v / ref, 0, 1);
    bar.style.width = (pct * 100) + '%';

    $('ss-max').textContent = s.maxSpd;
    $('ss-avg').textContent = s.avgSpd;
    $('ss-trip').textContent = s.dist.toFixed(1);

    if (s.start) {
      const el = Math.max(0, Math.floor(((s.end || Date.now()) - s.start) / 1000));
      const h = Math.floor(el / 3600);
      const m = Math.floor(el % 3600 / 60);
      const sec = el % 60;
      $('m-dur').textContent = h
        ? h + ':' + String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0')
        : String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0');
    } else {
      $('m-dur').textContent = '00:00';
    }

    $('m-alt').textContent = s.alt != null ? s.alt : '--';

    if (s.hdg != null && Number.isFinite(s.hdg)) {
      const dirs = ['K', 'KD', 'D', 'GD', 'G', 'GB', 'B', 'KB'];
      $('m-dir').textContent = dirs[Math.round(s.hdg / 45) % 8];
    } else {
      $('m-dir').textContent = '--';
    }

    const lv = s.acc == null ? 0
             : s.acc < 5  ? 4
             : s.acc < 15 ? 3
             : s.acc < 35 ? 2 : 1;
    $('ft-bars').querySelectorAll('.ft-bar').forEach((b, i) => {
      b.style.background = i < lv ? 'var(--green)' : 'var(--text-tertiary)';
    });

    const gpsTxt = $('ft-gps');
    if (this.state.gpsErr) {
      gpsTxt.textContent = 'Hata';
      gpsTxt.style.color = 'var(--red)';
    } else if (this.state.gpsOn && this.state.lat != null) {
      gpsTxt.textContent = 'Aktif';
      gpsTxt.style.color = 'var(--green)';
    } else if (this.state.gpsOn) {
      gpsTxt.textContent = 'Aranıyor';
      gpsTxt.style.color = 'var(--amber)';
    } else {
      gpsTxt.textContent = 'Kapalı';
      gpsTxt.style.color = 'var(--text-secondary)';
    }

    this.updateTip(over, warn, v);
  }

  updateTip(over, warn, v) {
    const wc = this.cache.wx.code;
    const wet = wc != null && (wc >= 51 || (wc >= 40 && wc <= 48));
    let t = '', tx = '', ic = INFO_SVG;

    if (this.state.gpsErr) {
      t = 'danger'; tx = this.state.gpsErr; ic = WARN_SVG;
    } else if (over) {
      t = 'danger';
      tx = `Limit aşıldı: ${v} km/s (Yasal Sınır: ${this.state.lim} km/s). Lütfen yavaşlayın.`;
      ic = WARN_SVG;
    } else if (warn) {
      t = 'warn';
      tx = `Hız sınırının üzerindesiniz. Limit: ${this.state.lim} km/s`;
    } else if (wet && v > 30) {
      t = 'warn';
      tx = 'Riskli hava koşulları (Yağış/Sis). Takip mesafenizi koruyun.';
    } else if (v > 120) {
      t = 'warn';
      tx = 'Yüksek sürat! Yol ve çevre koşullarına dikkat ediniz.';
    } else if (this.state.lim && v > 0 && v <= this.state.lim * 0.85) {
      t = ''; tx = 'Sürüş yasal sınırlar içerisinde güvenle devam ediyor.';
      ic = OK_SVG;
    } else if (v > 0) {
      t = ''; tx = 'Sürüş parametreleri aktif.';
    } else if (this.state.gpsOn && this.state.lat != null) {
      t = ''; tx = 'Konum kilitlendi, hareket verisi bekleniyor.';
    } else if (this.state.gpsOn) {
      t = ''; tx = 'Konum aranıyor…';
    } else {
      t = ''; tx = 'Başlamak için "Sürüşü Başlat" butonuna dokunun.';
    }

    const k = t + tx;
    if (k === this.state.lastTK) return;
    this.state.lastTK = k;
    this.setTip(t, tx, ic);
  }

  setTip(type, txt, svg) {
    const tip = $('tip');
    tip.style.display = txt ? 'flex' : 'none';
    tip.className = 'panel ' + type;
    $('tip-t').textContent = txt;
    $('tip-icon').innerHTML =
      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
  }

  unlockAudio() {
    try {
      if (!this.audio) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        this.audio = new AC();
      }
      if (this.audio.state === 'suspended') {
        this.audio.resume().then(() => {
          if (this.audio.state === 'running') this.audioReady = true;
        }).catch(() => {});
      } else if (this.audio.state === 'running') {
        this.audioReady = true;
      }
    } catch (e) {}
  }

  beep() {
    if (Date.now() - this.lastB < 5000) return;
    if (!this.audioReady || !this.audio || this.audio.state !== 'running') return;
    this.lastB = Date.now();
    try {
      const c = this.audio;
      const o = c.createOscillator();
      const g = c.createGain();
      o.connect(g); g.connect(c.destination);
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
      $('ft-clock').textContent = new Date().toLocaleTimeString('tr-TR', {
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

  checkAutoStart() {
    if (!navigator.permissions || !navigator.permissions.query) return;
    navigator.permissions.query({ name: 'geolocation' })
      .then(r => { if (r.state === 'granted') this.startGPS(); })
      .catch(() => {});
  }
}

/* ─── BOOTSTRAP ─── */
window.addEventListener('DOMContentLoaded', () => {
  window.RotaProApp = new AppManager();
});