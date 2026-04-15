'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – RENDERING (spot-render.js)
// + Fallback für fehlende Bio
// ══════════════════════════════════════════════════════════════════════════════

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
    node.onclick = () => showProfileDetail(profile);
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
    const name = p.name || '?';
    const initial = name[0].toUpperCase();
    const age = p.age ? `${p.age} J.` : '? J.';
    const city = p.city || '';
    const region = p.region || '';
    const loc = [city, region].filter(Boolean).join(', ') || 'unbekannt';
    const ago = timeAgo(p.ts);
    const isOwn = p.code === myCode;
    const onlineStatus = onlineStatusCache.get(p.code);
    const isOnline = onlineStatus && onlineStatus.online;
    
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
    if (p.crossdresser) badges += `<span class="badge badge-cross">Crossdresser</span>`;
    if (isOwn) badges += `<span class="badge" style="background:rgba(0,229,192,.08);color:var(--acc);border-color:rgba(0,229,192,.2)">● Du</span>`;
    
    const verifications = verificationCache.get(p.code) || [];
    if (verifications.length > 0) {
      const personal = verifications.filter(v => v.type === 'personal').length;
      const chat = verifications.filter(v => v.type === 'chat').length;
      if (personal > 0) badges += `<span class="badge" style="background:rgba(30,204,104,.12);color:var(--green);">✓ Persönlich</span>`;
      else if (chat > 0) badges += `<span class="badge" style="background:rgba(0,229,192,.08);color:var(--acc);">✓ Verifiziert</span>`;
    }
    
    const locData = locationCache.get(p.code);
    let locationBadge = '';
    if (locData && !isOwn) {
      const distStr = userPosition ? formatDistance(getDistance(userPosition.lat, userPosition.lng, locData.lat, locData.lng)) : '';
      locationBadge = `<span class="location-badge" onclick="showLocationOnMap('${p.code}', '${esc(name)}', ${locData.lat}, ${locData.lng})">📍 ${distStr}</span>`;
    }
    
    // Bio mit Fallback
    const bio = p.bio ? `<div class="card-bio">${esc(p.bio)}</div>` : '<div class="card-bio" style="color:var(--muted);font-style:italic;">Keine Beschreibung</div>';
    const cardClass = p.orientation ? ` ${p.orientation}` : '';
    const chatBtn = isOwn ? `<span style="font-size:.75rem;color:var(--muted)">Dein Profil</span>` : `<button class="btn-chat" onclick="startChat('${esc(p.code)}','${esc(name)}')">💬 Chat</button>`;
    
    return `<div class="profile-card${cardClass}" data-code="${p.code}">
      <div class="card-top"><div class="card-av">${esc(initial)}</div><div class="card-info"><div class="card-name">${esc(name)}${locationBadge}</div><div class="card-age-loc">${esc(age)} · <b>${esc(loc)}</b></div></div><div class="online-dot" style="background:${isOnline ? 'var(--green)' : 'var(--muted)'}; box-shadow:0 0 8px ${isOnline ? 'var(--green)' : 'transparent'};" title="${isOnline ? 'Online' : 'Offline'}"></div></div>
      ${badges ? `<div class="card-badges">${badges}</div>` : ''}
      ${bio}
      <div class="card-footer"><div class="card-time">🕐 ${ago}</div>${chatBtn}</div>
    </div>`;
  }).join('');
  
  document.querySelectorAll('.profile-card').forEach((card) => {
    const code = card.dataset.code;
    const profile = filtered.find(p => p.code === code);
    if (profile) {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-chat') || e.target.closest('.location-badge')) return;
        showProfileDetail(profile);
      });
    }
  });
}

function showProfileDetail(profile) {
  if (!profile) return;
  const modal = document.getElementById('profile-detail-modal');
  const content = document.getElementById('profile-detail-content');
  const name = profile.name || '?';
  const initial = name[0].toUpperCase();
  const age = profile.age ? `${profile.age} J.` : '? J.';
  const city = profile.city || '';
  const region = profile.region || '';
  const loc = [city, region].filter(Boolean).join(', ') || 'unbekannt';
  const isOwn = profile.code === myCode;
  const onlineStatus = onlineStatusCache.get(profile.code);
  const isOnline = onlineStatus && onlineStatus.online;
  const verifications = verificationCache.get(profile.code) || [];
  
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
  if (profile.crossdresser) badges += `<span class="badge badge-cross">Crossdresser</span>`;
  
  // Bio mit Fallback
  const bio = profile.bio ? `<div class="detail-bio">${esc(profile.bio)}</div>` : '<div class="detail-bio" style="color:var(--muted);font-style:italic;">Keine Beschreibung vorhanden</div>';
  const locData = locationCache.get(profile.code);
  const locationBtn = (locData && !isOwn) ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail(); showLocationOnMap('${profile.code}', '${esc(name)}', ${locData.lat}, ${locData.lng})">📍 Standort</button>` : '';
  const chatBtn = isOwn ? `<button class="detail-btn btn-secondary" disabled style="opacity:0.5;">Dein Profil</button>` : `<button class="detail-btn btn-primary" onclick="closeProfileDetail(); startChat('${esc(profile.code)}','${esc(name)}')">💬 Chat</button>`;
  const verifyBtn = !isOwn ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail(); showVerifyOptions('${profile.code}')">✅ Verifizieren</button>` : '';
  const msgBtn = !isOwn ? `<button class="detail-btn btn-secondary" onclick="closeProfileDetail(); showKurznachrichtModal('${esc(profile.code)}', '${esc(name)}')">✉️ Kurznachricht</button>` : '';
  const personalCount = verifications.filter(v => v.type === 'personal').length;
  const chatCount = verifications.filter(v => v.type === 'chat').length;
  let verifyText = '';
  if (personalCount > 0) verifyText = `<div style="color:var(--green); margin-top:0.5rem;">✓ Persönlich getroffen (${personalCount})</div>`;
  else if (chatCount > 0) verifyText = `<div style="color:var(--acc); margin-top:0.5rem;">✓ Per Chat verifiziert (${chatCount})</div>`;
  
  content.innerHTML = `
    <div class="detail-avatar">${esc(initial)}</div>
    <div class="detail-name">${esc(name)} ${isOnline ? '<span style="color:var(--green); font-size:0.8rem;">● Online</span>' : ''}</div>
    <div class="detail-location">${esc(age)} · ${esc(loc)}</div>
    ${badges ? `<div class="detail-badges">${badges}</div>` : ''}
    ${verifyText}
    ${bio}
    <div class="detail-footer" style="flex-wrap:wrap; gap:0.5rem;">
      ${locationBtn}
      ${chatBtn}
      ${verifyBtn}
      ${msgBtn}
    </div>
  `;
  modal.style.display = 'flex';
}

function closeProfileDetail() {
  document.getElementById('profile-detail-modal').style.display = 'none';
        }
