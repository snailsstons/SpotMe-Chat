'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT GENERAL – NACHBARSCHAFTSHILFE
// Felder: helpMode ('biete'|'suche'), helpCategory, category (Freitext-Bio)
// ══════════════════════════════════════════════════════════════════════════════

const SPOT      = 'general';
const CACHE_KEY = 'spot_cache_general';

// Hilfe-Kategorien Label-Map
const HELP_CATEGORIES = {
  einkaufen:   '🛒 Einkaufen',
  fahrdienst:  '🚗 Fahrdienst',
  haushalt:    '🏠 Haushalt',
  apotheke:    '💊 Apotheke',
  gassi:       '🐕 Gassi',
  handwerk:    '🔧 Handwerk',
  gespraech:   '💬 Gespräch',
  lieferung:   '📦 Lieferung',
  sonstiges:   '✏️ Sonstiges'
};

const HELP_MODE_LABELS = {
  biete: '🤝 Biete Hilfe',
  suche: '🙋 Suche Hilfe'
};

// ── Filter-Logik für General/Hilfe ──
function applyFilters() {
  const region   = document.getElementById('f-region').value;
  const chips    = [...document.querySelectorAll('.filter-chip.active')].map(c => c.dataset.filter);

  const MODE_FILTERS = ['biete','suche'];
  const CAT_FILTERS  = Object.keys(HELP_CATEGORIES);

  filtered = allProfiles.filter(p => {
    if (myCode && p.code === myCode) return false;
    if (region && p.region !== region) return false;

    // Modus-Filter (biete/suche)
    const modeChips = chips.filter(f => MODE_FILTERS.includes(f));
    if (modeChips.length && (!p.helpMode || !modeChips.includes(p.helpMode))) return false;

    // Kategorie-Filter
    const catChips = chips.filter(f => CAT_FILTERS.includes(f));
    if (catChips.length && (!p.helpCategory || !catChips.includes(p.helpCategory))) return false;

    return true;
  });
  renderAll();
}

// ── Badges für Profilkarte ──
function buildHelpBadges(p, isOwn) {
  let badges = '';

  if (p.helpMode) {
    const modeLabel = HELP_MODE_LABELS[p.helpMode] || p.helpMode;
    const modeColor = p.helpMode === 'biete'
      ? 'rgba(46,204,113,.15);color:#2ecc71'
      : 'rgba(52,152,219,.15);color:#3498db';
    badges += `<span class="badge" style="background:${modeColor};border:1px solid currentColor;">${esc(modeLabel)}</span>`;
  }

  if (p.helpCategory) {
    const catLabel = HELP_CATEGORIES[p.helpCategory] || p.helpCategory;
    badges += `<span class="badge badge-kategorie">${esc(catLabel)}</span>`;
  }

  if (isOwn) {
    badges += `<span class="badge" style="background:rgba(46,204,113,.08);color:var(--acc);border-color:var(--spot-acc-border)">● Du</span>`;
  }

  const verifications = verificationCache.get(p.code) || [];
  if (verifications.length > 0) {
    const personal = verifications.filter(v => v.type === 'personal').length;
    const chat     = verifications.filter(v => v.type === 'chat').length;
    if (personal > 0) badges += `<span class="badge" style="background:rgba(30,204,104,.12);color:var(--green);">✓ Persönlich</span>`;
    else if (chat > 0) badges += `<span class="badge" style="background:rgba(46,204,113,.08);color:var(--acc);">✓ Verifiziert</span>`;
  }

  return badges;
}

// ── renderList überschreibt spot-render.js ──
function renderList() {
  const listEl  = document.getElementById('community-list');
  const countEl = document.getElementById('community-count');
  const n = filtered.length;
  countEl.innerHTML = `<b>${n}</b> ${n === 1 ? 'Anzeige' : 'Anzeigen'} gefunden`;

  if (!n) {
    listEl.innerHTML = `<div style="width:100%;text-align:center;padding:1.5rem;color:var(--muted);">Keine Anzeigen gefunden</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(p => {
    const name   = p.name || '?';
    const initial = name[0].toUpperCase();
    const city   = p.city || '';
    const region = p.region || '';
    const loc    = [city, region].filter(Boolean).join(', ') || 'unbekannt';
    const ago    = timeAgo(p.ts);
    const isOwn  = p.code === myCode;
    const isOnline = onlineStatusCache.get(p.code)?.online;

    const badges    = buildHelpBadges(p, isOwn);
    const locData   = locationCache.get(p.code);
    let locationBadge = '';
    if (locData && !isOwn) {
      const distStr = userPosition
        ? formatDistance(getDistance(userPosition.lat, userPosition.lng, locData.lat, locData.lng))
        : '';
      locationBadge = `<span class="location-badge" onclick="showLocationOnMap('${p.code}','${esc(name)}',${locData.lat},${locData.lng})">📍 ${distStr}</span>`;
    }

    const bio     = p.bio
      ? `<div class="card-bio">${esc(p.bio)}</div>`
      : '<div class="card-bio" style="color:var(--muted);font-style:italic;">Keine Beschreibung</div>';
    const chatBtn = isOwn
      ? `<span style="font-size:.75rem;color:var(--muted)">Deine Anzeige</span>`
      : `<button class="btn-chat" onclick="startChat('${esc(p.code)}','${esc(name)}')">💬 Kontakt</button>`;

    return `<div class="profile-card" data-code="${p.code}">
      <div class="card-top">
        <div class="card-av">${esc(initial)}</div>
        <div class="card-info">
          <div class="card-name">${esc(name)}${locationBadge}</div>
          <div class="card-age-loc"><b>${esc(loc)}</b></div>
        </div>
        <div class="online-dot" style="background:${isOnline ? 'var(--green)' : 'var(--muted)'};box-shadow:0 0 8px ${isOnline ? 'var(--green)' : 'transparent'};" title="${isOnline ? 'Online' : 'Offline'}"></div>
      </div>
      ${badges ? `<div class="card-badges">${badges}</div>` : ''}
      ${bio}
      <div class="card-footer"><div class="card-time">🕐 ${ago}</div>${chatBtn}</div>
    </div>`;
  }).join('');

  document.querySelectorAll('.profile-card').forEach(card => {
    const code    = card.dataset.code;
    const profile = filtered.find(p => p.code === code);
    if (profile) {
      card.addEventListener('click', e => {
        if (e.target.closest('.btn-chat') || e.target.closest('.location-badge')) return;
        showProfileDetail(profile);
      });
    }
  });
}

// ── showProfileDetail überschreibt spot-render.js ──
function showProfileDetail(profile) {
  if (!profile) return;
  const modal   = document.getElementById('profile-detail-modal');
  const content = document.getElementById('profile-detail-content');
  const name    = profile.name || '?';
  const initial = name[0].toUpperCase();
  const city    = profile.city || '';
  const region  = profile.region || '';
  const loc     = [city, region].filter(Boolean).join(', ') || 'unbekannt';
  const isOwn   = profile.code === myCode;
  const isOnline = onlineStatusCache.get(profile.code)?.online;
  const verifications = verificationCache.get(profile.code) || [];

  const badges    = buildHelpBadges(profile, false);
  const bio       = profile.bio
    ? `<div class="detail-bio">${esc(profile.bio)}</div>`
    : '<div class="detail-bio" style="color:var(--muted);font-style:italic;">Keine Beschreibung vorhanden</div>';
  const locData   = locationCache.get(profile.code);
  const locationBtn = (locData && !isOwn)
    ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail();showLocationOnMap('${profile.code}','${esc(name)}',${locData.lat},${locData.lng})">📍 Standort</button>`
    : '';
  const chatBtn   = isOwn
    ? `<button class="detail-btn btn-secondary" disabled style="opacity:0.5;">Deine Anzeige</button>`
    : `<button class="detail-btn btn-primary" onclick="closeProfileDetail();startChat('${esc(profile.code)}','${esc(name)}')">💬 Kontakt</button>`;
  const msgBtn    = !isOwn
    ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail();showKurznachrichtModal('${esc(profile.code)}','${esc(name)}')">✉️ Kurznachricht</button>`
    : '';
  const verifyBtn = !isOwn
    ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail();showVerifyOptions('${profile.code}')">✅ Verifizieren</button>`
    : '';

  let verifyText = '';
  const personal = verifications.filter(v => v.type === 'personal').length;
  const chat     = verifications.filter(v => v.type === 'chat').length;
  if (personal > 0) verifyText = `<div style="color:var(--green);margin-top:.5rem;">✓ Persönlich getroffen (${personal})</div>`;
  else if (chat > 0) verifyText = `<div style="color:var(--acc);margin-top:.5rem;">✓ Per Chat verifiziert (${chat})</div>`;

  content.innerHTML = `
    <div class="detail-avatar">${esc(initial)}</div>
    <div class="detail-name">${esc(name)} ${isOnline ? '<span style="color:var(--green);font-size:.8rem;">● Online</span>' : ''}</div>
    <div class="detail-location">${esc(loc)}</div>
    ${badges ? `<div class="detail-badges">${badges}</div>` : ''}
    ${verifyText}
    ${bio}
    <div class="detail-footer" style="flex-wrap:wrap;gap:.5rem;">
      ${locationBtn}
      ${chatBtn}
      ${msgBtn}
      ${verifyBtn}
    </div>
  `;
  modal.style.display = 'flex';
}

function closeProfileDetail() {
  document.getElementById('profile-detail-modal').style.display = 'none';
}
