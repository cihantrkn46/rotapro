/** RotaPro - Minimalist Apple/Google Takip Mimarisi & PWA */
'use strict';

const $ = id => document.getElementById(id);

// PWA Service Worker Kurulumu
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Başarısız:', err));
  });
}

// Ana Ekrana Ekle (PWA) Install Prompt Yakalayıcı
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $('btn-install').style.display = 'flex'; // Yükle butonunu göster
});
$('btn-install').addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') $('btn-install').style.display = 'none';
    deferredPrompt = null;
  } else {
    // iOS Safari için manuel uyarı
    alert("Bu uygulamayı ana ekrana eklemek için tarayıcınızın 'Paylaş' ikonuna dokunup 'Ana Ekrana Ekle' (Add to Home Screen) seçeneğini seçin.");
  }
});

class App {
  constructor() {
    this.map = L.map('map', { center: [39.92, 32.85], zoom: 16, zoomControl: false, attributionControl: false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', { maxZoom: 19 }).addTo(this.map);
    
    this.uMarker = null;
    this.hazards = []; // Bırakılan rozetler
    this.tracking = false;
    this.watchId = null;
    this.speed = 0;
    this.limit = null; // Test için API'den gelecek
    this.autoCenter = true;

    this.bindEvents();
  }

  bindEvents() {
    $('btn-go').addEventListener('click', () => this.toggleTracking());
    $('btn-loc').addEventListener('click', () => { this.autoCenter = true; this.centerMap(); });$('btn-hz').addEventListener('click', () => this.dropHazard());
    
    // Ayarlar Sheet
    $('btn-cfg').addEventListener('click', () => {$('sheet-bg').style.display = 'flex'; setTimeout(() => $('sheet-bg').classList.add('open', 'sheet-open'), 10);$('sheet').classList.add('open'); });
    $('btn-save').addEventListener('click', () => {$('sheet-bg').classList.remove('open'); $('sheet').classList.remove('open'); setTimeout(() =>$('sheet-bg').style.display = 'none', 300); });
    
    // Haritayı kaydırınca otomatik merkezlemeyi kapat
    this.map.on('dragstart', () => { this.autoCenter = false; });
  }

  toggleTracking() {
    this.tracking = !this.tracking;
    const btn = $('btn-go');
    if (this.tracking) {
      btn.classList.add('active');
      $('go-lbl').textContent = 'Sürüş Aktif';
      this.startGPS();
      this.showToast('Başladı', 'Sürüş kaydediliyor, güvende kalın.', 'info');
    } else {
      btn.classList.remove('active');
      $('go-lbl').textContent = 'Sürüşü Başlat';
      $('spd-val').textContent = '0';
      if(this.watchId) navigator.geolocation.clearWatch(this.watchId);
    }
  }

  startGPS() {
    if (!navigator.geolocation) return this.showToast('Hata', 'GPS desteklenmiyor', 'danger');
    this.watchId = navigator.geolocation.watchPosition(
      pos => this.updatePosition(pos),
      err => this.showToast('GPS Hatası', 'Konum bulunamadı', 'danger'),
      { enableHighAccuracy: true, maximumAge: 1000 }
    );
  }

  updatePosition(pos) {
    const { latitude: lat, longitude: lng, speed, heading } = pos.coords;
    this.lat = lat; this.lng = lng;
    
    // Hız hesapla (m/s -> km/s)
    let s = speed ? Math.round(speed * 3.6) : 0;
    $('spd-val').textContent = s;
    
    // Mavi nokta ikonu oluşturma (Pulse effect ile Google/Apple tarzı)
    if (!this.uMarker) {
      const icon = L.divIcon({
        className: 'user-marker',
        html: `<div class="pulse-halo"></div><div class="blue-dot"></div>`,
        iconSize: [0, 0]
      });
      this.uMarker = L.marker([lat, lng], { icon }).addTo(this.map);
    } else {
      this.uMarker.setLatLng([lat, lng]);
    }

    if (this.autoCenter) this.centerMap();
    this.checkHazards(lat, lng);
  }

  centerMap() {
    if (this.lat && this.lng) {
      this.map.setView([this.lat, this.lng], 17, { animate: true, duration: 0.5 });
    }
  }

  // Rozet / Tehlike Bırakma
  dropHazard() {
    if (!this.lat) return this.showToast('Uyarı', 'Konum henüz alınamadı', 'warn');
    
    const icon = L.divIcon({
      className: '',
      html: `<div class="hz-marker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>`,
      iconSize: [34, 34], iconAnchor: [17, 17]
    });

    const marker = L.marker([this.lat, this.lng], { icon }).addTo(this.map);
    this.hazards.push({ lat: this.lat, lng: this.lng, marker });
    this.showToast('Rozet Eklendi', 'Bu bölgedeki diğer sürücüler uyarılacak.', 'warn');
    this.playBeep();
  }

  // Tehlikeye Yaklaşma Kontrolü
  checkHazards(lat, lng) {
    this.hazards.forEach(hz => {
      const dist = this.map.distance([lat, lng], [hz.lat, hz.lng]);
      if (dist < 150 && !hz.warned) {
        hz.warned = true; // Sadece bir kere uyar
        this.showToast('DİKKAT', 'İleride işaretlenmiş tehlike var!', 'danger');
        this.playBeep(3); // 3 kez öt
      }
    });
  }

  showToast(title, msg, type = 'info') {
    const t = $('tip');
    t.className = `glass-panel toast ${type}`;
    $('tip-t').innerHTML = `<b>${title}</b> ${msg}`;
    t.style.display = 'flex';
    setTimeout(() => { t.style.display = 'none'; }, 4000);
  }

  playBeep(times = 1) {
    if (!$('o-sound').checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      let i = 0;
      const beep = () => {
        if(i >= times) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 800; osc.type = 'sine';
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
        i++;
        setTimeout(beep, 400);
      };
      beep();
    } catch(e) {}
  }
}

window.addEventListener('DOMContentLoaded', () => { window.App = new App(); });