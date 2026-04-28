'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT DATES – CARD ANSICHT v4.1 – Bereinigte Gesten & Scroll-Fix
// Doppeltap Card = Flip | Doppeltap Bild = Fullscreen | Swipe = Nächste Karte
// Pinch = Kurznachricht | ❤️ Button = Notieren
// 🆕 Card-Rückseite: Story + Kommentare (öffentlich) + natives Scrollen
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

const API_BASE   = 'https://spotme-chat-obom.onrender.com/api';
const NOTED_KEY  = 'sm_noted_dates';
const FILTER_KEY = 'sm_filter_dates';
let notedProfiles = [];
let currentIndex = 0;
let filtersInitialized = false;

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 SOFORT-START: Eigenes Profil aus localStorage vorab laden
// ══════════════════════════════════════════════════════════════════════════════

(function preloadMyProfile() {
  const myCode = localStorage.getItem('sm_code');
  if (!myCode || (typeof allProfiles !== 'undefined' && allProfiles.length > 0)) return;
  
  const localProfile = JSON.parse(localStorage.getItem('sm_profile_dates') || '{}');
  if (!localProfile.name) return;
  
  const myProfile = {
    code: myCode,
    name: localProfile.name || localStorage.getItem('sm_name') || 'Ich',
    age: localProfile.age || '',
    city: localProfile.city || '',
    region: localProfile.region || '',
    bio: localProfile.bio || 'Keine Beschreibung',
    lookingFor: localProfile.lookingFor || '',
    ts: Date.now()
  };
  
  allProfiles = [myProfile];
  filtered = [myProfile];
  currentIndex = 0;
  renderList();
  
  console.log('⚡ Eigenes Profil vorab geladen');
})();

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 AVATAR CACHE + COMMENTS CACHE
// ══════════════════════════════════════════════════════════════════════════════

const avatarCache   = new Map();
const COMMENTS_CACHE = new Map();

async function loadCardAvatar(code) {
  if (avatarCache.has(code)) return avatarCache.get(code);
  
  try {
    const res = await fetch(`${API_BASE}/avatar/${code}?spot=dates`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.avatar) {
      avatarCache.set(code, data.avatar);
      return data.avatar;
    }
  } catch(e) { /* Server offline – Fallback: Initial-Buchstabe */ }
  return null;
}

function preloadAvatar(code) {
  if (avatarCache.has(code)) return;
  fetch(`${API_BASE}/avatar/${code}?spot=dates`)
    .then(r => r.json())
    .then(d => { if (d.avatar) avatarCache.set(code, d.avatar); })
    .catch(() => {});
}

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 PRELOAD: Nächste Profile + Avatare im Hintergrund laden
// ══════════════════════════════════════════════════════════════════════════════

function preloadNextProfiles() {
  if (filtered.length === 0) return;
  
  if (currentIndex >= filtered.length) {
    currentIndex = 0;
  }
  
  const toPreload = [];
  for (let i = 1; i <= 10; i++) {
    const nextIndex = (currentIndex + i) % filtered.length;
    const prevIndex = (currentIndex - i + filtered.length) % filtered.length;
    
    if (filtered[nextIndex] && nextIndex !== currentIndex) {
      toPreload.push(filtered[nextIndex]);
    }
    if (filtered[prevIndex] && prevIndex !== currentIndex && prevIndex !== nextIndex) {
      toPreload.push(filtered[prevIndex]);
    }
  }
  
  const unique = [...new Set(toPreload.map(p => p?.code).filter(Boolean))];
  console.log('🔄 Preload:', unique.length, 'Profile');
  
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
    
    setTimeout(() => {
      preloadAvatar(code);
    }, 200);
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
// FILTER SEKTION RENDERN (ERST OPTIONEN, DANN ZUSTAND!)
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
  
  const regionSelect = document.getElementById('f-region');
  if (regionSelect && typeof REGIONS !== 'undefined') {
    while (regionSelect.options.length > 1) regionSelect.remove(1);
    REGIONS.forEach(r => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = r;
      regionSelect.appendChild(option);
    });
  }
  
  const state = savedState || loadFilterState();
  if (state) {
    if (state.region && regionSelect) {
      const optionExists = [...regionSelect.options].some(o => o.value === state.region);
      if (optionExists) {
        regionSelect.value = state.region;
      }
    }
    if (state.age) {
      const ageSelect = document.getElementById('f-age');
      if (ageSelect) ageSelect.value = state.age;
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
  
  if (filtered.length === 0) {
    currentIndex = 0;
  } else if (currentIndex >= filtered.length) {
    currentIndex = 0;
  }
  
  saveFilterState();
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
// RENDER LIST (Cards → Filter → Notierte)
// ══════════════════════════════════════════════════════════════════════════════

window.renderList = function() {
  const container = document.getElementById('community-list');
  if (!container) return;
  
  const countEl = document.getElementById('community-count');
  if (countEl) {
   countEl.innerHTML = `<b>${filtered.length}</b> ${filtered.length === 1 ? 'Date wartet' : 'Dates warten'} auf deine Nachricht.<br><span style="font-size:0.7rem;color:var(--muted);">Dreh an der Profilkarte ✋</span>`;
    }
  
  const filterState = {
    region: document.getElementById('f-region')?.value || '',
    age: document.getElementById('f-age')?.value || '',
    chips: [...document.querySelectorAll('#filter-chips .filter-chip.active')].map(c => c.dataset.filter)
  };
  
  container.innerHTML = `
    <div class="card-swipe-container" id="cardSwipeContainer">
      <div class="card-nav">
        <button class="card-nav-btn" id="prevBtn">◀</button>
        <span class="card-nav-info">${filtered.length > 0 ? currentIndex + 1 : 0} / ${filtered.length}</span>
        <button class="card-nav-btn" id="nextBtn">▶</button>
      </div>
      <div class="card-wrapper" id="cardWrapper"></div>
    </div>
    <div id="filterAnchor"></div>
    <div class="noted-section" id="notedSection"></div>
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
  
  renderFilterSection(filterState);
  renderNotedSection();
};

// ══════════════════════════════════════════════════════════════════════════════
// CARD RENDERING (MIT AVATAR + STORY + KOMMENTARE)
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
      <div class="card-image-container" id="cardImgContainer-${p.code}">
        <div class="card-avatar-large" id="cardAv-${p.code}">${initial}</div>
        <div class="card-heart ${isNoted ? 'active' : ''}" id="cardHeart" onclick="event.stopPropagation(); toggleNote('${p.code}')">
          <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        </div>
        ${isOnline ? `<div class="online-badge">🟢 Online</div>` : ''}
      </div>
      <div class="card-content">
        <div class="card-name-age">${name}${age ? ', ' + age : ''}</div>
        <div class="card-location">📍 ${loc}</div>
        ${badges ? `<div class="card-tags">${badges}</div>` : ''}
        <div class="card-bio">${bio}</div>
        <div class="card-bottom">
          <div class="card-time">🕐 ${timeAgo(p.ts)}</div>
          <button class="card-chat-btn" onclick="event.stopPropagation(); showKurznachrichtModal('${p.code}','${name}')">✉️ Kurznachricht</button>
        </div>
      </div>
    </div>
    
    <div class="card-back" id="cardBack-${p.code}">
      <div class="back-header">📖 ${name}'s Story</div>
      <div class="back-section">
        <p class="story-text">${bio}</p>
      </div>
      
      <div class="back-section">
        <h4>💬 Kommentare <span id="commentCount-${p.code}" style="font-weight:400;color:var(--muted);"></span></h4>
        <div class="comments-list" id="commentsList-${p.code}">
          <div class="comments-loading">⏳ Lade Kommentare…</div>
        </div>
        <div class="comment-input-row">
          <textarea id="commentInput-${p.code}" class="comment-input" 
            placeholder="Dein Kommentar (max. 140 Zeichen)…" maxlength="140"
            rows="3"></textarea>
          <button class="comment-send-btn" onclick="submitCommentHandler('${p.code}')">➤</button>
        </div>
        <div class="comment-status" id="commentStatus-${p.code}"></div>
      </div>
      
      <div class="back-actions">
        <button onclick="event.stopPropagation(); showKurznachrichtModal('${p.code}','${name}')">✉️ Kurznachricht</button>
        <button onclick="event.stopPropagation(); startChat('${p.code}','${name}')">💬 Chat</button>
      </div>
      
      <button class="close-back-btn" onclick="event.stopPropagation(); document.getElementById('cardInner').classList.remove('is-flipped');">
        ✕ Schließen
      </button>
    </div>
  </div>
`;
  
  // 🆕 Avatar asynchron laden – dynamisches object-fit
  const avatarContainer = document.getElementById(`cardAv-${p.code}`);
  const imgContainer = document.getElementById(`cardImgContainer-${p.code}`);
  if (avatarContainer && imgContainer) {
    loadCardAvatar(p.code).then(avatarBase64 => {
      if (avatarBase64 && document.getElementById(`cardAv-${p.code}`)) {
        const testImg = new Image();
        testImg.onload = function() {
          const ratio = testImg.width / testImg.height;
          let fit, pos;
          if (ratio > 1.1) {
            fit = 'cover'; pos = 'center';
          } else if (ratio < 0.9) {
            fit = 'cover'; pos = 'top';
          } else {
            fit = 'cover'; pos = 'center';
          }
          avatarContainer.innerHTML = `<img src="${avatarBase64}" alt="${name}" 
            style="width:100%;height:100%;object-fit:${fit};object-position:${pos};"
            ondblclick="event.stopPropagation(); showFullscreenAvatar(this.src, '${name.replace(/'/g, "\\'")}')">`;
        };
        testImg.src = avatarBase64;
        avatarContainer.style.fontSize = '0';
        imgContainer.style.background = 'none';
      }
    });
  }
  
  // 🆕 Kommentare für die Rückseite laden
  const isOwner = (localStorage.getItem('sm_code') === p.code);
  loadComments(p.code).then(comments => {
    const listEl = document.getElementById(`commentsList-${p.code}`);
    const countEl = document.getElementById(`commentCount-${p.code}`);
    if (listEl) {
      listEl.innerHTML = renderCommentsSection(comments, p.code, isOwner);
    }
    if (countEl) {
      countEl.textContent = `(${comments.length})`;
    }
  });
  
  initCardSwipe();
  preloadNextProfiles();
}

// ══════════════════════════════════════════════════════════════════════════════
// GESTEN-STEUERUNG v4.1
// Doppeltap Card = Flip | Doppeltap Bild = Fullscreen | Swipe = Nächste Karte
// Pinch = Kurznachricht | Rückseite: natives Scrollen & Tippen
// ══════════════════════════════════════════════════════════════════════════════

let tapTimer = null;
let touchMoved = false;
let initialPinchDistance = 0;
let isPinching = false;

function getTouchDistance(e) {
  if (e.touches.length < 2) return 0;
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function initCardSwipe() {
  const wrapper = document.getElementById('cardWrapper');
  const inner = document.getElementById('cardInner');
  if (!wrapper || !inner) return;
  
  let startX, startY, moveX = 0;
  let isDragging = false;
  
  const onStart = (e) => {
    // Wenn Card bereits geflippt ist → keine Gesten, natives Scrollen/Tippen
    const inner = document.getElementById('cardInner');
    if (inner && inner.classList.contains('is-flipped')) {
      return;
    }
    
    // Pinch erkennen (2 Finger)
    if (e.touches && e.touches.length === 2) {
      initialPinchDistance = getTouchDistance(e);
      isPinching = true;
      return;
    }
    
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    touchMoved = false;
    isDragging = false;
    isPinching = false;
    wrapper.style.transition = 'none';
    
    document.addEventListener('mousemove', onMove);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
  };
  
  const onMove = (e) => {
    if (isPinching && e.touches && e.touches.length === 2) {
      const currentDistance = getTouchDistance(e);
      if (initialPinchDistance > 0 && currentDistance < initialPinchDistance * 0.6) {
        isPinching = false;
        handlePinch();
        return;
      }
      return;
    }
    
    if (e.type.includes('touch')) e.preventDefault();
    let currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    moveX = currentX - startX;
    if (Math.abs(moveX) > 8) {
      touchMoved = true;
      isDragging = true;
    }
    if (isDragging) {
      wrapper.style.transform = `translateX(${moveX}px) rotate(${moveX / 15}deg)`;
    }
  };
  
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    
    wrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    if (isPinching) {
      isPinching = false;
      return;
    }
    
    if (!touchMoved && !isDragging) {
      // Doppeltap für Flip
      if (tapTimer) {
        clearTimeout(tapTimer);
        tapTimer = null;
        const inner = document.getElementById('cardInner');
        if (inner) inner.classList.toggle('is-flipped');
      } else {
        tapTimer = setTimeout(() => { tapTimer = null; }, 300);
      }
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

// Pinch → Kurznachricht schreiben
function handlePinch() {
  const p = filtered[currentIndex];
  if (!p) return;
  
  const wrapper = document.getElementById('cardWrapper');
  if (wrapper) {
    wrapper.style.transition = 'transform 0.2s ease';
    wrapper.style.transform = 'scale(0.9)';
    setTimeout(() => {
      wrapper.style.transform = 'scale(1)';
      setTimeout(() => wrapper.style.transition = 'transform 0.4s ease', 200);
    }, 150);
  }
  
  if (typeof showKurznachrichtModal === 'function') {
    showKurznachrichtModal(p.code, p.name);
  }
  
  if (navigator.vibrate) navigator.vibrate([10, 50, 10]);
}

// Fullscreen für Avatar (via DoubleTap auf <img>)
function showFullscreenAvatar(avatarBase64, name) {
  const existing = document.getElementById('avatarFullscreen');
  if (existing) existing.remove();
  
  const html = `
    <div id="avatarFullscreen" onclick="this.remove()" style="
      position:fixed; top:0; left:0; width:100%; height:100%; 
      background:rgba(0,0,0,0.95); z-index:9999;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      animation: fadeIn 0.2s ease;
    ">
      <button onclick="event.stopPropagation(); document.getElementById('avatarFullscreen').remove()" style="
        position:absolute; top:20px; right:20px;
        width:40px; height:40px; border-radius:50%;
        background:rgba(255,255,255,0.1); border:none; color:white; font-size:1.5rem;
        cursor:pointer; z-index:1;
      ">✕</button>
      <img src="${avatarBase64}" alt="${name || 'Avatar'}" style="
        max-width:95%; max-height:80%; object-fit:contain; border-radius:8px;
      ">
      ${name ? `<p style="color:white; margin-top:1rem; font-size:1.1rem; opacity:0.8;">${name}</p>` : ''}
      <p style="color:rgba(255,255,255,0.4); font-size:0.75rem; margin-top:0.5rem;">Tippen zum Schließen</p>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', html);
}

//
// ══════════════════════════════════════════════════════════════════════════════
// PROFILE COMMENTS (Story-Kommentare)
// ══════════════════════════════════════════════════════════════════════════════

async function loadComments(code) {
  if (COMMENTS_CACHE.has(code)) return COMMENTS_CACHE.get(code);
  
  try {
    const res = await fetch(`${API_BASE}/profile-comments/${code}?spot=dates`);
    if (!res.ok) return [];
    const data = await res.json();
    COMMENTS_CACHE.set(code, data);
    setTimeout(() => COMMENTS_CACHE.delete(code), 120000);
    return data;
  } catch(e) { return []; }
}

async function submitComment(profileCode, senderCode, senderName, message) {
  try {
    const res = await fetch(`${API_BASE}/profile-comment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileCode, senderCode, senderName, message })
    });
    const data = await res.json();
    if (data.success) {
      COMMENTS_CACHE.delete(profileCode);
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch(e) {
    return { success: false, error: 'Server nicht erreichbar' };
  }
}

async function deleteComment(commentId, profileCode) {
  const token = localStorage.getItem('sm_token');
  const code  = localStorage.getItem('sm_code');
  if (!token || !code) return { success: false, error: 'Nicht eingeloggt' };
  
  try {
    const res = await fetch(`${API_BASE}/profile-comment/${commentId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, token })
    });
    const data = await res.json();
    if (data.success) {
      COMMENTS_CACHE.delete(profileCode);
      return { success: true };
    }
    return { success: false, error: data.error };
  } catch(e) {
    return { success: false, error: 'Server nicht erreichbar' };
  }
}

function renderCommentsSection(comments, profileCode, isOwner) {
  if (!comments || comments.length === 0) {
    return `<div class="comments-empty">💬 Noch keine Kommentare. Sei der Erste!</div>`;
  }
  
  return comments.map(c => `
    <div class="comment-item">
      <div class="comment-header">
        <div class="comment-avatar-mini" id="cmtAv-${c.id}" 
          onclick="event.stopPropagation(); showCommenterProfile('${c.senderCode}')" 
          style="cursor:pointer;" title="Profil von ${escHtml(c.senderName || '?')} anzeigen">
          ${(c.senderName || '?')[0]?.toUpperCase()}
        </div>
        <span class="comment-name">${escHtml(c.senderName || '?')}</span>
        <span class="comment-time">${timeAgo(c.createdAt)}</span>
        ${isOwner ? `<button class="comment-delete-btn" onclick="event.stopPropagation(); handleDeleteComment(${c.id},'${profileCode}')" title="Löschen">✕</button>` : ''}
      </div>
      <div class="comment-text">${escHtml(c.message)}</div>
    </div>
  `).join('');
}

function renderAndLoadCommentAvatars(comments, profileCode, isOwner, container) {
  container.innerHTML = renderCommentsSection(comments, profileCode, isOwner);
  
  comments.forEach(c => {
    const avEl = document.getElementById(`cmtAv-${c.id}`);
    if (avEl) {
      loadCardAvatar(c.senderCode).then(avatarBase64 => {
        if (avatarBase64 && document.getElementById(`cmtAv-${c.id}`)) {
          avEl.innerHTML = `<img src="${avatarBase64}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          avEl.style.fontSize = '0';
          avEl.style.background = 'none';
        }
      });
    }
  });
}

window.showCommenterProfile = function(senderCode) {
  // In filtered nach dem Profil suchen
  let index = filtered.findIndex(p => p.code === senderCode);
  
  if (index >= 0) {
    // Profil ist in der aktuellen Liste → direkt hinspringen
    currentIndex = index;
    renderCurrentCard();
  } else {
    // Profil ist nicht in der Liste (z.B. durch Filter ausgeblendet)
    // Filter zurücksetzen und dann suchen
    handleFilterReset();
    setTimeout(() => {
      index = filtered.findIndex(p => p.code === senderCode);
      if (index >= 0) {
        currentIndex = index;
        renderCurrentCard();
      } else if (typeof toast === 'function') {
        toast('Profil nicht gefunden');
      }
    }, 400);
  }
};

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.submitCommentHandler = async function(profileCode) {
  const input = document.getElementById(`commentInput-${profileCode}`);
  const statusEl = document.getElementById(`commentStatus-${profileCode}`);
  if (!input) return;
  
  const message = input.value.trim();
  if (!message || message.length > 140) {
    if (statusEl) { statusEl.textContent = 'Max. 140 Zeichen'; statusEl.style.color = '#f44'; }
    return;
  }
  
  const senderCode = localStorage.getItem('sm_code');
  const senderName = localStorage.getItem('sm_name') || 'Ich';
  
  if (!senderCode) {
    if (statusEl) { statusEl.textContent = 'Bitte erst Profil erstellen'; statusEl.style.color = '#f44'; }
    return;
  }
  
  if (statusEl) { statusEl.textContent = '⏳'; statusEl.style.color = ''; }
  
  const result = await submitComment(profileCode, senderCode, senderName, message);
  
  if (result.success) {
    input.value = '';
    if (statusEl) { statusEl.textContent = '✅ Gesendet!'; statusEl.style.color = '#1ecc68'; }
    const comments = await loadComments(profileCode);
    const container = document.getElementById(`commentsList-${profileCode}`);
    if (container) {
      const isOwner = (localStorage.getItem('sm_code') === profileCode);
      renderAndLoadCommentAvatars(comments, profileCode, isOwner, container);
    }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } else {
    if (statusEl) { statusEl.textContent = result.error || 'Fehler'; statusEl.style.color = '#f44'; }
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
  }
};

window.handleDeleteComment = async function(commentId, profileCode) {
  if (!confirm('Kommentar löschen?')) return;
  const result = await deleteComment(commentId, profileCode);
  if (result.success) {
    const comments = await loadComments(profileCode);
    const container = document.getElementById(`commentsList-${profileCode}`);
    if (container) {
      const isOwner = (localStorage.getItem('sm_code') === profileCode);
      renderAndLoadCommentAvatars(comments, profileCode, isOwner, container);
    }
  }
};
// ══════════════════════════════════════════════════════════════════════════════
// NOTIEREN (nur manuell über ❤️ Button)
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
          <div class="noted-avatar" id="notedAv-${p.code}" style="overflow:hidden;">
            ${(p.name || '?')[0]?.toUpperCase()}
          </div>
          <div class="noted-name">${p.name || '?'}</div>
        </div>
      `).join('')}
    </div>
  `;
  
  profiles.forEach(p => {
    const avEl = document.getElementById(`notedAv-${p.code}`);
    if (avEl) {
      loadCardAvatar(p.code).then(avatarBase64 => {
        if (avatarBase64 && document.getElementById(`notedAv-${p.code}`)) {
          avEl.innerHTML = `<img src="${avatarBase64}" alt="${p.name || ''}" 
            style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
          avEl.style.fontSize = '0';
          avEl.style.background = 'none';
        }
      });
    }
  });
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
// MEIN PROFIL ANZEIGEN (Kommentare lesen/löschen)
// ══════════════════════════════════════════════════════════════════════════════

window.showMyProfile = function() {
  const myCode = localStorage.getItem('sm_code');
  const myName = localStorage.getItem('sm_name') || 'Ich';
  
  if (!myCode) {
    if (typeof toast === 'function') toast('Bitte erst ein Profil erstellen');
    return;
  }
  
  let myProfile = allProfiles.find(p => p.code === myCode);
  
  if (!myProfile) {
    const localProfile = JSON.parse(localStorage.getItem('sm_profile_dates') || '{}');
    myProfile = {
      code: myCode,
      name: myName,
      age: localProfile.age || '',
      city: localProfile.city || '',
      region: localProfile.region || '',
      bio: localProfile.bio || 'Keine Beschreibung',
      lookingFor: localProfile.lookingFor || '',
      ts: Date.now()
    };
  }
  
  const rest = allProfiles.filter(p => p.code !== myCode);
  filtered = [myProfile, ...rest];
  currentIndex = 0;
  renderList();
  
  if (typeof toast === 'function') toast('👤 Dein Profil');
};

// ══════════════════════════════════════════════════════════════════════════════
// CSS
// ══════════════════════════════════════════════════════════════════════════════

const cardStyles = document.createElement('style');
cardStyles.textContent = `
  .card-empty { text-align:center; padding:2rem; color:var(--muted); background:var(--card); border-radius:16px; }
  .card-swipe-container { position:relative; width:100%; height:460px; perspective:1000px; margin-bottom:1.5rem; }
  .card-nav { display:flex; justify-content:space-between; align-items:center; padding:.5rem 0; margin-bottom:.3rem; }
  .card-nav-btn { width:44px; height:44px; border-radius:50%; background:var(--card); border:1px solid var(--bord); color:var(--text); font-size:1.2rem; cursor:pointer; display:flex; align-items:center; justify-content:center; }
  .card-nav-btn:active { background:var(--bord); }
  .card-nav-info { font-size:.85rem; color:var(--muted2); font-weight:600; }
  .card-wrapper { position:absolute; width:100%; height:calc(100% - 50px); cursor:grab; user-select:none; touch-action:none; transition:transform 0.4s cubic-bezier(0.175,0.885,0.32,1.275); }
  .card-wrapper:active { cursor:grabbing; }
  .card-inner { position:relative; width:100%; height:100%; transition:transform 0.6s cubic-bezier(0.4,0.2,0.2,1); transform-style:preserve-3d; border-radius:20px; box-shadow:0 8px 20px rgba(0,0,0,.4); }
  .card-inner.is-flipped { transform:rotateY(180deg); }
  .card-front, .card-back { position:absolute; width:100%; height:100%; backface-visibility:hidden; background:var(--card,#1c222b); border:1px solid var(--bord); border-radius:20px; overflow:hidden; display:flex; flex-direction:column; }
  .card-back { transform:rotateY(180deg); padding:1.2rem; overflow-y:auto; -webkit-overflow-scrolling:touch; touch-action:pan-y; }
  .card-image-container { height:50%; background:linear-gradient(135deg,var(--p2),var(--p3)); display:flex; align-items:center; justify-content:center; position:relative; }
  .card-avatar-large { font-size:4rem; color:white; opacity:.8; width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
  .card-avatar-large img { width:100%; height:100%; object-fit:cover; object-position:top; }
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
  .back-header { font-size:1.2rem; font-weight:700; color:var(--acc); margin-bottom:1rem; flex-shrink:0; }
  .back-section { margin-bottom:1rem; flex-shrink:0; }
  .back-section h4 { font-size:.75rem; color:var(--muted); text-transform:uppercase; margin-bottom:.3rem; letter-spacing:1px; }
  .story-text { font-size:0.9rem; color:var(--text); line-height:1.6; font-style:italic; padding:0.5rem 0; border-left:3px solid var(--acc); padding-left:0.8rem; }
  .comments-list { overflow-y:visible; margin-bottom:0.5rem; flex-shrink:0; }
  .comments-loading { font-size:0.75rem; color:var(--muted); text-align:center; padding:0.5rem; }
  .comments-empty { font-size:0.75rem; color:var(--muted); text-align:center; padding:0.8rem; font-style:italic; }
  .comment-item { padding:0.4rem 0; border-bottom:1px solid rgba(255,255,255,0.04); }
  .comment-header { display:flex; align-items:center; gap:0.4rem; margin-bottom:0.15rem; }
  .comment-name { font-size:0.7rem; font-weight:600; color:var(--acc); }
  .comment-time { font-size:0.6rem; color:var(--muted); }
  .comment-delete-btn { margin-left:auto; background:none; border:none; color:var(--muted); cursor:pointer; font-size:0.65rem; padding:2px 4px; }
  .comment-delete-btn:hover { color:#f44; }
  .comment-text { font-size:0.78rem; color:var(--text-dim); line-height:1.4; }
  .comment-input-row { display:flex; gap:0.3rem; margin-top:0.5rem; flex-shrink:0; }
  .comment-input { flex:1; padding:0.5rem 0.7rem; background:rgba(255,255,255,0.04); border:1px solid var(--bord); border-radius:10px; color:var(--text); font-size:0.75rem; outline:none; font-family:inherit; resize:none; }
  .comment-input:focus { border-color:var(--acc); }
  .comment-send-btn { width:36px; height:36px; border-radius:10px; background:var(--acc); border:none; color:white; font-size:1rem; cursor:pointer; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .comment-send-btn:active { transform:scale(0.95); }
  .comment-status { font-size:0.65rem; text-align:right; margin-top:0.2rem; min-height:1em; flex-shrink:0; }
  .comment-avatar-mini { width:30px; height:30px; border-radius:50%; background:linear-gradient(135deg,var(--p2),var(--p3)); display:flex; align-items:center; justify-content:center; font-size:0.55rem; color:white; flex-shrink:0; overflow:hidden; }
  .back-tags { display:flex; gap:6px; flex-wrap:wrap; }
  .back-tag { padding:4px 10px; background:rgba(255,255,255,.06); border-radius:8px; font-size:.8rem; }
  .back-actions { display:flex; gap:8px; flex-shrink:0; }
  .back-actions button { flex:1; padding:8px; border-radius:10px; border:1px solid var(--bord); background:rgba(255,255,255,.04); color:var(--text); cursor:pointer; font-size:.8rem; font-weight:600; }
  .noted-section { margin:1rem 0; }
  .noted-header { font-size:.8rem; font-weight:600; color:var(--p3); margin-bottom:.5rem; }
  .noted-list { display:flex; gap:8px; overflow-x:auto; padding-bottom:.5rem; }
  .noted-item { display:flex; flex-direction:column; align-items:center; gap:4px; cursor:pointer; min-width:60px; }
  .noted-avatar { width:44px; height:44px; border-radius:50%; background:linear-gradient(135deg,var(--p2),var(--p3)); display:flex; align-items:center; justify-content:center; font-size:1.1rem; color:white; overflow:hidden; }
  .noted-name { font-size:.65rem; color:var(--muted2); text-align:center; max-width:60px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .filter-drawer { margin-top:1rem; padding:1rem; background:var(--card); border:1px solid var(--bord); border-radius:16px; }
  .filter-title { font-size:.8rem; font-weight:600; color:var(--muted); margin-bottom:.8rem; text-transform:uppercase; letter-spacing:1px; }
  .filter-select-row { display:flex; gap:.5rem; margin-bottom:.8rem; }
  .filter-select { flex:1; padding:.6rem .8rem; background:var(--bg); border:1px solid var(--bord); border-radius:10px; color:var(--text); font-size:.85rem; outline:none; }
  .filter-row { display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:.5rem; }
  .filter-chip { padding:.4rem .8rem; border-radius:20px; font-size:.75rem; cursor:pointer; background:rgba(255,255,255,.04); border:1px solid var(--bord); color:var(--muted2); transition:all .2s; }
  .filter-chip.active { border-color:var(--acc); color:var(--acc); background:var(--acc-dim); }
  .reset-link { background:none; border:none; color:var(--muted); font-size:.75rem; cursor:pointer; padding:.3rem 0; display:flex; align-items:center; gap:.3rem; }
  .close-back-btn { display:block; width:100%; margin-top:0.8rem; padding:0.6rem; background:rgba(255,255,255,0.04); border:1px solid var(--bord); border-radius:10px; color:var(--muted); font-size:0.75rem; cursor:pointer; text-align:center; flex-shrink:0; }
  .close-back-btn:active { background:rgba(255,255,255,0.1); }
  .online-badge { position:absolute; top:10px; left:10px; padding:3px 10px; border-radius:12px; background:rgba(30,204,104,0.15); color:#1ecc68; font-size:0.7rem; font-weight:600; display:flex; align-items:center; gap:4px; backdrop-filter:blur(8px); z-index:5; }
  
  @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
`;
document.head.appendChild(cardStyles);

console.log('✅ spot-dates-card.js v4.1 geladen – Doppeltap-Flip & Scroll-Fix');
