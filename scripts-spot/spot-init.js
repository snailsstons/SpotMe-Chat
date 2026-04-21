'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – INITIALISIERUNG (spot-init.js)
// + Dynamische Keys pro Spot
// + Flush von Offline-Kurznachrichten nach erfolgreichem Community-Load
// ══════════════════════════════════════════════════════════════════════════════

// 🆕 SOFORT nach dem Laden: Keys mit SPOT setzen!
PROFILE_KEY = 'sm_profile_' + SPOT;
TOKEN_KEY   = 'sm_token_' + SPOT;

console.log('📟 Spot initialisiert:', SPOT);
console.log('📟 PROFILE_KEY:', PROFILE_KEY);
console.log('📟 TOKEN_KEY:', TOKEN_KEY);

// 🆕 Cache-Key für diesen Spot
const CACHE_KEY = 'spot_cache_' + SPOT;

window.addEventListener('load', async () => {
  buildRegionFilter();
  loadMyProfile();

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      allProfiles = JSON.parse(cached);
      applyFilters();
    } catch (e) {}
  }

  await loadCommunity();

  // 🆕 Offline-Kurznachrichten senden, sobald wir online sind
  if (typeof flushPendingKurznachrichten === 'function') {
    flushPendingKurznachrichten();
  }

  if (isPublished && myProfile) await verifyAndRepublish();
  startKeepalive();
  startAutoRefresh();
  startHeartbeat();
  if (myToken) fetchAndRenderOfflineMsgs();
  setInterval(() => { if (myToken) fetchAndRenderOfflineMsgsSilent(); }, 60000);
  isSharingLocation = localStorage.getItem('sm_spot_location') === '1';
  updateLocationUI();
  if (isSharingLocation) await startLocationSharing();
  renderAll();
  
  if (myProfile && myProfile.region) {
    const regionSelect = document.getElementById('f-region');
    if (regionSelect) {
      regionSelect.value = myProfile.region;
      applyFilters();
    }
  }

  window.addEventListener('hashchange', checkDeepLink);
  checkDeepLink();
});

function startChat(code, name) {
  sessionStorage.setItem('sm_connect_to', code);
  sessionStorage.setItem('sm_connect_name', name);
  window.location.href = 'index.html';
}

function goHome() { window.location.href = 'index.html'; }

async function refreshSpot() {
  const btn = document.getElementById('refresh-btn');
  btn.classList.add('spinning');
  try {
    await loadCommunity();
    // Auch beim manuellen Refresh flushen
    if (typeof flushPendingKurznachrichten === 'function') {
      flushPendingKurznachrichten();
    }
    renderAll();
    toast('🔄 Community aktualisiert');
  } catch (e) {
    toast('⚠️ Aktualisierung fehlgeschlagen');
  } finally {
    btn.classList.remove('spinning');
  }
}
