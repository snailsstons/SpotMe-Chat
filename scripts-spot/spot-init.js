'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – INITIALISIERUNG (spot-init.js)
// + Dynamische Keys pro Spot (nur Profil!)
// + Globaler Token für alle Spots
// + Flush von Offline-Kurznachrichten
// + Profil-Dialog wenn kein Profil existiert (GLOBAL!)
// ══════════════════════════════════════════════════════════════════════════════

// 🆕 NUR Profil-Key ist Spot-spezifisch!
PROFILE_KEY = 'sm_profile_' + SPOT;

// 🆕 Token aus GLOBALEM Key laden
myToken = localStorage.getItem(TOKEN_KEY);

console.log('📟 Spot initialisiert:', SPOT);
console.log('📟 PROFILE_KEY:', PROFILE_KEY);
console.log('📟 TOKEN_KEY (global):', TOKEN_KEY);
console.log('📟 Token vorhanden:', myToken ? '✅ Ja' : '❌ Nein');

// 🆕 Token erstellen, falls NICHT vorhanden!
async function ensureGlobalToken() {
  if (myToken) return true;
  
  console.log('🆕 Erstelle globalen Token...');
  
  const minimalProfile = {
    name: localStorage.getItem('sm_name') || 'Nutzer_' + myCode.slice(0, 4),
    region: 'Valencia (Region)'
  };
  
  try {
    const res = await fetch(API + '/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: myCode,
        name: minimalProfile.name,
        region: minimalProfile.region,
        spot: SPOT
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        myToken = data.token;
        console.log('✅ Globaler Token erstellt');
        return true;
      }
    }
  } catch(e) {
    console.warn('Token-Erstellung fehlgeschlagen:', e);
  }
  return false;
}

// 🆕 Profil-Dialog anzeigen (JETZT GLOBAL!)
window.showProfileDialog = function() {
  const message = `Du hast noch kein Profil für den ${SPOT.toUpperCase()} Spot.\n\n` +
                  `Möchtest du jetzt ein Profil erstellen?\n\n` +
                  `(Du kannst auch ohne Profil die Community sehen.)`;
  
  const shouldCreate = confirm(message);
  
  if (shouldCreate) {
    // Spot-spezifische Profilseite
    const profilUrl = SPOT === 'general' ? 'profil-general.html'
                    : SPOT === 'dates'   ? 'profil-dates.html'
                    : 'profil.html?spot=' + SPOT;
    window.location.href = profilUrl;
  } else {
    if (typeof toast === 'function') {
      toast('📟 Du kannst später über "PROFIL" ein Profil anlegen');
    }
    console.log('📟 Nutzer hat Profil-Erstellung abgelehnt');
  }
};

window.addEventListener('load', async () => {
  // 🆕 SICHERSTELLEN, dass Token existiert!
  await ensureGlobalToken();
  
  buildRegionFilter();
  loadMyProfile();

  // 🆕 Wenn kein Profil im localStorage → Dialog anzeigen!
  const profileExists = localStorage.getItem(PROFILE_KEY);
  if (!profileExists) {
    setTimeout(() => window.showProfileDialog(), 500);
  }

  const cached = localStorage.getItem(CACHE_KEY);
  if (cached) {
    try {
      allProfiles = JSON.parse(cached);
      applyFilters();
    } catch (e) {}
  }

  await loadCommunity();

  // 🆕 Offline-Kurznachrichten senden
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

// 🆕 Globale Exports
window.goHome = goHome;
