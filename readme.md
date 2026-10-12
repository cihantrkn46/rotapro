# RotaPro — Sürücü Asistanı

**Modern, API anahtarsız (keyless) mobil sürücü asistanı.** Hız limiti takibi, şerit göstergesi, kamera uyarısı, sesli navigasyon ve yakıt analizi tek bir PWA'da.

![RotaPro](icon-192.png)

## ✨ Özellikler

- 🚗 **Anlık hız göstergesi** — hız limitine göre renk değiştiren gösterge
- 🛣️ **Şerit takip göstergesi** — OSM `lanes` etiketinden yol şerit sayısı
- 📷 **Hız kamerası uyarısı** — hız-duyarlı erken uyarı + yön filtresi
- 🗺️ **Navigasyon** — OSRM tabanlı, sesli Türkçe yol tarifi
- ⛅ **Hava durumu + yol durumu** — Open-Meteo, buzlanma/yağış uyarısı
- ⛽ **Yakıt analizi** — benzin/dizel/LPG/elektrik, anlık tüketim + maliyet
- 🌗 **Otomatik tema** — gün doğumu/batımına göre açık/koyu harita
- 🎨 **Hız renkli trail** — sürüş izi hıza göre renklenir (yeşil→kırmızı)
- 📊 **Hata günlüğü** — son 50 hata ayarlarda görüntülenir
- 📴 **PWA** — ana ekrana eklenebilir, offline kabuk desteği

## 🚀 Kurulum

Klonla ve basit bir HTTP sunucusu ile çalıştır:

```bash
git clone https://github.com/KULLANICI_ADIN/rotapro.git
cd rotapro
python3 -m http.server 8000
```

Tarayıcıda aç: **http://localhost:8000**

> **Not:** GPS ve Service Worker için **HTTPS gerekir**. Localhost istisnadır.

## 🌐 Yayına Alma (Hosting)

| Servis | Ücretsiz | Not |
|--------|---------|-----|
| **GitHub Pages** | ✅ | Settings → Pages → main branch |
| **Cloudflare Pages** | ✅ | Otomatik HTTPS + CDN |
| **Vercel** | ✅ | Git push ile otomatik deploy |
| **Netlify** | ✅ | Sürükle-bırak bile yeter |

**GitHub Pages için:**
1. Repo → **Settings** → **Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `root`
4. Kaydet → `https://KULLANICI_ADIN.github.io/rotapro/`

## 🧰 Teknoloji

- **Harita:** [Leaflet 1.9.4](https://leafletjs.com/) + [CARTO](https://carto.com/) karoları
- **Yol verisi:** [OpenStreetMap](https://www.openstreetmap.org/) + [Overpass API](https://overpass-api.de/)
- **Rota:** [OSRM](http://project-osrm.org/)
- **Adres:** [Nominatim](https://nominatim.openstreetmap.org/)
- **Hava:** [Open-Meteo](https://open-meteo.com/)
- **Bağımlılık:** Sadece Leaflet (CDN). Başka framework yok.
- **API anahtarı:** Yok.

## 📱 Tarayıcı Desteği

- ✅ Chrome / Edge (Android + masaüstü)
- ✅ Safari (iOS 15+)
- ✅ Firefox (kısmi, Web Audio farkı)
- ❌ IE / eski Android WebView

## 🔒 Gizlilik

- Hiçbir veri sunucuya gönderilmez
- Tüm ayarlar, kamera bildirimleri, hata günlüğü **cihazda** (`localStorage`)
- GPS konumu sadece yerel olarak işlenir
- Konum paylaşımı yok

## ⚠️ Yasal Uyarı

Bu uygulama **yardımcı bilgi** sağlar. Yasal hız limitleri, trafik kuralları ve yol güvenliği **sürücünün sorumluluğundadır**. Uygulama bir hız cezası, kaza veya hasardan sorumlu tutulamaz.

## 📜 Lisans

MIT — bkz. [LICENSE](LICENSE)

## 👨‍💻 Geliştirici

**MCT YAZILIM**