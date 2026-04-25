'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – EIGENES PROFIL (spot-profile.js)
// TOKEN_KEY ist spot-spezifisch → verhindert Token-Kollisionen zwischen Spots
const TOKEN_KEY = 'sm_token_' + (typeof SPOT !== 'undefined' ? SPOT : 'default');
// Token wird GLOBAL gespeichert!
// ══════════════════════════════════════════════════════════════════════════════

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
  isPublished = localStorage.getItem('sm_spot_published_' + SPOT) === '1';
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
      if (!myToken) {
        const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
        const r = await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: myCode, name: myProfile.name, age,
            region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
            orientation: myProfile.orientation || null, role: myProfile.role || null,
            trans: myProfile.trans || false, crossdresser: myProfile.crossdresser || false, bio: myProfile.bio || null,
            spot: SPOT
          })
        });
        if (r.ok) { const d = await r.json(); if (d.token) { myToken = d.token; localStorage.setItem(TOKEN_KEY, myToken); } }
      }
      const delRes = await fetch(API + '/profile/' + myCode, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: myToken, spot: SPOT })
      });
      if (!delRes.ok) throw new Error('HTTP ' + delRes.status);
      isPublished = false;
      localStorage.setItem('sm_spot_published_' + SPOT, '0');
      toast('○ Profil aus Community entfernt');
    } else {
      const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
      const payload = {
        code: myCode, name: myProfile.name, age,
        region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
        orientation: myProfile.orientation || null, role: myProfile.role || null,
        trans: myProfile.trans || false, crossdresser: myProfile.crossdresser || false, bio: myProfile.bio || null,
        token: myToken || undefined, spot: SPOT
      };
      let res = await fetch(API + '/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 403) {
        myToken = '';
        localStorage.removeItem(TOKEN_KEY);
        payload.token = undefined;
        res = await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.token) {
        myToken = data.token;
        localStorage.setItem(TOKEN_KEY, myToken);
      }
      isPublished = true;
      localStorage.setItem('sm_spot_published_' + SPOT, '1');
      toast('✅ Profil veröffentlicht');
    }
    updatePublishUI();
    await loadCommunity();
    renderAll();
  } catch(e) { toast('⚠️ Fehler: ' + e.message); }
  finally { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
}

async function resetToken() {
  myToken = '';
  localStorage.removeItem(TOKEN_KEY);
  if (isPublished && myProfile) {
    isPublished = false;
    localStorage.setItem('sm_spot_published_' + SPOT, '0');
    await togglePublish();
    toast('🔑 Token erneuert — bitte Sichtbarkeit nochmal schalten');
  } else {
    toast('🔑 Token gelöscht — beim nächsten Veröffentlichen wird ein neuer vergeben');
  }
}
