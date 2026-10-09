document.addEventListener("DOMContentLoaded", () => {
    const map = L.map('map', {
        preferCanvas: true, // Kasma önleyici
        zoomControl: false,
        minZoom: 4,         // Uzaklaştırma çökmesi önleyici
        maxZoom: 18,
        maxBounds: [[-90, -180], [90, 180]],
        maxBoundsViscosity: 1.0
    }).setView([39.92077, 32.85411], 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        updateWhenIdle: true,
        keepBuffer: 2
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    const routeLayer = L.layerGroup().addTo(map);
    const markerLayer = L.layerGroup().addTo(map);

    let userLocation = null;
    let userMarker = null;

    const locateUser = () => {
        if (!navigator.geolocation) {
            alert("Tarayıcınız konum özelliğini desteklemiyor.");
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                userLocation = L.latLng(lat, lng);

                if (userMarker) {
                    userMarker.setLatLng(userLocation);
                } else {
                    const userIcon = L.divIcon({
                        className: 'custom-user-icon',
                        html: `<div></div>`,
                        iconSize: [16, 16],
                        iconAnchor: [8, 8]
                    });
                    userMarker = L.marker(userLocation, { icon: userIcon }).addTo(markerLayer);
                }

                map.flyTo(userLocation, 15, { duration: 1.5 });
            },
            (error) => {
                console.warn("Konum alınamadı:", error);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 10000 }
        );
    };

    const drawRoute = async () => {
        const destInput = document.getElementById('destination').value.trim();
        
        if (!destInput) return;
        if (!userLocation) {
            alert("Önce konumunuzun bulunması gerekiyor.");
            locateUser();
            return;
        }

        try {
            const searchRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destInput)}`);
            const searchData = await searchRes.json();

            if (searchData.length === 0) {
                alert("Girdiğiniz konum bulunamadı.");
                return;
            }

            const destLat = parseFloat(searchData[0].lat);
            const destLon = parseFloat(searchData[0].lon);
            const destPoint = L.latLng(destLat, destLon);

            routeLayer.clearLayers();
            
            const destMarker = L.marker(destPoint).addTo(routeLayer);
            destMarker.bindPopup(searchData[0].display_name).openPopup();

            const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${userLocation.lng},${userLocation.lat};${destPoint.lng},${destPoint.lat}?overview=full&geometries=geojson`;
            
            const routeRes = await fetch(osrmUrl);
            const routeData = await routeRes.json();

            if (routeData.routes && routeData.routes.length > 0) {
                const coords = routeData.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
                
                const polyline = L.polyline(coords, {
                    color: '#007bff',
                    weight: 5,
                    opacity: 0.8,
                    smoothFactor: 2.0
                }).addTo(routeLayer);

                map.fitBounds(polyline.getBounds(), { padding: [50, 50] });
            }
        } catch (err) {
            console.error("Rota hatası:", err);
            alert("Rota hesaplanırken bir hata oluştu. Lütfen tekrar deneyin.");
        }
    };

    document.getElementById('locateBtn').addEventListener('click', locateUser);
    document.getElementById('routeBtn').addEventListener('click', drawRoute);
    
    document.getElementById('destination').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            drawRoute();
        }
    });

    document.getElementById('clearBtn').addEventListener('click', () => {
        document.getElementById('destination').value = '';
        routeLayer.clearLayers();
        if (userLocation) map.flyTo(userLocation, 15);
    });

    setTimeout(locateUser, 500);
});