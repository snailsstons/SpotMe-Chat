'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOT ME RADAR – JAVASCRIPT
// ══════════════════════════════════════════════════════════════════════════════

const API = 'https://spotme-chat.onrender.com/api';
const PROFILE_KEY = 'sm_profile';
const KEEPALIVE_INTERVAL = 8 * 60 * 1000;      // 8 Minuten (Profil-Refresh)
const LOCATION_UPDATE_INTERVAL = 30000;        // 30 Sekunden
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;   // 5 Minuten
const DEFAULT_RADIUS = 500;

let myProfile = null;
let myCode = localStorage.getItem('sm_code') || '';
let isPublished = false;
let isSharingLocation = false;
let allProfiles = [];
let filtered = [];
let keepaliveTimer = null;
let locationTimer = null;
let locationWatchId = null;
let userPosition = null;
let autoRefreshTimer = null;

let currentTargetCode = null;
let currentTargetLat = null, currentTargetLng = null;
let currentMap = null, userMarker = null, targetMarker = null;

const locationCache = new Map();

const REGIONS = [
  'Andalusien','Aragón','Asturien','Balearen','Baskenland',
  'Extremadura','Galicien','Kanaren','Kantabrien',
  'Kastilien-La Mancha','Kastilien-León','Katalonien',
  'La Rioja','Madrid','Murcia','Navarra','Valencia (Region)'
];

window.addEventListener('load', async () => {
  buildRegionFilter();
  loadMyProfile();
  await loadCommunity();
  if (isPublished && myProfile) await verifyAndRepublish();
  startKeepalive();
  startAutoRefresh();
  isSharingLocation = localStorage.getItem('sm_spot_location') === '1';
  updateLocationUI();
  if (isSharingLocation) await startLocationSharing();
  renderAll();
  
  // Eigene Region im Filter vorauswählen, falls vorhanden
  if (myProfile && myProfile.region) {
    const regionSelect = document.getElementById('f-region');
    if (regionSelect) {
      regionSelect.value = myProfile.region;
      applyFilters(); // Filter sofort anwenden
    }
  }
});

function goHome() { window.location.href = 'index.html'; }

async function refreshSpot() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    await loadCommunity();
    renderAll();
    toast('🔄 Community aktualisiert');
  } catch (e) {
    toast('⚠️ Aktualisierung fehlgeschlagen');
  } finally {
    btn.classList.remove('spinning');
  }
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    loadCommunity().then(() => renderAll()).catch(e => console.warn('Auto-refresh fehlgeschlagen', e));
  }, AUTO_REFRESH_INTERVAL);
}

function buildRegionFilter() {
  const sel = document.getElementById('f-region');
  REGIONS.forEach(r => { const o = document.createElement('option'); o.value = o.textContent = r; sel.appendChild(o); });
}

function loadMyProfile() {
  const raw = localStorage.getItem(PROFILE_KEY);
  if (!raw) { document.getElementById('profile-bar').style.display = 'none'; return; }
  try { myProfile = JSON.parse(raw); } catch { return; }
  document.getElementById('profile-bar').style.display = 'flex';
  const av = document.getElementById('my-avatar-small');
  if (myProfile.avatar) av.innerHTML = `<img src="${myProfile.avatar}" alt="Avatar">`;
  else av.textContent = myProfile.name ? myProfile.name[0].toUpperCase() : '🧑';
  document.getElementById('my-name-small').textContent = myProfile.name || '—';
  const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
  const loc = [myProfile.city, myProfile.region].filter(Boolean).join(', ');
  const meta = [age ? age + ' J.' : null, loc].filter(Boolean).join(' · ');
  document.getElementById('my-meta-small').textContent = meta || 'Kein Ort angegeben';
  isPublished = localStorage.getItem('sm_spot_published') === '1';
  updatePublishUI();
}

function updatePublishUI() {
  const btn = document.getElementById('publish-toggle-small');
  btn.classList.toggle('active', isPublished);
  btn.title = isPublished ? 'In Community sichtbar' : 'Nicht sichtbar';
}

function updateLocationUI() {
  const btn = document.getElementById('location-toggle-small');
  btn.classList.toggle('active', isSharingLocation);
  btn.title = isSharingLocation ? 'Standort wird geteilt' : 'Standort teilen';
}

async function togglePublish() {
  if (!myProfile || !myCode) { toast('⚠️ Profil unvollständig'); return; }
  if (!myProfile.name || !myProfile.region) { toast('⚠️ Profilname und Region sind Pflicht'); return; }
  const btn = document.getElementById('publish-toggle-small');
  btn.style.opacity = '.5'; btn.style.pointerEvents = 'none';
  try {
    if (isPublished) {
      await fetch(API + '/profile/' + myCode, { method: 'DELETE' });
      isPublished = false;
      localStorage.setItem('sm_spot_published', '0');
      toast('○ Profil aus Community entfernt');
    } else {
      const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
      const payload = {
        code: myCode, name: myProfile.name, age,
        region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
        orientation: myProfile.orientation || null, role: myProfile.role || null,
        trans: myProfile.trans || false, cross: myProfile.cross || false, bio: myProfile.bio || null
      };
      const res = await fetch(API + '/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      isPublished = true;
      localStorage.setItem('sm_spot_published', '1');
      toast('✅ Profil veröffentlicht');
    }
    updatePublishUI();
    await loadCommunity();
    renderAll();
  } catch(e) { toast('⚠️ Fehler: ' + e.message); }
  finally { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
}

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
      body: JSON.stringify({ code: myCode, lat, lng })
    });
  } catch(e) {}
}

async function loadCommunity() {
  const res = await fetch(API + '/profiles');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  allProfiles = await res.json();
  await Promise.all(allProfiles.map(p => fetchLocationForProfile(p.code)));
  applyFilters();
}

async function fetchLocationForProfile(code) {
  if (locationCache.has(code)) return locationCache.get(code);
  try {
    const res = await fetch(API + '/location/' + code);
    if (res.ok) {
      const data = await res.json();
      locationCache.set(code, data);
      return data;
    }
  } catch(e) {}
  locationCache.set(code, null);
  return null;
}

function toggleChip(el) {
  el.classList.toggle('active');
  applyFilters();
}

function applyFilters() {
  const region = document.getElementById('f-region').value;
  const ageRange = document.getElementById('f-age').value;
  const chips = [...document.querySelectorAll('.filter-chip.active')].map(c => c.dataset.filter);
  
  filtered = allProfiles.filter(p => {
    if (myCode && p.code === myCode) return false;
    if (region && p.region !== region) return false;
    if (ageRange && p.age) {
      const [lo, hi] = ageRange === '50+' ? [50,999] : ageRange.split('-').map(Number);
      if (p.age < lo || p.age > hi) return false;
    }
    const oCh = chips.filter(f => ['homo','bi','hetero'].includes(f));
    if (oCh.length && (!p.orientation || !oCh.includes(p.orientation))) return false;
    const rCh = chips.filter(f => ['bottom','top','versatile'].includes(f));
    if (rCh.length && (!p.role || !rCh.includes(p.role))) return false;
    if (chips.includes('trans') && !p.trans) return false;
    if (chips.includes('cross') && !p.cross) return false;   // ← Crossdresser-Filter
    return true;
  });
  renderAll();
}

function resetFilters() {
  document.getElementById('f-region').value = '';
  document.getElementById('f-age').value = '';
  document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
  applyFilters();
}

function renderAll() {
  renderRadar();
  renderList();
}

function renderRadar() {
  const field = document.getElementById('radar-field');
  field.querySelectorAll('.peer-node').forEach(n => n.remove());
  const maxDist = 5000;
  const profilesWithLocation = filtered.filter(p => locationCache.get(p.code) != null);
  
  profilesWithLocation.forEach(profile => {
    const loc = locationCache.get(profile.code);
    let distance = null;
    if (userPosition) {
      distance = getDistance(userPosition.lat, userPosition.lng, loc.lat, loc.lng);
    } else {
      const hash = profile.code.split('').reduce((a,b) => a + b.charCodeAt(0), 0);
      distance = (hash % 4000) + 500;
    }
    const normalized = Math.min(distance, maxDist) / maxDist;
    const angle = (profile.code.split('').reduce((a,b) => a + b.charCodeAt(0), 0) % 360) * (Math.PI / 180);
    const x = 50 + (Math.cos(angle) * (normalized * 50));
    const y = 50 + (Math.sin(angle) * (normalized * 50));
    
    const node = document.createElement('div');
    node.className = 'peer-node';
    node.style.left = x + '%';
    node.style.top = y + '%';
    node.setAttribute('data-label', `${profile.name || '?'} (${formatDistance(distance)})`);
    node.onclick = () => showLocationOnMap(profile.code, profile.name, loc.lat, loc.lng);
    field.appendChild(node);
  });
  
  document.getElementById('status-indicator').textContent = `● ${profilesWithLocation.length} RADAR`;
}

function renderList() {
  const listEl = document.getElementById('community-list');
  const countEl = document.getElementById('community-count');
  const n = filtered.length;
  countEl.innerHTML = `<b>${n}</b> ${n === 1 ? 'Profil' : 'Profile'} gefunden`;
  
  if (!n) {
    listEl.innerHTML = `<div style="width:100%; text-align:center; padding:1.5rem; color:var(--muted);">Keine Profile gefunden</div>`;
    return;
  }
  
  listEl.innerHTML = filtered.map(p => {
    const initial = p.name ? p.name[0].toUpperCase() : '?';
    const age = p.age ? `${p.age} J.` : '? J.';
    const loc = [p.city, p.region].filter(Boolean).join(', ');
    const ago = timeAgo(p.ts);
    const isOwn = p.code === myCode;
    
    let badges = '';
    if (p.orientation) {
      const lbl = { homo:'🏳️‍🌈 Homo', bi:'Bi', hetero:'Hetero' }[p.orientation] || p.orientation;
      badges += `<span class="badge badge-${p.orientation}">${esc(lbl)}</span>`;
    }
    if (p.role) {
      const lbl = { bottom:'Bottom', top:'Top', versatile:'Versatile' }[p.role] || p.role;
      badges += `<span class="badge badge-role">${esc(lbl)}</span>`;
    }
    if (p.trans) badges += `<span class="badge badge-trans">Trans</span>`;
    if (p.cross) badges += `<span class="badge badge-cross">Crossdresser</span>`;
    if (isOwn) badges += `<span class="badge" style="background:rgba(0,229,192,.08);color:var(--acc);border-color:rgba(0,229,192,.2)">● Du</span>`;
    
    const locData = locationCache.get(p.code);
    let locationBadge = '';
    if (locData && !isOwn) {
      const distStr = userPosition ? formatDistance(getDistance(userPosition.lat, userPosition.lng, locData.lat, locData.lng)) : '';
      locationBadge = `<span class="location-badge" onclick="showLocationOnMap('${p.code}', '${esc(p.name)}', ${locData.lat}, ${locData.lng})">📍 ${distStr}</span>`;
    }
    
    const bio = p.bio ? `<div class="card-bio">${esc(p.bio)}</div>` : '';
    const cardClass = p.orientation ? ` ${p.orientation}` : '';
    const chatBtn = isOwn ? `<span style="font-size:.75rem;color:var(--muted)">Dein Profil</span>` : `<button class="btn-chat" onclick="startChat('${esc(p.code)}','${esc(p.name)}')">💬 Chat</button>`;
    
    return `<div class="profile-card${cardClass}">
      <div class="card-top"><div class="card-av">${esc(initial)}</div><div class="card-info"><div class="card-name">${esc(p.name)}${locationBadge}</div><div class="card-age-loc">${esc(age)} · <b>${esc(loc)}</b></div></div><div class="online-dot" title="Online in den letzten 24h"></div></div>
      ${badges ? `<div class="card-badges">${badges}</div>` : ''}
      ${bio}
      <div class="card-footer"><div class="card-time">🕐 ${ago}</div>${chatBtn}</div>
    </div>`;
  }).join('');
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

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3, φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(m) {
  if (m < 1000) return Math.round(m) + ' m';
  return (m/1000).toFixed(1) + ' km';
}

function startKeepalive() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = setInterval(async () => {
    if (isPublished && myProfile) {
      try { 
        const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
        await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: myCode, name: myProfile.name, age,
            region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
            orientation: myProfile.orientation || null, role: myProfile.role || null,
            trans: myProfile.trans || false, cross: myProfile.cross || false, bio: myProfile.bio || null
          })
        });
      } catch(e) {}
    }
    await loadCommunity();
  }, KEEPALIVE_INTERVAL);
}

async function verifyAndRepublish() {
  try {
    const res = await fetch(API + '/profile/' + myCode);
    if (res.status === 404) await togglePublish();
  } catch(e) {}
}

function startChat(code, name) {
  sessionStorage.setItem('sm_connect_to', code);
  sessionStorage.setItem('sm_connect_name', name);
  window.location.href = 'index.html';
}

function timeAgo(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 2) return 'gerade aktiv';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.floor(h/24)} Tag${Math.floor(h/24)>1?'en':''}`;
}

function esc(s) { if (!s) return ''; const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function toast(msg, ms = 2800) {
  const el = document.getElementById('toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// ═══════════════════════════════════════════════════════════════════
// Profil-Detail-Modal
// ═══════════════════════════════════════════════════════════════════
function showProfileDetail(profile) {
  const modal = document.getElementById('profile-detail-modal');
  const content = document.getElementById('profile-detail-content');
  
  const initial = profile.name ? profile.name[0].toUpperCase() : '?';
  const age = profile.age ? `${profile.age} J.` : '? J.';
  const loc = [profile.city, profile.region].filter(Boolean).join(', ');
  const isOwn = profile.code === myCode;
  
  let badges = '';
  if (profile.orientation) {
    const lbl = { homo:'🏳️‍🌈 Homo', bi:'Bi', hetero:'Hetero' }[profile.orientation] || profile.orientation;
    badges += `<span class="badge badge-${profile.orientation}">${esc(lbl)}</span>`;
  }
  if (profile.role) {
    const lbl = { bottom:'Bottom', top:'Top', versatile:'Versatile' }[profile.role] || profile.role;
    badges += `<span class="badge badge-role">${esc(lbl)}</span>`;
  }
  if (profile.trans) badges += `<span class="badge badge-trans">Trans</span>`;
  if (profile.cross) badges += `<span class="badge badge-cross">Crossdresser</span>`;
  
  const bio = profile.bio ? `<div class="detail-bio">${esc(profile.bio)}</div>` : '<div class="detail-bio" style="color:var(--muted);font-style:italic;">Keine Beschreibung vorhanden</div>';
  
  const locData = locationCache.get(profile.code);
  const locationBtn = (locData && !isOwn) 
    ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail(); showLocationOnMap('${profile.code}', '${esc(profile.name)}', ${locData.lat}, ${locData.lng})">📍 Standort</button>` 
    : '';
  
  const chatBtn = isOwn 
    ? `<button class="detail-btn btn-secondary" disabled style="opacity:0.5;">Dein Profil</button>` 
    : `<button class="detail-btn btn-primary" onclick="closeProfileDetail(); startChat('${esc(profile.code)}','${esc(profile.name)}')">💬 Chat</button>`;
  
  content.innerHTML = `
    <div class="detail-avatar">${esc(initial)}</div>
    <div class="detail-name">${esc(profile.name)}</div>
    <div class="detail-location">${esc(age)} · ${esc(loc)}</div>
    ${badges ? `<div class="detail-badges">${badges}</div>` : ''}
    ${bio}
    <div class="detail-footer">
      ${locationBtn}
      ${chatBtn}
    </div>
  `;
  
  modal.style.display = 'flex';
}

function closeProfileDetail() {
  document.getElementById('profile-detail-modal').style.display = 'none';
}

// Hilfsfunktion: Aus dem Profil-Objekt die Details anzeigen
function getProfileByCode(code) {
  return allProfiles.find(p => p.code === code) || null;
}

// ═══════════════════════════════════════════════════════════════════
// Akustisches Ping bei Standort-Updates (Radar-Feedback)
// ═══════════════════════════════════════════════════════════════════
function playRadarPing() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 1200;
    gain.gain.value = 0.08;
    osc.type = 'sine';
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
    osc.stop(ctx.currentTime + 0.15);
    if (ctx.state === 'suspended') ctx.resume();
  } catch(e) {}
}