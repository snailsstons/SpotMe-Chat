'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – STANDORT & KARTE (spot-location.js)
// + Speichert Zeitstempel der letzten erfolgreichen Standortaktualisierung
// ══════════════════════════════════════════════════════════════════════════════

async function toggleLocationSharing() {
  if (!myProfile || !myCode) { toast('⚠️ Profil unvollständig'); return; }
  if (isSharingLocation) {
    stopLocationSharing();
    isSharingLocation = false;
    localStorage.setItem('sm_spot_location', '0');
    updateLocationUI();
    toast('📍 Standortfreigabe beendet');
    userPosition = null;
    renderAll();
  } else {
    const success = await startLocationSharing();
    if (success) {
      isSharingLocation = true;
      localStorage.setItem('sm_spot_location', '1');
      updateLocationUI();
      toast('📍 Standort wird geteilt');
      renderAll();
    }
  }
}

async function startLocationSharing() {
  if (!navigator.geolocation) { toast('❌ Geolocation nicht unterstützt'); return false; }
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true }));
    userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    await sendLocationToServer(userPosition.lat, userPosition.lng);
    if (locationWatchId) navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = navigator.geolocation.watchPosition(
      async (pos) => {
        userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await sendLocationToServer(userPosition.lat, userPosition.lng);
        renderAll();
      },
      (err) => console.warn('Location watch error:', err),
      { enableHighAccuracy: true, maximumAge: 30000 }
    );
    if (locationTimer) clearInterval(locationTimer);
    locationTimer = setInterval(async () => {
      const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true })).catch(() => null);
      if (pos) {
        userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        await sendLocationToServer(userPosition.lat, userPosition.lng);
        renderAll();
      }
    }, LOCATION_UPDATE_INTERVAL);
    return true;
  } catch (e) { toast('⚠️ Standort nicht verfügbar'); return false; }
}

function stopLocationSharing() {
  if (locationWatchId) { navigator.geolocation.clearWatch(locationWatchId); locationWatchId = null; }
  if (locationTimer) { clearInterval(locationTimer); locationTimer = null; }
}

async function sendLocationToServer(lat, lng) {
  try {
    await fetch(API + '/location', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: myCode, lat, lng, spot: SPOT })
    });
    // 🆕 Zeitstempel der letzten erfolgreichen Aktualisierung speichern
    localStorage.setItem('sm_last_location_update', Date.now());
  } catch(e) {}
}

function showLocationOnMap(code, name, lat, lng) {
  currentTargetCode = code;
  currentTargetLat = lat;
  currentTargetLng = lng;
  const modal = document.getElementById('location-modal');
  const modalContent = document.getElementById('location-modal-content');
  document.getElementById('location-modal-name').textContent = name;
  modal.style.display = 'flex';
  modalContent.classList.remove('inside');
  document.getElementById('location-distance').classList.remove('inside');
  setTimeout(() => {
    if (!currentMap) {
      currentMap = L.map('location-map-small').setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(currentMap);
    } else { currentMap.setView([lat, lng], 14); }
    if (targetMarker) currentMap.removeLayer(targetMarker);
    targetMarker = L.marker([lat, lng], {
      icon: L.divIcon({ html: '<div style="background:#00e5c0;width:16px;height:16px;border-radius:50%;border:3px solid white;"></div>', iconSize: [22,22] })
    }).addTo(currentMap).bindPopup(name).openPopup();
    updateModalDistance();
    if (!userPosition) document.getElementById('location-distance').textContent = 'Tippe auf "Einchecken" für deine Position';
  }, 100);
}

async function performCheckIn() {
  const btn = document.getElementById('checkin-btn');
  btn.textContent = '⏳ Position wird ermittelt...';
  btn.disabled = true;
  if (!navigator.geolocation) { toast('❌ Geolocation nicht unterstützt'); btn.textContent = '📍 Hier einchecken'; btn.disabled = false; return; }
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 10000 }));
    userPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    if (myCode) {
      await sendLocationToServer(userPosition.lat, userPosition.lng);
      if (!isSharingLocation) {
        isSharingLocation = true;
        localStorage.setItem('sm_spot_location', '1');
        updateLocationUI();
        startLocationSharing();
      }
    }
    if (userMarker) currentMap.removeLayer(userMarker);
    userMarker = L.marker([userPosition.lat, userPosition.lng], {
      icon: L.divIcon({ html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;"></div>', iconSize: [22,22] })
    }).addTo(currentMap).bindPopup('Du').openPopup();
    updateModalDistance();
    toast('✅ Eingecheckt! Deine Position ist jetzt sichtbar.');
    renderAll();
  } catch (e) { toast('❌ Standort konnte nicht ermittelt werden'); }
  finally { btn.textContent = '📍 Hier einchecken'; btn.disabled = false; }
}

function updateModalDistance() {
  if (!userPosition || !currentTargetLat || !currentTargetLng) return;
  const dist = getDistance(userPosition.lat, userPosition.lng, currentTargetLat, currentTargetLng);
  const inside = dist <= DEFAULT_RADIUS;
  const distEl = document.getElementById('location-distance');
  distEl.textContent = `Entfernung: ${formatDistance(dist)} ${inside ? '– Ihr seid im Radius! 🎉' : ''}`;
  const modalContent = document.getElementById('location-modal-content');
  if (inside) { distEl.classList.add('inside'); modalContent.classList.add('inside'); }
  else { distEl.classList.remove('inside'); modalContent.classList.remove('inside'); }
}

function closeLocationModal(e) {
  if (e && e.target !== document.getElementById('location-modal')) return;
  document.getElementById('location-modal').style.display = 'none';
      }
