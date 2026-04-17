'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – RENDERING (spot-render.js)
// + Radar-Highlight unterhalb (eigene Zeile), kein "Radar"-Schriftzug
// ══════════════════════════════════════════════════════════════════════════════

// ... (Spot-Chat Funktionen unverändert) ...

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
    node.onclick = () => {
      updateRadarHighlight(profile);
      showProfileDetail(profile);
    };
    field.appendChild(node);
  });
  
  document.getElementById('status-indicator').textContent = `● ${profilesWithLocation.length} RADAR`;
  updateRadarHighlight(null);
}

function updateRadarHighlight(profile) {
  const viewport = document.querySelector('.radar-viewport');
  // Sicherstellen, dass das Highlight nach dem Canvas existiert
  let highlight = document.getElementById('radar-highlight');
  if (!highlight) {
    highlight = document.createElement('div');
    highlight.id = 'radar-highlight';
    highlight.style.cssText = `
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 16px;
      margin-top: 12px;
      background: var(--card);
      border-radius: 40px;
      border: 1px solid var(--bord);
      font-size: 0.9rem;
      width: 100%;
      box-sizing: border-box;
    `;
    // Nach dem radar-canvas einfügen
    const canvas = document.getElementById('radar-field');
    canvas.parentNode.insertBefore(highlight, canvas.nextSibling);
  }

  if (!profile) {
    highlight.innerHTML = `
      <div style="width:32px;height:32px;border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;">👤</div>
      <div style="color:var(--text-dim);">Tippe auf einen Punkt im Radar</div>
    `;
    return;
  }

  const loc = locationCache.get(profile.code);
  const av = profile.avatar
    ? `<img src="${profile.avatar}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
    : `<div style="width:32px;height:32px;border-radius:50%;background:var(--bg2);display:flex;align-items:center;justify-content:center;font-size:1.1rem;font-weight:bold;">${(profile.name || profile.code)[0]?.toUpperCase() || '🧑'}</div>`;

  let distText = 'Standort nicht verfügbar';
  if (loc && userPosition) {
    const dist = getDistance(userPosition.lat, userPosition.lng, loc.lat, loc.lng);
    distText = `📍 ${formatDistance(dist)} entfernt`;
  } else if (loc) {
    distText = `📍 Standort vorhanden`;
  }

  highlight.innerHTML = `
    ${av}
    <div style="flex:1;">
      <div style="font-weight:600;">${esc(profile.name || formatCode(profile.code))}</div>
      <div style="color:var(--text-dim); font-size:0.8rem;">${distText}</div>
    </div>
  `;
}

// ... (renderList, showProfileDetail unverändert) ...
