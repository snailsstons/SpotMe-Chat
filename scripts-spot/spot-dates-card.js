'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT DATES – CARD ANSICHT v3.5 – Filter bleiben immer sichtbar!
// Flip, Swipe, Notieren, Preload, Filter bleiben erhalten
// ══════════════════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 PERFORMANCE-BOOST: API-Calls für Card-Ansicht optimieren
// ══════════════════════════════════════════════════════════════════════════════

const originalFetchLocation = window.fetchLocationForProfile;
window.fetchLocationForProfile = function(code) {
  if (locationCache && locationCache.has(code)) {
    return Promise.resolve(locationCache.get(code));
  }
  return Promise.resolve(null);
};
window.fetchLocationForProfile._original = originalFetchLocation;

const originalFetchOnline = window.fetchOnlineStatus;
window.fetchOnlineStatus = function(code) {
  if (onlineStatusCache && onlineStatusCache.has(code)) {
    return Promise.resolve(onlineStatusCache.get(code));
  }
  return Promise.resolve({ online: false });
};

const originalFetchVerifications = window.fetchVerifications;
window.fetchVerifications = function(code) {
  if (verificationCache && verificationCache.has(code)) {
    return Promise.resolve(verificationCache.get(code));
  }
  return Promise.resolve([]);
};

// ══════════════════════════════════════════════════════════════════════════════
// KONSTANTEN & STATE
// ══════════════════════════════════════════════════════════════════════════════

const NOTED_KEY = 'sm_noted_dates';
const FILTER_KEY = 'sm_filter_dates';
let notedProfiles = [];
let currentIndex = 0;
let filtersInitialized = false;

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 PRELOAD: Nächste Profile im Hintergrund laden
// ══════════════════════════════════════════════════════════════════════════════

function preloadNextProfiles() {
  if (filtered.length === 0) return;
  
  const toPreload = [];
  for (let i = 1; i <= 3; i++) {
    const nextIndex = (currentIndex + i) % filtered.length;
    const prevIndex = (currentIndex - i + filtered.length) % filtered.length;
    if (nextIndex !== currentIndex) toPreload.push(filtered[nextIndex]);
    if (prevIndex !== currentIndex && prevIndex !== nextIndex) toPreload.push(filtered[prevIndex]);
  }
  
  const unique = [...new Set(toPreload.map(p => p.code))];
  console.log('🔄 Preload:', unique.length, 'Profile im Hintergrund');
  
  unique.forEach(code => {
    setTimeout(() => {
      if (window.fetchLocationForProfile._original) {
        window.fetchLocationForProfile._original(code).then(loc => {
          if (loc && locationCache) locationCache.set(code, loc);
        }).catch(() => {});
      }
      if (originalFetchOnline) {
        originalFetchOnline(code).then(status => {
          if (status && onlineStatusCache) onlineStatusCache.set(code, status);
        }).catch(() => {});
      }
    }, 100);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER SPEICHERN & LADEN
// ══════════════════════════════════════════════════════════════════════════════

function saveFilterState() {
  const regionSelect = document.getElementById('f-region');
  const ageSelect = document.getElementById('f-age');
  const activeChips = document.querySelectorAll('#filter-chips .filter-chip.active');
  
  const state = {
    region: regionSelect?.value || '',
    age: ageSelect?.value || '',
    chips: [...activeChips].map(c => c.dataset.filter)
  };
  localStorage.setItem(FILTER_KEY, JSON.stringify(state));
}

function loadFilterState() {
  const saved = localStorage.getItem(FILTER_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch(e) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER SEKTION RENDERN (MIT ZUSTANDS-WIEDERHERSTELLUNG!)
// ══════════════════════════════════════════════════════════════════════════════

function renderFilterSection(savedState = null) {
  const anchor = document.getElementById('filterAnchor');
  if (!anchor) return;
  
  const oldFilter = document.getElementById('filterDrawer');
  if (oldFilter) oldFilter.remove();
  
  const filterHTML = `
    <div class="filter-drawer" id="filterDrawer">
      <div class="filter-title">Community Filter</div>
      <div class="filter-select-row">
        <select class="filter-select" id="f-region" onchange="handleFilterChange()">
          <option value="">Alle Regionen</option>
        </select>
        <select class="filter-select" id="f-age" onchange="handleFilterChange()">
          <option value="">Alle Altersgruppen</option>
          <option value="18-29">18–29</option>
          <option value="30-39">30–39</option>
          <option value="40-49">40–49</option>
          <option value="50+">50+</option>
        </select>
      </div>
      <div class="filter-row" id="filter-chips">
        <div class="filter-chip" data-filter="beziehung" onclick="handleChipClick(this)">💕 Beziehung</div>
        <div class="filter-chip" data-filter="freundschaft" onclick="handleChipClick(this)">👥 Freundschaft</div>
        <div class="filter-chip" data-filter="casual" onclick="handleChipClick(this)">🍸 Casual</div>
      </div>
      <button class="reset-link" onclick="handleFilterReset()">✕ Filter zurücksetzen</button>
    </div>
  `;
  
  anchor.insertAdjacentHTML('beforeend', filterHTML);
  
  // Regionen befüllen
  const regionSelect = document.getElementById('f-region');
  if (regionSelect && typeof REGIONS !== 'undefined') {
    REGIONS.forEach(r => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = r;
      regionSelect.appendChild(option);
    });
  }
  
  // Zustand wiederherstellen
  const state = savedState || loadFilterState();
  if (state) {
    if (state.region) {
      const rs = document.getElementById('f-region');
      if (rs) rs.value = state.region;
    }
    if (state.age) {
      const as = document.getElementById('f-age');
      if (as) as.value = state.age;
    }
    if (state.chips && state.chips.length > 0) {
      document.querySelectorAll('#filter-chips .filter-chip').forEach(chip => {
        if (state.chips.includes(chip.dataset.filter)) {
          chip.classList.add('active');
        }
      });
    }
  }
  
  filtersInitialized = true;
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER HANDLER
// ══════════════════════════════════════════════════════════════════════════════

function handleFilterChange() {
  saveFilterState();
  applyFiltersLocal();
}

function handleChipClick(chip) {
  chip.classList.toggle('active');
  saveFilterState();
  applyFiltersLocal();
}

function handleFilterReset() {
  document.querySelectorAll('#filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
  const regionSelect = document.getElementById('f-region');
  const ageSelect = document.getElementById('f-age');
  if (regionSelect) regionSelect.value = '';
  if (ageSelect) ageSelect.value = '';
  localStorage.removeItem(FILTER_KEY);
  applyFiltersLocal();
}

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 LOKALES FILTERN (ohne Server-Request!)
// ══════════════════════════════════════════════════════════════════════════════

function applyFiltersLocal() {
  const region = document.getElementById('f-region')?.value || '';
  const ageRange = document.getElementById('f-age')?.value || '';
  const chips = [...document.querySelectorAll('#filter-chips .filter-chip.active')].map(c => c.dataset.filter);
  
  filtered = allProfiles.filter(p => {
    if (myCode && p.code === myCode) return false;
    if (region && p.region !== region) return false;
    if (ageRange && p.age) {
      const [lo, hi] = ageRange === '50+' ? [50, 999] : ageRange.split('-').map(Number);
      if (p.age < lo || p.age > hi) return false;
    }
    const dateChips = chips.filter(f => ['beziehung', 'freundschaft', 'casual'].includes(f));
    if (dateChips.length && (!p.lookingFor || !dateChips.includes(p.lookingFor))) {
      return false;
    }
    return true;
  });
  
  saveFilterState();
  currentIndex = 0;
  renderList();
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBALE FUNKTIONEN ÜBERSCHREIBEN
// ══════════════════════════════════════════════════════════════════════════════

window.toggleChip = function(chip) {
  handleChipClick(chip);
};

window.resetFilters = function() {
  handleFilterReset();
};

window.applyFilters = function() {
  applyFiltersLocal();
};

// ══════════════════════════════════════════════════════════════════════════════
// RENDER LIST (mit Filter-Erhalt!)
// ══════════════════════════════════════════════════════════════════════════════

window.renderList = function() {
  const container = document.getElementById('community-list');
  if (!container) return;
  
  const countEl = document.getElementById('community-count');
  if (countEl) {
    countEl.innerHTML = `<b>${filtered.length}</b> ${filtered.length === 1 ? 'Profil' : 'Profile'} gefunden`;
  }
  
  // 🆕 Filter-Zustand merken!
  const filterState = {
    region: document.getElementById('f-region')?.value || '',
    age: document.getElementById('f-age')?.value || '',
    chips: [...document.querySelectorAll('#filter-chips .filter-chip.active')].map(c => c.dataset.filter)
  };
  
// NUR Cards + Notierte + Filter-Anker rendern
  
  container.innerHTML = `
    <div class="card-swipe-container" id="cardSwipeContainer">
      <div class="card-nav">
        <button class="card-nav-btn" id="prevBtn">◀</button>
        <span class="card-nav-info">${filtered.length > 0 ? currentIndex + 1 : 0} / ${filtered.length}</span>
        <button class="card-nav-btn" id="nextBtn">▶</button>
      </div>
      <div class="card-wrapper" id="cardWrapper"></div>
    </div>
    <div id="filterAnchor"></div>           <!-- 🆕 Filter NACH Cards -->
    <div class="noted-section" id="notedSection"></div>  <!-- 🆕 Notierte NACH Filter -->
  `;
  
  document.getElementById('prevBtn')?.addEventListener('click', () => {
    if (filtered.length === 0) return;
    currentIndex = currentIndex > 0 ? currentIndex - 1 : filtered.length - 1;
    renderCurrentCard();
  });
  document.getElementById('nextBtn')?.addEventListener('click', () => {
    if (filtered.length === 0) return;
    currentIndex = currentIndex < filtered.length - 1 ? currentIndex + 1 : 0;
    renderCurrentCard();
  });
  
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  
  if (filtered.length > 0) {
    if (currentIndex >= filtered.length) currentIndex = 0;
    renderCurrentCard();
  } else {
    document.getElementById('cardWrapper').innerHTML = `<div class="card-empty">Keine Profile gefunden</div>`;
  }
  
  renderNotedSection();
  
  // 🆕 Filter IMMER NEU rendern – mit gespeichertem Zustand!
  renderFilterSection(filterState);
};

// ══════════════════════════════════════════════════════════════════════════════
// CARD RENDERING
// ══════════════════════════════════════════════════════════════════════════════

function renderCurrentCard() {
  const wrapper = document.getElementById('cardWrapper');
  if (!wrapper || filtered.length === 0) return;
  
  const navInfo = document.querySelector('.card-nav-info');
  if (navInfo) navInfo.textContent = `${currentIndex + 1} / ${filtered.length}`;
  
  const p = filtered[currentIndex];
  if (!p) return;
  
  const name = p.name || '?';
  const initial = name[0]?.toUpperCase() || '?';
  const age = p.age ? `${p.age} J.` : '';
  const city = p.city || '';
  const region = p.region || '';
  const loc = [city, region].filter(Boolean).join(', ') || 'unbekannt';
  const bio = p.bio || 'Keine Beschreibung vorhanden';
  const isNoted = notedProfiles.includes(p.code);
  const onlineStatus = onlineStatusCache.get(p.code);
  const isOnline = onlineStatus && onlineStatus.online;
  
  let badges = '';
  if (p.lookingFor) {
    const labels = { 'beziehung': '💕 Beziehung', 'freundschaft': '👥 Freundschaft', 'casual': '🍸 Casual' };
    badges += `<span class="card-tag">${labels[p.lookingFor] || p.lookingFor}</span>`;
  }
  
  wrapper.innerHTML = `
    <div class="card-inner" id="cardInner">
      <div class="card-front">
        <div class="card-image-container">
          <div class="card-avatar-large">${initial}</div>
          <div class="card-heart ${isNoted ? 'active' : ''}" id="cardHeart" onclick="event.stopPropagation(); toggleNote('${p.code}')">
            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </div>
          <div class="card-online-dot ${isOnline ? 'online' : ''}"></div>
        </div>
        <div class="card-content">
          <div class="card-name-age">${name}${age ? ', ' + age : ''}</div>
          <div class="card-location">📍 ${loc}</div>
          ${badges ? `<div class="card-tags">${badges}</div>` : ''}
          <div class="card-bio">${bio}</div>
          <div class="card-bottom">
            <div class="card-time">🕐 ${timeAgo(p.ts)}</div>
            <button class="card-chat-btn" onclick="event.stopPropagation(); startChat('${p.code}','${name}')">💬 Chat</button>
          </div>
        </div>
      </div>
      
      <div class="card-back">
        <div class="back-header">Mehr über ${name}</div>
        <div class="back-section"><h4>Über mich</h4><p>${bio}</p></div>
        ${p.orientation ? `<div class="back-section"><h4>Orientierung & Rolle</h4><div class="back-tags">${p.orientation ? `<span class="back-tag">${p.orientation}</span>` : ''}${p.role ? `<span class="back-tag">${p.role}</span>` : ''}</div></div>` : ''}
        <div class="back-section">
          <h4>Aktionen</h4>
          <div class="back-actions">
            <button onclick="event.stopPropagation(); showKurznachrichtModal('${p.code}','${name}')">✉️ Kurznachricht</button>
            <button onclick="event.stopPropagation(); startChat('${p.code}','${name}')">💬 Chat</button>
          </div>
        </div>
        <div class="back-hint">Tippen zum Umdrehen</div>
      </div>
    </div>
  `;
  
  initCardSwipe();
  preloadNextProfiles();
}

// ══════════════════════════════════════════════════════════════════════════════
// SWIPE LOGIK
// ══════════════════════════════════════════════════════════════════════════════

function initCardSwipe() {
  const wrapper = document.getElementById('cardWrapper');
  const inner = document.getElementById('cardInner');
  if (!wrapper || !inner) return;
  
  let startX, startY, moveX = 0;
  let isDragging = false;
  
  const onStart = (e) => {
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    isDragging = false;
    wrapper.style.transition = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  };
  
  const onMove = (e) => {
    if (e.type.includes('touch')) e.preventDefault();
    let currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    moveX = currentX - startX;
    if (Math.abs(moveX) > 5) isDragging = true;
    wrapper.style.transform = `translateX(${moveX}px) rotate(${moveX / 15}deg)`;
  };
  
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    wrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    if (!isDragging) {
      inner.classList.toggle('is-flipped');
    } else if (Math.abs(moveX) > 80) {
      const direction = moveX > 0 ? -1 : 1;
      let newIndex = currentIndex + direction;
      if (newIndex < 0) newIndex = filtered.length - 1;
      else if (newIndex >= filtered.length) newIndex = 0;
      
      wrapper.style.transform = `translateX(${direction * 600}px) rotate(${moveX / 5}deg)`;
      wrapper.style.opacity = '0';
      
      setTimeout(() => {
        currentIndex = newIndex;
        wrapper.style.transition = 'none';
        wrapper.style.transform = 'translateX(0) rotate(0deg)';
        wrapper.style.opacity = '1';
        inner.classList.remove('is-flipped');
        renderCurrentCard();
        setTimeout(() => wrapper.style.transition = 'transform 0.4s ease', 50);
      }, 200);
    } else {
      wrapper.style.transform = 'translateX(0) rotate(0deg)';
    }
    moveX = 0; isDragging = false;
  };
  
  wrapper.addEventListener('mousedown', onStart);
  wrapper.addEventListener('touchstart', onStart, { passive: false });
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIEREN
// ══════════════════════════════════════════════════════════════════════════════

function toggleNote(code) {
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  const index = notedProfiles.indexOf(code);
  if (index >= 0) notedProfiles.splice(index, 1);
  else notedProfiles.push(code);
  localStorage.setItem(NOTED_KEY, JSON.stringify(notedProfiles));
  
  const heart = document.getElementById('cardHeart');
  if (heart) heart.classList.toggle('active', index < 0);
  renderNotedSection();
}

function renderNotedSection() {
  const section = document.getElementById('notedSection');
  if (!section) return;
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  if (notedProfiles.length === 0) { section.innerHTML = ''; return; }
  
  const profiles = allProfiles.filter(p => notedProfiles.includes(p.code));
  if (profiles.length === 0) {
    section.innerHTML = '<div class="noted-header">❤️ Notiert (0 sichtbar)</div>';
    return;
  }
  
  section.innerHTML = `
    <div class="noted-header">❤️ Notierte Profile (${profiles.length})</div>
    <div class="noted-list">
      ${profiles.map(p => `
        <div class="noted-item" onclick="showNotedProfile('${p.code}')">
          <div class="noted-avatar">${(p.name || '?')[0]?.toUpperCase()}</div>
          <div class="noted-name">${p.name || '?'}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function showNotedProfile(code) {
  let index = filtered.findIndex(p => p.code === code);
  if (index >= 0) {
    currentIndex = index;
    renderCurrentCard();
  } else {
    handleFilterReset();
    setTimeout(() => {
      index = filtered.findIndex(p => p.code === code);
      if (index >= 0) { currentIndex = index; renderCurrentCard(); }
    }, 300);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════════════════════

const cardStyles = document.createElement('style');
cardStyles.textContent = `
  .card-empty { text-align:center; padding:2rem; color:var(--muted); background:var(--card); border-radius:16px; }
  .card-swipe-container { position:relative; width:100%; height:460px; perspective:1000px; margin-bottom:1rem; }
  .card-nav { display:flex; justify-content:space-between; align-items:center; padding:.5rem 0; margin-bottom:.3rem; }
  .card-nav-btn { width:44px; height:44px; border-radius:50%; background:var(--card); border:1px solid var(--bord); color:var(--text); font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .card-nav-btn:active { background:var(--bord); }
  .card-nav-info { font-size:.85rem; color:var(--muted2); font-weight:600; }
  .card-wrapper { position:absolute; width:100%; height:calc(100% - 50px); cursor:grab; user-select:none; touch-action:none; transition:transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275); }
  .card-wrapper:active { cursor:grabbing; }
  .card-inner { position:relative; width:100%; height:100%; transition:transform 0.6s cubic-bezier(0.4,0.2,0.2,1); transform-style:preserve-3d; border-radius:20px; box-shadow:0 8px 20px rgba(0,0,0,.4); }
  .card-inner.is-flipped { transform:rotateY(180deg); }
  .card-front, .card-back { position:absolute; width:100%; height:100%; backface-visibility:hidden; background:var(--card,#1c222b); border:1px solid var(--bord); border-radius:20px; overflow:hidden; display:flex; flex-direction:column; }
  .card-back { transform:rotateY(180deg); padding:1.2rem; overflow-y:auto; }
  .card-image-container { height:45%; background:linear-gradient(135deg,var(--p2),var(--p3)); display:flex; align-items:center; justify-content:center; position:relative; }
  .card-avatar-large { font-size:4rem; color:white; opacity:.8; }
  .card-heart { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:10px; background:rgba(0,0,0,.3); backdrop-filter:blur(8px); display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:10; }
  .card-heart svg { width:20px; height:20px; fill:transparent; stroke:white; stroke-width:2; }
  .card-heart.active svg { fill:var(--p3); stroke:var(--p3); }
  .card-online-dot { position:absolute; top:10px; left:10px; width:12px; height:12px; border-radius:50%; background:var(--muted); }
  .card-online-dot.online { background:var(--green); box-shadow:0 0 8px var(--green); }
  .card-content { padding:.8rem 1rem; flex:1; display:flex; flex-direction:column; }
  .card-name-age { font-size:1.3rem; font-weight:700; }
  .card-location { font-size:.8rem; color:var(--muted2); margin-bottom:.5rem; }
  .card-tag { display:inline-block; padding:3px 10px; border-radius:12px; font-size:.7rem; font-weight:600; margin-bottom:.5rem; background:rgba(255,79,123,.15); color:#ff4f7b; }
  .card-bio { font-size:.85rem; color:var(--text-dim); flex:1; }
  .card-bottom { display:flex; justify-content:space-between; align-items:center; margin-top:.5rem; }
  .card-time { font-size:.75rem; color:var(--muted); }
  .card-chat-btn { background:var(--acc); color:var(--bg); border:none; padding:8px 16px; border-radius:10px; font-weight:700; cursor:pointer; }
  .back-header { font-size:1.2rem; font-weight:700; color:var(--acc); margin-bottom:1rem; }
  .back-section { margin-bottom:1rem; }
  .back-section h4 { font-size:.75rem; color:var(--muted); text-transform:uppercase; margin-bottom:.3rem; letter-spacing:1px; }
  .back-tags { display:flex; gap:6px; flex-wrap:wrap; }
  .back-tag { padding:4px 10px; background:rgba(255,255,255,.06); border-radius:8px; font-size:.8rem; }
  .back-actions { display:flex; gap:8px; }
  .back-actions button { flex:1; padding:8px; border-radius:10px; border:1px solid var(--bord); background:rgba(255,255,255,.04); color:var(--text); cursor:pointer; font-size:.8rem; font-weight:600; }
  .back-hint { text-align:center; font-size:.75rem; color:var(--muted); margin-top:auto; font-style:italic; }
  .noted-section { margin:1rem 0; }
  .noted-header { font-size:.8rem; font-weight:600; color:var(--p3); margin-bottom:.5rem; }
  .noted-list { display:flex; gap:8px; overflow-x:auto; padding-bottom:.5rem; }
  .noted-item { display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; min-width:60px; }
  .noted-avatar { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,var(--p2),var(--p3)); display:flex; align-items:center; justify-content:center; font-size:1.1rem; color:white; }
  .noted-name { font-size:.65rem; color:var(--muted2); text-align:center; max-width:60px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .filter-drawer { margin-top:1rem; padding:1rem; background:var(--card); border:1px solid var(--bord); border-radius:16px; }
  .filter-title { font-size:.8rem; font-weight:600; color:var(--muted); margin-bottom:.8rem; text-transform:uppercase; letter-spacing:1px; }
  .filter-select-row { display:flex; gap:.5rem; margin-bottom:.8rem; }
  .filter-select { flex:1; padding:.6rem .8rem; background:var(--bg); border:1px solid var(--bord); border-radius:10px; color:var(--text); font-size:.85rem; outline:none; }
  .filter-row { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.5rem; }
  .filter-chip { padding:.4rem .8rem; border-radius:20px; font-size:.75rem; cursor:pointer; background:rgba(255,255,255,.04); border:1px solid var(--bord); color:var(--muted2); transition:all .2s; }
  .filter-chip.active { border-color:var(--acc); color:var(--acc); background:var(--acc-dim); }
  .reset-link { background:none; border:none; color:var(--muted); font-size:.75rem; cursor:pointer; padding:.3rem 0; display:flex; align-items:center; gap:.3rem; }
`;
document.head.appendChild(cardStyles);

console.log('✅ spot-dates-card.js v3.5 geladen – Filter bleiben IMMER sichtbar!');
