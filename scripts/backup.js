'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – BACKUP & RESTORE (backup.js)
// Verschlüsselte Profilsicherung (Code, Kontakte, Chats, Alben)
// ══════════════════════════════════════════════════════════════════════════════

// Backup-Zwischenspeicher für Passwort-Import
let pendingRestoreFile = null;

// ─────────────────────────────────────────────────────────────────────────────
// Modals für Backup-Passwort
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
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup erstellen (mit oder ohne Passwort)
async function createBackup(password) {
  toast('📦 Sammle Daten für Backup...');
  try {
    // localStorage sammeln
    const lsData = {};
    const keysToBackup = [
      'sm_code', 'sm_name', 'sm_contacts', 'sm_idx', 'sm_missed',
      'sm_voice_enabled', 'sm_spot_published', 'sm_profile'
    ];
    for (const key of keysToBackup) {
      const val = localStorage.getItem(key);
      if (val !== null) lsData[key] = val;
    }
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('sm_pending_')) lsData[key] = localStorage.getItem(key);
    }

    // Chat-Verläufe
    const chatMessages = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('smmsg_')) chatMessages[key] = localStorage.getItem(key);
    }

    // IndexedDB: Alben & Fotos
    await initDB();
    const albums = await getAllAlbums();
    const photos = [];
    for (const album of albums) {
      const albumPhotos = await getPhotosByAlbum(album.id);
      photos.push(...albumPhotos.map(p => ({
        albumName: album.name,
        dataURL: p.dataURL,
        name: p.name,
        timestamp: p.timestamp
      })));
    }

    const backupData = {
      _spotme_backup: true,
      _version: 3,
      _date: new Date().toISOString(),
      localStorage: lsData,
      chatMessages,
      indexedDB: {
        albums: albums.map(a => ({
          name: a.name,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt
        })),
        photos
      }
    };

    let finalBlob;
    if (password) {
      const enc = await encryptData(JSON.stringify(backupData), password);
      finalBlob = new Blob([JSON.stringify({
        _spotme_backup: true,
        _encrypted: true,
        _version: 3,
        data: enc
      })], { type: 'application/json' });
      toast('🔐 Verschlüsseltes Backup erstellt');
    } else {
      finalBlob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      toast('💾 Unverschlüsseltes Backup gespeichert');
    }

    const url = URL.createObjectURL(finalBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SpotMe_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    toast('❌ Fehler: ' + e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verschlüsselung (AES-GCM, PBKDF2)
async function encryptData(text, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(text)
  );

  const combined = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
  combined.set(salt, 0);
  combined.set(iv, salt.length);
  combined.set(new Uint8Array(ciphertext), salt.length + iv.length);

  return btoa(String.fromCharCode(...combined));
}

async function decryptData(encryptedBase64, password) {
  const enc = new TextEncoder();
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));

  const salt = combined.slice(0, 16);
  const iv = combined.slice(16, 28);
  const ciphertext = combined.slice(28);

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  return new TextDecoder().decode(decrypted);
}

// ─────────────────────────────────────────────────────────────────────────────
// Wiederherstellung aus Datei
function restoreProfile(input) {
  closeHomeMenu();
  if (!input.files[0]) return;
  pendingRestoreFile = input.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const raw = e.target.result;
      const json = JSON.parse(raw);
      if (!json._spotme_backup) {
        toast('❌ Keine SpotMe-Backup-Datei');
        pendingRestoreFile = null;
        return;
      }

      if (json._encrypted) {
        document.getElementById('import-password-input').value = '';
        document.getElementById('import-password-ovl').classList.add('open');
        document.getElementById('import-password-sheet').classList.add('open');
      } else {
        await performRestore(json);
        pendingRestoreFile = null;
      }
    } catch (ex) {
      toast('❌ Ungültige Datei');
      pendingRestoreFile = null;
    }
  };
  reader.readAsText(pendingRestoreFile);
  input.value = '';
}

function closeImportPasswordModal() {
  document.getElementById('import-password-ovl').classList.remove('open');
  document.getElementById('import-password-sheet').classList.remove('open');
  pendingRestoreFile = null;
}

async function submitImportPassword() {
  const password = document.getElementById('import-password-input').value;
  if (!password) {
    toast('Bitte Passwort eingeben');
    return;
  }
  closeImportPasswordModal();

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const json = JSON.parse(e.target.result);
        const decrypted = await decryptData(json.data, password);
        const backupData = JSON.parse(decrypted);
        await performRestore(backupData);
      } catch (ex) {
        toast('❌ Falsches Passwort oder beschädigte Datei');
      }
      pendingRestoreFile = null;
    };
    reader.readAsText(pendingRestoreFile);
  } catch (e) {
    toast('❌ Fehler beim Entschlüsseln');
    pendingRestoreFile = null;
  }
}

async function performRestore(backupData) {
  try {
    // Info anzeigen
    let codeDisplay = 'unbekannt', nameDisplay = 'unbekannt';
    try {
      codeDisplay = backupData.localStorage?.sm_code
        ? formatCode(JSON.parse(backupData.localStorage.sm_code))
        : 'unbekannt';
    } catch {}
    try {
      nameDisplay = backupData.localStorage?.sm_name
        ? JSON.parse(backupData.localStorage.sm_name)
        : 'unbekannt';
    } catch {}

    if (!confirm(
      `Backup wiederherstellen?\n\n` +
      `Code: ${codeDisplay}\n` +
      `Name: ${nameDisplay}\n` +
      `Alben: ${backupData.indexedDB?.albums?.length || 0}, ` +
      `Fotos: ${backupData.indexedDB?.photos?.length || 0}\n` +
      `Chats: ${Object.keys(backupData.chatMessages || {}).length}\n` +
      `Datum: ${backupData._date?.slice(0, 10) || '?'}\n\n` +
      `⚠️ Alle aktuellen Daten werden überschrieben!`
    )) return;

    toast('🔄 Stelle Backup wieder her...');

    // localStorage leeren
    const keysToClear = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sm_') || key.startsWith('smmsg_') || key.startsWith('sm_pending_'))) {
        keysToClear.push(key);
      }
    }
    keysToClear.forEach(k => localStorage.removeItem(k));

    // Neue Daten schreiben
    if (backupData.localStorage) {
      Object.entries(backupData.localStorage).forEach(([k, v]) => localStorage.setItem(k, v));
    }
    if (backupData.chatMessages) {
      Object.entries(backupData.chatMessages).forEach(([k, v]) => localStorage.setItem(k, v));
    }

    // IndexedDB zurücksetzen
    await initDB();
    const oldAlbums = await getAllAlbums();
    for (const a of oldAlbums) await deleteAlbum(a.id);

    const albumIdMap = new Map();
    if (backupData.indexedDB?.albums) {
      for (const a of backupData.indexedDB.albums) {
        const id = await createAlbum(a.name);
        albumIdMap.set(a.name, id);
      }
    }
    if (backupData.indexedDB?.photos) {
      for (const p of backupData.indexedDB.photos) {
        const aid = albumIdMap.get(p.albumName);
        if (aid) await addPhoto(aid, p.dataURL, p.name);
      }
    }

    toast('✅ Backup wiederhergestellt · Neustart...');
    setTimeout(() => location.reload(), 2000);
  } catch (ex) {
    toast('❌ Fehler: ' + ex.message);
  }
}