'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – UI CORE (ui-core.js)
// Screen-Management, Sheets, Status-Badge, Menüs + Info-Modal
// + Lokal‑Modus‑Timer + Backup‑Check
// ══════════════════════════════════════════════════════════════════════════════

let localModeStartTime = null;
let localModeTimer = null;

function startLocalModeTimer() {
  if (localModeTimer) return;
  localModeStartTime = Date.now();
  localModeTimer = setInterval(() => {
    if (typeof Usage !== 'undefined') Usage.addLocalModeTime(10000);
  }, 10000);
}

function stopLocalModeTimer() {
  if (!localModeTimer) return;
  clearInterval(localModeTimer);
  localModeTimer = null;
  if (localModeStartTime) {
    const elapsed = Date.now() - localModeStartTime;
    if (typeof Usage !== 'undefined') Usage.addLocalModeTime(elapsed);
    localModeStartTime = null;
  }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  document.getElementById('in-notif').classList.remove('show');
  const banner = document.getElementById('local-mode-banner');
  if (banner) banner.style.display = (!peer?.open && id === 's-home') ? 'flex' : 'none';
}

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
  const online = peer && peer.open && !isOffline;
  const badge = document.getElementById('header-status');
  const banner = document.getElementById('local-mode-banner');
  if (!badge) return;
  if (online) {
    badge.innerHTML = '● ONLINE';
    badge.className = 'status-badge online';
    stopLocalModeTimer();
  } else {
    badge.innerHTML = '○ LOCAL';
    badge.className = 'status-badge local';
    startLocalModeTimer();
  }
  if (banner) banner.style.display = (!online && document.getElementById('s-home').classList.contains('active')) ? 'flex' : 'none';
}

function showCodeCard(show) {
  const card = document.querySelector('.code-card-new');
  if (card) card.style.display = show ? '' : 'none';
  updateConnectionStatus();
}

function openSheet() {
  document.getElementById('sovl').classList.add('open');
  document.getElementById('sheet').classList.add('open');
}

function closeSheet() {
  document.getElementById('sovl').classList.remove('open');
  document.getElementById('sheet').classList.remove('open');
}

function toggleHomeMenu(e) {
  e.stopPropagation();
  document.getElementById('home-drop').classList.toggle('open');
}

function closeHomeMenu() {
  document.getElementById('home-drop').classList.remove('open');
}

function goHome() {
  stopRingingTone();
  const wasCallingOut = outgoingCallTimer !== null && partnerCode;
  if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
  if (conn) { try { conn.close(); } catch (e) {} conn = null; }
  if (partnerTypingTimer) { clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
  if (typingStarted) { typingStarted = false; if (typingDebounceTimer) clearTimeout(typingDebounceTimer); }
  pendingConn = null; lastDate = null;
  document.querySelectorAll('.dinp-new').forEach(d => { d.value = ''; d.classList.remove('filled'); });
  document.getElementById('cbtn').disabled = true;
  closeSheet(); renderPrev(); updateConnectionStatus();
  if (wasCallingOut) { addMissed(partnerCode, partnerName, true); showLeaveMessageSheet(partnerCode, partnerName); }
  else showScreen('s-home');
}

function goOffline() {
  if (!confirm('Verbindung zum Server trennen?')) return;
  if (conn) { try { conn.close(); } catch (e) {} conn = null; }
  if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
  isOffline = true; showCodeCard(false); setSpill('offline', '○ LOCAL'); showScreen('s-home'); updateConnectionStatus();
}

function showInfoModal(title, message, buttonText = 'OK') {
  let modal = document.getElementById('info-modal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'info-modal'; modal.className = 'modal'; modal.style.display = 'none';
    modal.innerHTML = `<div class="modal-content" style="max-width:320px; text-align:center;"><h3 id="info-modal-title"></h3><p id="info-modal-message" style="margin:16px 0; color:var(--text-dim);"></p><button id="info-modal-ok" class="btn-primary" style="width:100%;">OK</button></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#info-modal-ok').addEventListener('click', () => modal.style.display = 'none');
    modal.addEventListener('click', e => { if (e.target === modal) modal.style.display = 'none'; });
  }
  document.getElementById('info-modal-title').textContent = title;
  document.getElementById('info-modal-message').textContent = message;
  document.getElementById('info-modal-ok').textContent = buttonText;
  modal.style.display = 'flex';
}

// Backup-Check (wird von main.js aufgerufen)
function checkBackupOnStart() {
  if (typeof hasInitialBackup === 'function') {
    if (!hasInitialBackup()) {
      if (typeof showMandatoryBackupModal === 'function') showMandatoryBackupModal();
    } else if (typeof hasChangesSinceLastBackup === 'function' && hasChangesSinceLastBackup()) {
      if (typeof showBackupReminderModal === 'function') showBackupReminderModal();
    }
  }
      }
