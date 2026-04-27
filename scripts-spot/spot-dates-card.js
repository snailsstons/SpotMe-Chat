'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT DATES – CARD ANSICHT (autark)
// Flip, Swipe, Notieren – komplett isoliert vom Live-System
// ══════════════════════════════════════════════════════════════════════════════

const NOTED_KEY = 'sm_noted_dates';
let currentIndex = 0;
let notedProfiles = [];

// Überschreibt die globale renderList-Funktion
window.renderList = function() {
  const container = document.getElementById('community-list');
  if (!container) return;
  
  // Container für die Card-Ansicht umbauen
  container.innerHTML = `
    <div class="card-swipe-container" id="cardSwipeContainer">
      <div class="card-wrapper" id="cardWrapper"></div>
    </div>
    <div class="noted-section" id="notedSection"></div>
  `;
  
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  
  if (filtered.length > 0) {
    currentIndex = 0;
    renderCurrentCard();
  } else {
    document.getElementById('cardWrapper').innerHTML = `
      <div style="text-align:center; padding:2rem; color:var(--muted);">Keine Profile gefunden</div>
    `;
  }
  
  renderNotedSection();
};

function renderCurrentCard() {
  const wrapper = document.getElementById('cardWrapper');
  if (!wrapper || filtered.length === 0) return;
  
  const p = filtered[currentIndex];
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
  
  // Badges
  let badges = '';
  if (p.lookingFor) {
    const labels = { 'beziehung': '💕 Beziehung', 'freundschaft': '👥 Freundschaft', 'casual': '🍸 Casual' };
    badges += `<span class="card-tag">${labels[p.lookingFor] || p.lookingFor}</span>`;
  }
  
  wrapper.innerHTML = `
    <div class="card-inner" id="cardInner">
      <!-- VORDERSEITE -->
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
      
      <!-- RÜCKSEITE -->
      <div class="card-back">
        <div class="back-header">Mehr über ${name}</div>
        <div class="back-section">
          <h4>Über mich</h4>
          <p>${bio}</p>
        </div>
        ${p.orientation ? `
        <div class="back-section">
          <h4>Orientierung & Rolle</h4>
          <div class="back-tags">
            ${p.orientation ? `<span class="back-tag">${p.orientation}</span>` : ''}
            ${p.role ? `<span class="back-tag">${p.role}</span>` : ''}
          </div>
        </div>` : ''}
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
}

function initCardSwipe() {
  const wrapper = document.getElementById('cardWrapper');
  const inner = document.getElementById('cardInner');
  if (!wrapper || !inner) return;
  
  let startX, startY, moveX = 0, startTime;
  let isDragging = false;
  
  const onStart = (e) => {
    startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
    startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
    startTime = Date.now();
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
    const rotation = moveX / 15;
    wrapper.style.transform = `translateX(${moveX}px) rotate(${rotation}deg)`;
  };
  
  const onEnd = () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchend', onEnd);
    
    wrapper.style.transition = 'transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    
    const duration = Date.now() - startTime;
    
    if (!isDragging) {
      // Kurzer Klick → Flip
      inner.classList.toggle('is-flipped');
    } else if (Math.abs(moveX) > 100) {
      // Swipe → nächstes/vorheriges Profil
      const direction = moveX > 0 ? 1 : -1;
      const endX = direction * 600;
      wrapper.style.transform = `translateX(${endX}px) rotate(${moveX/5}deg)`;
      wrapper.style.opacity = '0';
      
      setTimeout(() => {
        currentIndex = (currentIndex + (direction > 0 ? -1 : 1) + filtered.length) % filtered.length;
        wrapper.style.transition = 'none';
        wrapper.style.transform = 'translateX(0) rotate(0deg)';
        wrapper.style.opacity = '1';
        inner.classList.remove('is-flipped');
        renderCurrentCard();
        setTimeout(() => wrapper.style.transition = 'transform 0.4s ease', 50);
      }, 300);
    } else {
      wrapper.style.transform = 'translateX(0) rotate(0deg)';
    }
    
    moveX = 0; isDragging = false;
  };
  
  wrapper.addEventListener('mousedown', onStart);
  wrapper.addEventListener('touchstart', onStart, { passive: false });
}

function toggleNote(code) {
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  const index = notedProfiles.indexOf(code);
  
  if (index >= 0) {
    notedProfiles.splice(index, 1);
  } else {
    notedProfiles.push(code);
  }
  
  localStorage.setItem(NOTED_KEY, JSON.stringify(notedProfiles));
  
  // Herz-Icon updaten
  const heart = document.getElementById('cardHeart');
  if (heart) heart.classList.toggle('active', index < 0);
  
  // Notierte Sektion updaten
  renderNotedSection();
}

function renderNotedSection() {
  const section = document.getElementById('notedSection');
  if (!section) return;
  
  notedProfiles = JSON.parse(localStorage.getItem(NOTED_KEY) || '[]');
  
  if (notedProfiles.length === 0) {
    section.innerHTML = '';
    return;
  }
  
  const profiles = allProfiles.filter(p => notedProfiles.includes(p.code));
  
  section.innerHTML = `
    <div class="noted-header">❤️ Notierte Profile (${notedProfiles.length})</div>
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
  const index = filtered.findIndex(p => p.code === code);
  if (index >= 0) {
    currentIndex = index;
    renderCurrentCard();
  }
}

// CSS für die Card-Ansicht dynamisch einfügen
const cardStyles = document.createElement('style');
cardStyles.textContent = `
  .card-swipe-container {
    position: relative; width: 100%; height: 420px;
    perspective: 1000px; margin-bottom: 1rem;
  }
  .card-wrapper {
    position: absolute; width: 100%; height: 100%;
    cursor: grab; user-select: none; touch-action: none;
    transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }
  .card-wrapper:active { cursor: grabbing; }
  
  .card-inner {
    position: relative; width: 100%; height: 100%;
    transition: transform 0.6s cubic-bezier(0.4, 0.2, 0.2, 1);
    transform-style: preserve-3d; border-radius: 20px;
    box-shadow: 0 8px 20px rgba(0,0,0,.4);
  }
  .card-inner.is-flipped { transform: rotateY(180deg); }
  
  .card-front, .card-back {
    position: absolute; width: 100%; height: 100%;
    backface-visibility: hidden;
    background: var(--card, #1c222b); border: 1px solid var(--bord);
    border-radius: 20px; overflow: hidden;
    display: flex; flex-direction: column;
  }
  .card-back {
    transform: rotateY(180deg); padding: 1.2rem;
    overflow-y: auto;
  }
  
  .card-image-container {
    height: 45%; background: linear-gradient(135deg, var(--p2), var(--p3));
    display: flex; align-items: center; justify-content: center;
    position: relative;
  }
  .card-avatar-large {
    font-size: 4rem; color: white; opacity: .8;
  }
  .card-heart {
    position: absolute; top: 10px; right: 10px;
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(0,0,0,.3); backdrop-filter: blur(8px);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; z-index: 10;
  }
  .card-heart svg { width: 20px; height: 20px; fill: transparent; stroke: white; stroke-width: 2; }
  .card-heart.active svg { fill: var(--p3); stroke: var(--p3); }
  .card-online-dot {
    position: absolute; top: 10px; left: 10px;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--muted);
  }
  .card-online-dot.online { background: var(--green); box-shadow: 0 0 8px var(--green); }
  
  .card-content { padding: .8rem 1rem; flex: 1; display: flex; flex-direction: column; }
  .card-name-age { font-size: 1.3rem; font-weight: 700; }
  .card-location { font-size: .8rem; color: var(--muted2); margin-bottom: .5rem; }
  .card-tag {
    display: inline-block; padding: 3px 10px; border-radius: 12px;
    font-size: .7rem; font-weight: 600; margin-bottom: .5rem;
    background: rgba(255,79,123,.15); color: #ff4f7b;
  }
  .card-bio { font-size: .85rem; color: var(--text-dim); flex: 1; }
  .card-bottom { display: flex; justify-content: space-between; align-items: center; margin-top: .5rem; }
  .card-time { font-size: .75rem; color: var(--muted); }
  .card-chat-btn {
    background: var(--acc); color: var(--bg); border: none;
    padding: 8px 16px; border-radius: 10px; font-weight: 700; cursor: pointer;
  }
  
  .back-header { font-size: 1.2rem; font-weight: 700; color: var(--acc); margin-bottom: 1rem; }
  .back-section { margin-bottom: 1rem; }
  .back-section h4 { font-size: .75rem; color: var(--muted); text-transform: uppercase; margin-bottom: .3rem; letter-spacing: 1px; }
  .back-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .back-tag { padding: 4px 10px; background: rgba(255,255,255,.06); border-radius: 8px; font-size: .8rem; }
  .back-actions { display: flex; gap: 8px; }
  .back-actions button {
    flex: 1; padding: 8px; border-radius: 10px; border: 1px solid var(--bord);
    background: rgba(255,255,255,.04); color: var(--text); cursor: pointer;
    font-size: .8rem; font-weight: 600;
  }
  .back-hint { text-align: center; font-size: .75rem; color: var(--muted); margin-top: auto; font-style: italic; }
  
  .noted-section { margin-top: 1rem; }
  .noted-header { font-size: .8rem; font-weight: 600; color: var(--p3); margin-bottom: .5rem; }
  .noted-list { display: flex; gap: 8px; overflow-x: auto; padding-bottom: .5rem; }
  .noted-item {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    cursor: pointer; min-width: 60px;
  }
  .noted-avatar {
    width: 44px; height: 44px; border-radius: 50%;
    background: linear-gradient(135deg, var(--p2), var(--p3));
    display: flex; align-items: center; justify-content: center;
    font-size: 1.1rem; color: white;
  }
  .noted-name { font-size: .65rem; color: var(--muted2); text-align: center; max-width: 60px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;
document.head.appendChild(cardStyles);

console.log('✅ spot-dates-card.js geladen – Card-Ansicht aktiv');
