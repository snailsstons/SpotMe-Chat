'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – BACKUP & RESTORE (backup.js)
// Verschlüsselte Profilsicherung + Pflicht-Backup + Erinnerungen
// ══════════════════════════════════════════════════════════════════════════════

let pendingRestoreFile = null;

// ─────────────────────────────────────────────────────────────────────────────
// Backup-Status
function hasInitialBackup() {
  return localStorage.getItem('sm_initial_backup_done') === '1';
}

function markInitialBackupDone() {
  localStorage.setItem('sm_initial_backup_done', '1');
}

function getLastBackupDate() {
  return localStorage.getItem('sm_last_backup_date') || null;
}

function setLastBackupDate() {
  localStorage.setItem('sm_last_backup_date', new Date().toISOString());
}

function hasChangesSinceLastBackup() {
  const last = getLastBackupDate();
  if (!last) return true;
  const daysSince = (Date.now() - new Date(last).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= 1;
}

// ─────────────────────────────────────────────────────────────────────────────
// Modals
function showBackupPasswordModal() {
  closeHomeMenu();
  document.getElementById('backup-password-input').value = '';
  document.getElementById('backup-password-ovl').classList.add('open');
  document.getElementById('backup-password-sheet').classList.add('open');
}

function closeBackupPasswordModal() {
  document.getElementById('backup-password-ovl').classList.remove('open');
  document.getElementById('backup-password-sheet').classList.remove('open');
}

async function performBackupWithPassword() {
  const password = document.getElementById('backup-password-input').value;
  closeBackupPasswordModal();
  await createBackup(password);
  setLastBackupDate();
  if (!hasInitialBackup()) markInitialBackupDone();
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup erstellen (wie gehabt)
async function createBackup(password) {
  toast('📦 Sammle Daten für Backup...');
  try {
    const lsData = {};
    const keysToBackup = ['sm_code','sm_name','sm_contacts','sm_idx','sm_missed','sm_voice_enabled','sm_spot_published','sm_profile'];
    for (const key of keysToBackup) { const val = localStorage.getItem(key); if (val !== null) lsData[key] = val; }
    for (let i=0; i<localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('sm_pending_')) lsData[key] = localStorage.getItem(key); }
    const chatMessages = {};
    for (let i=0; i<localStorage.length; i++) { const key = localStorage.key(i); if (key?.startsWith('smmsg_')) chatMessages[key] = localStorage.getItem(key); }
    await initDB();
    const albums = await getAllAlbums();
    const photos = [];
    for (const album of albums) {
      const albumPhotos = await getPhotosByAlbum(album.id);
      photos.push(...albumPhotos.map(p => ({ albumName: album.name, dataURL: p.dataURL, name: p.name, timestamp: p.timestamp })));
    }
    const backupData = {
      _spotme_backup: true, _version: 3, _date: new Date().toISOString(),
      localStorage: lsData, chatMessages,
      indexedDB: { albums: albums.map(a=>({ name:a.name, createdAt:a.createdAt, updatedAt:a.updatedAt })), photos }
    };

    let finalBlob;
    if (password) {
      const enc = await encryptData(JSON.stringify(backupData), password);
      finalBlob = new Blob([JSON.stringify({ _spotme_backup: true, _encrypted: true, _version: 3, data: enc })], {type:'application/json'});
      toast('🔐 Verschlüsseltes Backup erstellt');
    } else {
      finalBlob = new Blob([JSON.stringify(backupData, null, 2)], {type:'application/json'});
      toast('💾 Unverschlüsseltes Backup gespeichert');
    }

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SpotMe_Backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) { toast('❌ Fehler: ' + e.message); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verschlüsselung (unverändert)
async function encryptData(text, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0); combined.set(iv, salt.length); combined.set(new Uint8Array(ciphertext), salt.length + iv.length);
  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encryptedBase64, password) {
  const enc = new TextEncoder();
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
  const salt = combined.slice(0, 16), iv = combined.slice(16, 28), ciphertext = combined.slice(28);
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Restore (unverändert)
function restoreProfile(input) { /* ... */ }
function closeImportPasswordModal() { /* ... */ }
async function submitImportPassword() { /* ... */ }
async function performRestore(backupData) { /* ... */ }

// Backup-Erinnerungsmodal
function showBackupReminderModal() {
  let modal = document.getElementById('backup-reminder-modal');
  if (!modal) return;
  document.getElementById('backup-reminder-last').textContent = getLastBackupDate() ? new Date(getLastBackupDate()).toLocaleString() : 'nie';
  modal.style.display = 'flex';
}

function closeBackupReminderModal() {
  const modal = document.getElementById('backup-reminder-modal');
  if (modal) modal.style.display = 'none';
}

// Pflicht-Backup-Modal (neue Nutzer)
function showMandatoryBackupModal() {
  const existing = document.getElementById('mandatory-backup-modal');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.id = 'mandatory-backup-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>🔐 Willkommen bei SpotMe!</h3>
      <p>Deine Daten sind <strong>ausschließlich lokal</strong> auf diesem Gerät gespeichert. Um sie vor Verlust zu schützen, erstelle jetzt ein Backup.</p>
      <p><small>Das Backup wird verschlüsselt auf deinem Gerät gespeichert. Niemand außer dir hat Zugriff.</small></p>
      <button class="btn-primary" id="do-initial-backup">Backup erstellen</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('do-initial-backup').addEventListener('click', async () => {
    await performBackupWithPassword();
    modal.remove();
  });
}

// Prüfung beim Start
function checkInitialBackup() {
  if (!hasInitialBackup()) {
    showMandatoryBackupModal();
  } else if (hasChangesSinceLastBackup()) {
    showBackupReminderModal();
  }
}
