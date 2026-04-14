'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – UI CORE (ui-core.js)
// Screen-Management, Sheets, Status-Badge, Menüs
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Screen wechseln
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('in-notif').classList.remove('show');
  
  // Local-Mode-Banner aktualisieren
  const banner = document.getElementById('local-mode-banner');
  if (banner) {
    banner.style.display = (!peer?.open && id === 's-home') ? 'flex' : 'none';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Status-Badge (Header)
function setSpill(type, text) {
  const badge = document.getElementById('header-status');
  if (!badge) return;
  badge.textContent = text;
  badge.className = 'status-badge';
  if (type === 'offline') badge.classList.add('offline');
  else if (type === 'online') badge.classList.add('online');
  else if (type === 'connecting') badge.classList.add('connecting');
}

function updateConnectionStatus() {
const online = !!(peer && peer.open && !isOffline);
const badge = document.getElementById('header-status');
  const banner = document.getElementById('local-mode-banner');
  
  if (!badge) return;
  
  if (online) {
    badge.innerHTML = '● ONLINE';
    badge.className = 'status-badge online';
  } else {
    badge.innerHTML = '○ LOCAL';
    badge.className = 'status-badge local';
  }
  
  if (banner) {
    banner.style.display = (!online && document.getElementById('s-home').classList.contains('active')) ? 'flex' : 'none';
  }
}

function showCodeCard(show) {
  const card = document.querySelector('.code-card-new');
  if (card) card.style.display = show ? '' : 'none';
  updateConnectionStatus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheets (Bottom Sheets)
function openSheet() {
  document.getElementById('sovl').classList.add('open');
  document.getElementById('sheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('sovl').classList.remove('open');
  document.getElementById('sheet').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
// Home-Menü (⋮)
function toggleHomeMenu(e) {
  e.stopPropagation();
  document.getElementById('home-drop').classList.toggle('open');
}

function closeHomeMenu() {
  document.getElementById('home-drop').classList.remove('open');
}

// ─────────────────────────────────────────────────────────────────────────────
// Zurück zum Home-Screen (Chat beenden)
function goHome() {
  stopRingingTone();
  
  const wasCallingOut = outgoingCallTimer !== null && partnerCode;
  if (outgoingCallTimer) {
    clearTimeout(outgoingCallTimer);
    outgoingCallTimer = null;
  }
  if (conn) {
    try { conn.close(); } catch (e) {}
    conn = null;
  }
  if (partnerTypingTimer) {
    clearTimeout(partnerTypingTimer);
    partnerTypingTimer = null;
  }
  if (typingStarted) {
    typingStarted = false;
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
  }
  pendingConn = null;
  lastDate = null;
  
  document.querySelectorAll('.dinp-new').forEach(d => {
    d.value = '';
    d.classList.remove('filled');
  });
  document.getElementById('cbtn').disabled = true;
  
  closeSheet();
  renderPrev();
  updateConnectionStatus();
  
  if (wasCallingOut) {
    addMissed(partnerCode, partnerName, true);
    showLeaveMessageSheet(partnerCode, partnerName);
  } else {
    showScreen('s-home');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Offline gehen (manuell)
function goOffline() {
  if (!confirm('Verbindung zum Server trennen?')) return;
  if (conn) {
    try { conn.close(); } catch (e) {}
    conn = null;
  }
  if (peer) {
    try { peer.destroy(); } catch (e) {}
    peer = null;
  }
  isOffline = true;
  showCodeCard(false);
  setSpill('offline', '○ LOCAL');
  showScreen('s-home');
  updateConnectionStatus();
}