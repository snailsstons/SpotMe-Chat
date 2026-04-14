'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – LOCATION SHARING (p2p-location.js)
// Leaflet-Karte, Live-Standort, Entfernungsanzeige
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Globale Location-Variablen (werden in config.js definiert)
// locationMap, myMarker, partnerMarker, myPosition, partnerPosition
// locationWatchId, locationInterval, currentRadius

// ─────────────────────────────────────────────────────────────────────────────
// Screen öffnen / schließen
function openLocationScreen() {
  if (!conn || !conn.open) {
    toast('⚠️ Keine aktive Verbindung');
    return;
  }
  showScreen('s-location');
  initLocationMap();
  startLocationSharing();
}

function closeLocationScreen() {
  stopLocationSharing();
  showScreen('s-chat');
}

// ─────────────────────────────────────────────────────────────────────────────
// Karte initialisieren
function initLocationMap() {
  if (locationMap) return;
  locationMap = L.map('location-map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(locationMap);

  myMarker = L.marker([0, 0], { icon: blueIcon() }).addTo(locationMap).bindPopup('Ich').openPopup();
  partnerMarker = L.marker([0, 0], { icon: greenIcon() }).addTo(locationMap).bindPopup(partnerName || 'Partner');

  const slider = document.getElementById('radius-slider');
  slider.addEventListener('input', () => {
    currentRadius = parseInt(slider.value);
    document.getElementById('radius-value').textContent = formatDistance(currentRadius);
    updateDistanceDisplay();
  });
}

// Icons für Marker
function blueIcon() {
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #3b82f6;"></div>',
    iconSize: [22, 22],
    popupAnchor: [0, -11]
  });
}

function greenIcon() {
  return L.divIcon({
    className: 'custom-div-icon',
    html: '<div style="background:#1ecc68;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #1ecc68;"></div>',
    iconSize: [22, 22],
    popupAnchor: [0, -11]
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Standortverfolgung starten / stoppen
function startLocationSharing() {
  if (locationWatchId) return;
  document.getElementById('location-status').textContent = 'Warte auf GPS...';
  if (navigator.geolocation) {
    locationWatchId = navigator.geolocation.watchPosition(
      pos => {
        myPosition = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        };
        updateMyMarker();
        sendLocationUpdate();
        document.getElementById('location-status').textContent =
          `GPS aktiv (Genauigkeit: ±${Math.round(pos.coords.accuracy)}m)`;
      },
      err => {
        toast('⚠️ Standort nicht verfügbar');
        document.getElementById('location-status').textContent = 'Standortfehler';
      },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  } else {
    toast('❌ Geolocation nicht unterstützt');
  }
  locationInterval = setInterval(() => {
    if (myPosition) sendLocationUpdate();
  }, 5000);
}

function stopLocationSharing() {
  if (locationWatchId) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  if (locationInterval) {
    clearInterval(locationInterval);
    locationInterval = null;
  }
  myPosition = null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Positionsdaten senden / Marker aktualisieren
function sendLocationUpdate() {
  if (!conn || !conn.open || !myPosition) return;
  conn.send({
    t: 'location_update',
    lat: myPosition.lat,
    lng: myPosition.lng,
    accuracy: myPosition.accuracy
  });
}

function updateMyMarker() {
  if (!myMarker || !myPosition) return;
  myMarker.setLatLng([myPosition.lat, myPosition.lng]);
  locationMap.setView([myPosition.lat, myPosition.lng], locationMap.getZoom());
  updateDistanceDisplay();
}

function updatePartnerMarker(lat, lng) {
  if (!partnerMarker) return;
  partnerMarker.setLatLng([lat, lng]);
  partnerMarker.getPopup().setContent(partnerName || 'Partner');
  updateDistanceDisplay();
}

// ─────────────────────────────────────────────────────────────────────────────
// Entfernungsberechnung & Anzeige
function updateDistanceDisplay() {
  const infoEl = document.getElementById('distance-info');
  const statusEl = document.getElementById('location-status-text');
  if (!myPosition || !partnerPosition) {
    infoEl.textContent = 'Warte auf Position des Partners...';
    infoEl.className = 'distance-info';
    statusEl.textContent = '○ Warte auf Partner';
    return;
  }
  const dist = getDistance(myPosition.lat, myPosition.lng, partnerPosition.lat, partnerPosition.lng);
  const inside = dist <= currentRadius;
  infoEl.textContent = `Entfernung: ${formatDistance(dist)} ${inside ? '– Ihr seid im Radius!' : ''}`;
  infoEl.className = 'distance-info' + (inside ? ' inside' : '');
  statusEl.textContent = inside ? '✅ Innerhalb des Radius' : '📍 Außerhalb';
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(m) {
  if (m < 1000) return Math.round(m) + ' m';
  return (m / 1000).toFixed(1) + ' km';
}