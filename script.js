'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// KONFIGURATION & GLOBALE VARIABLEN
// ══════════════════════════════════════════════════════════════════════════════
const SERVER_HOST = 'spotme-chat.onrender.com';
const SERVER_PATH = '/peerjs';
const API_MISSED = 'https://spotme-chat.onrender.com/api/missed-call';
function newCode() { return Math.floor(100000 + Math.random() * 900000).toString(); }

let peer = null, conn = null, pendingConn = null;
let myCode      = localStorage.getItem('sm_code') || newCode();
let myName      = localStorage.getItem('sm_name') || 'User_' + myCode.slice(0,4);
let partnerCode = '', partnerName = '', chatId = '';
let lastDate    = null;
const CHUNK     = 16384;
let fileBufs    = {};
let isOffline   = false;
let outgoingCallTimer = null;
let currentRingingAudio = null;

let typingStarted = false;
let typingDebounceTimer = null;
let partnerTypingTimer = null;

let pendingMessages = [];

let voiceEnabled = localStorage.getItem('sm_voice_enabled') !== 'false';

// Location Variablen
let locationMap = null;
let myMarker = null, partnerMarker = null;
let myPosition = null, partnerPosition = null;
let locationWatchId = null;
let locationInterval = null;
let currentRadius = 500;

// Backup-Zwischenspeicher für Passwort-Import
let pendingRestoreFile = null;

localStorage.setItem('sm_code', myCode);
localStorage.setItem('sm_name', myName);

// ══════════════════════════════════════════════════════════════════════════════
// PENDING MESSAGES
// ══════════════════════════════════════════════════════════════════════════════
function getPendingStorageKey() { return chatId ? 'sm_pending_' + chatId : 'sm_pending_temp'; }
function loadPendingMessages() { const key = getPendingStorageKey(); const stored = localStorage.getItem(key); try { pendingMessages = stored ? JSON.parse(stored) : []; } catch(e){ pendingMessages = []; } updatePendingBadge(); }
function savePendingMessages() { const key = getPendingStorageKey(); if(pendingMessages.length === 0) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(pendingMessages)); }
function addPendingMessage(text) { pendingMessages.push({ text, ts: Date.now() }); savePendingMessages(); updatePendingBadge(); }
function clearPendingMessages() { pendingMessages = []; const key = getPendingStorageKey(); localStorage.removeItem(key); updatePendingBadge(); }
function updatePendingBadge() { const btn = document.getElementById('sbtn'); if(!btn) return; const count = pendingMessages.length; if(count > 0) { btn.style.position = 'relative'; let badge = document.getElementById('pending-badge'); if(!badge) { badge = document.createElement('span'); badge.id = 'pending-badge'; badge.style.position = 'absolute'; badge.style.top = '-8px'; badge.style.right = '-8px'; badge.style.backgroundColor = 'var(--p3)'; badge.style.color = 'white'; badge.style.borderRadius = '12px'; badge.style.padding = '2px 6px'; badge.style.fontSize = '11px'; badge.style.fontWeight = 'bold'; btn.appendChild(badge); } badge.textContent = count > 99 ? '99+' : count; badge.style.display = 'block'; } else { const badge = document.getElementById('pending-badge'); if(badge) badge.style.display = 'none'; } }
function flushPendingMessages() { if(!conn || !conn.open) return; if(pendingMessages.length === 0) return; const toSend = [...pendingMessages]; clearPendingMessages(); for(let msg of toSend){ const m = { t:'text', text: msg.text, ts: msg.ts }; conn.send(m); appendMsg({ ...m, own: true }); persistMsg({ ...m, own: true }); } toast(`📨 ${toSend.length} ${toSend.length===1?'Nachricht':'Nachrichten'} gesendet`); }
function migratePendingMessages(newChatId) { const oldKey = 'sm_pending_temp'; const stored = localStorage.getItem(oldKey); if(stored){ try{ const tempMsgs = JSON.parse(stored); if(tempMsgs.length > 0){ pendingMessages = tempMsgs; savePendingMessages(); localStorage.removeItem(oldKey); updatePendingBadge(); } } catch(e){} } }

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO & HAPTIK
// ══════════════════════════════════════════════════════════════════════════════
const CACHE_NAME = 'spotme-sounds';
const TONE_URL = '/sounds/ringing.wav';
async function ensureRingingToneCached() { const cache = await caches.open(CACHE_NAME); const cached = await cache.match(TONE_URL); if(cached) return true; try{ const blob = await generateRingingToneBlob(); const response = new Response(blob, { headers: { 'Content-Type': 'audio/wav' } }); await cache.put(TONE_URL, response); return true; } catch(e){ return false; } }
function generateRingingToneBlob() { return new Promise((resolve) => { const sampleRate = 44100; const duration = 1.2; const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate); const now = offlineCtx.currentTime; const osc1 = offlineCtx.createOscillator(); const gain1 = offlineCtx.createGain(); osc1.connect(gain1); gain1.connect(offlineCtx.destination); osc1.type = 'sine'; osc1.frequency.value = 800; gain1.gain.setValueAtTime(0.3, now); gain1.gain.exponentialRampToValueAtTime(0.0001, now+0.5); osc1.start(now); osc1.stop(now+0.5); const osc2 = offlineCtx.createOscillator(); const gain2 = offlineCtx.createGain(); osc2.connect(gain2); gain2.connect(offlineCtx.destination); osc2.type = 'sine'; osc2.frequency.value = 800; gain2.gain.setValueAtTime(0.3, now+0.7); gain2.gain.exponentialRampToValueAtTime(0.0001, now+1.2); osc2.start(now+0.7); osc2.stop(now+1.2); offlineCtx.startRendering().then(renderedBuffer => resolve(bufferToWav(renderedBuffer))); }); }
function bufferToWav(buffer) { const numChannels = buffer.numberOfChannels; const sampleRate = buffer.sampleRate; const format = 1; const bitDepth = 16; let samples = buffer.getChannelData(0); let dataLength = samples.length * (bitDepth/8); let bufferLength = 44 + dataLength; const arrayBuffer = new ArrayBuffer(bufferLength); const view = new DataView(arrayBuffer); writeString(view,0,'RIFF'); view.setUint32(4,bufferLength-8,true); writeString(view,8,'WAVE'); writeString(view,12,'fmt '); view.setUint32(16,16,true); view.setUint16(20,format,true); view.setUint16(22,numChannels,true); view.setUint32(24,sampleRate,true); view.setUint32(28,sampleRate * numChannels * (bitDepth/8),true); view.setUint16(32,numChannels * (bitDepth/8),true); view.setUint16(34,bitDepth,true); writeString(view,36,'data'); view.setUint32(40,dataLength,true); let offset = 44; for(let i=0;i<samples.length;i++){ const sample = Math.max(-1,Math.min(1,samples[i])); view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true); offset += 2; } return new Blob([view], { type: 'audio/wav' }); }
function writeString(view, offset, str) { for(let i=0;i<str.length;i++) view.setUint8(offset+i, str.charCodeAt(i)); }
async function playRingingTone() { stopRingingTone(); try{ const cache = await caches.open(CACHE_NAME); const cached = await cache.match(TONE_URL); if(cached){ const blob = await cached.blob(); const url = URL.createObjectURL(blob); const audio = new Audio(url); audio.loop = true; audio.play(); currentRingingAudio = audio; return; } } catch(e){} startFallbackRinging(); }
function stopRingingTone() { if(currentRingingAudio){ currentRingingAudio.pause(); currentRingingAudio.src = ''; currentRingingAudio = null; } stopFallbackRinging(); }
let fallbackInterval = null, fallbackCtx = null;
function startFallbackRinging() { stopFallbackRinging(); function beep(){ try{ if(!fallbackCtx || fallbackCtx.state === 'closed') fallbackCtx = new (window.AudioContext || window.webkitAudioContext)(); const ctx = fallbackCtx; const now = ctx.currentTime; const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 800; gain.gain.value = 0.3; osc.type = 'sine'; osc.start(); gain.gain.exponentialRampToValueAtTime(0.0001, now+0.5); osc.stop(now+0.5); if(ctx.state === 'suspended') ctx.resume(); } catch(e){} } beep(); fallbackInterval = setInterval(beep, 800); }
function stopFallbackRinging() { if(fallbackInterval){ clearInterval(fallbackInterval); fallbackInterval = null; } if(fallbackCtx){ try{ fallbackCtx.close(); } catch(e){} fallbackCtx = null; } }
function playNotificationSound() { try{ const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.value = 0.2; osc.type = 'sine'; osc.start(); gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime+0.5); osc.stop(ctx.currentTime+0.5); if(ctx.state === 'suspended') ctx.resume(); } catch(e){} }
function triggerHaptic() { if(navigator.vibrate) navigator.vibrate(200); }

// ══════════════════════════════════════════════════════════════════════════════
// VERPASSTE ANRUFE
// ══════════════════════════════════════════════════════════════════════════════
function getMissed() { return JSON.parse(localStorage.getItem('sm_missed') || '[]'); }
function saveMissed(a) { localStorage.setItem('sm_missed', JSON.stringify(a)); }
async function addMissed(code, name) {
  const arr = getMissed();
  const recent = arr.findIndex(m => m.code === code && Date.now() - m.ts < 60000);
  const entry = { code, name, ts: Date.now() };
  if (recent >= 0) arr[recent] = entry; else arr.unshift(entry);
  saveMissed(arr.slice(0,30));
  renderMissed();
  try {
    await fetch(API_MISSED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: myCode, callerId: code, callerName: name })
    });
  } catch (e) { console.warn('Server missed call sync failed', e); }
}

function renderMissed() {
  const arr = getMissed();
  const sec = document.getElementById('missed-sec');
  const lst = document.getElementById('missed-list');
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(m => {
    // Display-Name: erst Alias aus Kontakten, dann gespeicherter Name, dann Fallback
    const displayName = getContacts()[m.code] || m.name || formatCode(m.code);
    const d = new Date(m.ts);
    const time = d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    return `<div class="chat-card missed-card">
      <div class="card-row">
        <div class="card-avatar">📵</div>
        <div class="card-details">
          <div class="card-name">${esc(displayName)}</div>
          <div class="card-preview">${formatCode(m.code)} · ${time}</div>
        </div>
      </div>
      <button class="call-back-btn" onclick="callBack('${m.code}')">📞 Zurückrufen</button>
    </div>`;
  }).join('');
}

function clearMissed() { saveMissed([]); renderMissed(); }
function callBack(code) {
  const inps = document.querySelectorAll('.dinp-new');
  code.split('').forEach((ch, i) => {
    if (inps[i]) { inps[i].value = ch; inps[i].classList.add('filled'); }
  });
  document.getElementById('cbtn').disabled = false;
  connectToPeer();
  setTimeout(() => {
    inps.forEach(d => { d.value = ''; d.classList.remove('filled'); });
    document.getElementById('cbtn').disabled = true;
  }, 200);
}

async function fetchRemoteMissedCalls() {
  try {
    const res = await fetch(`https://spotme-chat.onrender.com/api/missed-calls/${myCode}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { return []; }
}

// ══════════════════════════════════════════════════════════════════════════════
// KONTAKTE & NAMEN
// ══════════════════════════════════════════════════════════════════════════════
function getContacts() { return JSON.parse(localStorage.getItem('sm_contacts') || '{}'); }
function saveContacts(c) { localStorage.setItem('sm_contacts', JSON.stringify(c)); }
function localName(code, fallback) { return getContacts()[code] || fallback || ('Nutzer_' + code.slice(0,4)); }
function setAlias(code, name) { const c = getContacts(); if(name) c[code] = name; else delete c[code]; saveContacts(c); }

function refreshStatusText() { const statusEl = document.getElementById('pstatus'); if(!statusEl) return; if(partnerTypingTimer !== null){ statusEl.textContent = '✍️ schreibt...'; statusEl.className = 'pstatus'; return; } if(conn && conn.open){ statusEl.textContent = '● Verbunden'; statusEl.className = 'pstatus'; } else { if(document.getElementById('s-chat').classList.contains('active')){ statusEl.textContent = '○ Verbinde...'; statusEl.className = 'pstatus dim'; } else { statusEl.textContent = '○ Verbindung getrennt'; statusEl.className = 'pstatus dim'; } } }

// ══════════════════════════════════════════════════════════════════════════════
// INDEXEDDB – VERSION 3 (Alben & Fotos)
// ══════════════════════════════════════════════════════════════════════════════
let db = null;
const DB_NAME = 'SpotMeDB';
const DB_VERSION = 3;

function initDB() {
  return new Promise((resolve, reject) => {
    if (db && !db.isClosed) return resolve();
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; resolve(); };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('albums')) {
        const albumStore = db.createObjectStore('albums', { autoIncrement: true });
        albumStore.createIndex('by_name', 'name');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { autoIncrement: true });
        photoStore.createIndex('by_album', 'albumId');
      }
    };
  });
}

async function getAllAlbums() {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readonly');
    const store = tx.objectStore('albums');
    const albums = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        albums.push({ id: cursor.key, ...cursor.value });
        cursor.continue();
      } else { resolve(albums); }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function getPhotosByAlbum(albumId) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const index = store.index('by_album');
    const range = IDBKeyRange.only(albumId);
    const photos = [];
    const cursorReq = index.openCursor(range);
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        photos.push({ id: cursor.key, ...cursor.value });
        cursor.continue();
      } else { resolve(photos); }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function createAlbum(name) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');
    const album = { name: name.trim(), createdAt: Date.now(), updatedAt: Date.now() };
    const req = store.add(album);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAlbum(id) {
  await initDB();
  await deletePhotosByAlbum(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(albumId, dataURL, name) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const photo = { albumId, dataURL, name, timestamp: Date.now() };
    const req = store.add(photo);
    req.onsuccess = () => { updateAlbumTimestamp(albumId); resolve(req.result); };
    req.onerror = () => reject(req.error);
  });
}

async function updateAlbumTimestamp(albumId) {
  const tx = db.transaction('albums', 'readwrite');
  const store = tx.objectStore('albums');
  const getReq = store.get(albumId);
  getReq.onsuccess = () => {
    const album = getReq.result;
    if (album) { album.updatedAt = Date.now(); store.put(album, albumId); }
  };
}

async function deletePhotosByAlbum(albumId) {
  const photos = await getPhotosByAlbum(albumId);
  for (const p of photos) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const req = store.delete(p.id);
      req.onsuccess = resolve;
      req.onerror = reject;
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ALBUM-MENÜ & PARTNER-INTERAKTION
// ══════════════════════════════════════════════════════════════════════════════
function showAlbumMenu() {
  if (!conn || !conn.open) { toast('⚠️ Keine aktive Verbindung'); return; }
  const body = document.getElementById('album-menu-body');
  body.innerHTML = `
    <button class="sitem" onclick="window.open('portfolio.html','_blank'); closeAlbumMenu();">
      <div class="sico si-g">📁</div><div class="slab"><div>Meine Alben</div><div class="sdesc">Verwalten & neue Fotos hinzufügen</div></div>
    </button>
    <div class="ssep"></div>
    <button class="sitem" onclick="requestPartnerAlbums(); closeAlbumMenu();">
      <div class="sico si-g">👥</div><div class="slab"><div>Alben von ${partnerName}</div><div class="sdesc">Durchstöbern</div></div>
    </button>
  `;
  document.getElementById('album-menu-ovl').classList.add('open');
  document.getElementById('album-menu-sheet').classList.add('open');
}
function closeAlbumMenu() {
  document.getElementById('album-menu-ovl').classList.remove('open');
  document.getElementById('album-menu-sheet').classList.remove('open');
}
function requestPartnerAlbums() {
  if (!conn || !conn.open) return toast('Keine Verbindung');
  conn.send({ t: 'album_list_request' });
  toast('📡 Fordere Alben an...');
}
let partnerAlbumsList = [];
function showPartnerAlbumsSheet(albums) {
  partnerAlbumsList = albums;
  const title = document.getElementById('partner-albums-title');
  title.textContent = `Alben von ${partnerName}`;
  const body = document.getElementById('partner-albums-body');
  if (!albums.length) {
    body.innerHTML = '<div class="sitem" style="justify-content:center;color:var(--muted);">Keine Alben vorhanden</div>';
  } else {
    body.innerHTML = albums.map(album => `
      <button class="sitem" onclick="selectPartnerAlbum(${album.id})">
        <div class="sico si-g">🖼️</div>
        <div class="slab"><div>${escapeHtml(album.name)}</div><div class="sdesc">${album.photoCount||0} Foto${album.photoCount!==1?'s':''}</div></div>
      </button>
    `).join('');
  }
  document.getElementById('partner-albums-ovl').classList.add('open');
  document.getElementById('partner-albums-sheet').classList.add('open');
}
function closePartnerAlbumsSheet() {
  document.getElementById('partner-albums-ovl').classList.remove('open');
  document.getElementById('partner-albums-sheet').classList.remove('open');
}
function selectPartnerAlbum(albumId) {
  closePartnerAlbumsSheet();
  if (!conn || !conn.open) return toast('Verbindung unterbrochen');
  conn.send({ t: 'album_images_request', albumId });
  toast('📥 Lade Bilder...');
  showImageOverlayLoader();
}
function showImageOverlayLoader() {
  const old = document.getElementById('dynamic-gallery-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.id = 'dynamic-gallery-overlay';
  overlay.innerHTML = `<div class="loading-spinner"></div>`;
  document.body.appendChild(overlay);
}

// ⭐ GALERIE-STEUERUNG
let currentGalleryImages = [];
let currentGalleryIndex = 0;
function buildGallery(images) {
  if (!images.length) return;
  currentGalleryImages = images;
  currentGalleryIndex = 0;
  const overlay = document.getElementById('dynamic-gallery-overlay');
  if (!overlay) return;
  const updateImage = () => {
    const img = currentGalleryImages[currentGalleryIndex];
    overlay.innerHTML = `
      <div class="close-gallery" onclick="closeGallery()">✕</div>
      <div class="gallery-counter">${currentGalleryIndex+1} / ${currentGalleryImages.length}</div>
      <div class="gallery-image-container"><img src="${img.dataURL}" alt="${escapeHtml(img.name)}" id="gallery-main-image"></div>
      <div class="gallery-controls">
        ${currentGalleryImages.length>1?`<button class="gallery-btn" onclick="prevGalleryImage()">◀</button>`:'<div style="width:52px"></div>'}
        <div class="gallery-dots" id="gallery-dots"></div>
        ${currentGalleryImages.length>1?`<button class="gallery-btn" onclick="nextGalleryImage()">▶</button>`:'<div style="width:52px"></div>'}
      </div>
    `;
    const imgEl = document.getElementById('gallery-main-image');
    if (imgEl) {
      let touchStartX = 0;
      imgEl.addEventListener('touchstart', (e) => { touchStartX = e.touches[0].clientX; }, {passive: true});
      imgEl.addEventListener('touchend', (e) => {
        if (!touchStartX) return;
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 50) { if (diff > 0) prevGalleryImage(); else nextGalleryImage(); }
        touchStartX = 0;
      });
    }
    updateDots();
  };
  window.prevGalleryImage = () => { if (currentGalleryIndex > 0) { currentGalleryIndex--; updateImage(); } };
  window.nextGalleryImage = () => { if (currentGalleryIndex < currentGalleryImages.length-1) { currentGalleryIndex++; updateImage(); } };
  window.updateDots = () => {
    const dots = document.getElementById('gallery-dots');
    if (dots) dots.innerHTML = currentGalleryImages.map((_,i)=>`<span class="gallery-dot ${i===currentGalleryIndex?'active':''}" onclick="setGalleryIndex(${i})"></span>`).join('');
  };
  window.setGalleryIndex = (idx) => { currentGalleryIndex = idx; updateImage(); };
  window.closeGallery = () => { overlay.remove(); currentGalleryImages = []; };
  updateImage();
}

// Chunking für Album-Bilder
let pendingAlbumChunks = new Map();
let pendingAlbumMeta = new Map();
function handleAlbumImageChunk(d) {
  const key = `${d.albumId}_${d.photoId}`;
  let entry = pendingAlbumChunks.get(key);
  if (!entry) { entry = { chunks: new Array(d.total), total: d.total, name: d.name, albumId: d.albumId, photoId: d.photoId }; pendingAlbumChunks.set(key, entry); }
  entry.chunks[d.idx] = new Uint8Array(d.chunk);
  if (entry.chunks.every(c=>c!==undefined)) {
    const totalLength = entry.chunks.reduce((s,arr)=>s+arr.length,0);
    const merged = new Uint8Array(totalLength);
    let off=0; for(const arr of entry.chunks) { merged.set(arr,off); off+=arr.length; }
    const dataURL = new TextDecoder().decode(merged);
    pendingAlbumChunks.delete(key);
    let meta = pendingAlbumMeta.get(d.albumId);
    if (!meta) { meta = { expectedCount:0, receivedCount:0, images:[], timeout:null }; pendingAlbumMeta.set(d.albumId, meta); }
    meta.images.push({ dataURL, name: entry.name });
    meta.receivedCount++;
  }
}
function handleAlbumImagesEnd(albumId) {
  const meta = pendingAlbumMeta.get(albumId);
  if (meta) {
    clearTimeout(meta.timeout);
    if (meta.images.length) buildGallery(meta.images);
    else { document.getElementById('dynamic-gallery-overlay')?.remove(); toast('ℹ️ Album enthält keine Bilder'); }
    pendingAlbumMeta.delete(albumId);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// SPRACHNACHRICHTEN
// ══════════════════════════════════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;

function toggleVoiceButton() {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('sm_voice_enabled', voiceEnabled);
  const btn = document.getElementById('voice-btn');
  if (btn) btn.style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon');
  const desc = document.getElementById('voice-toggle-desc');
  if (voiceEnabled) {
    icon.textContent = '🎤';
    desc.textContent = 'Aktiviert · Button in Chatleiste';
  } else {
    icon.textContent = '🔇';
    desc.textContent = 'Deaktiviert · Button ausgeblendet';
  }
  closeSheet();
}

async function toggleVoiceRecording() {
  if (!conn || !conn.open) { toast('⚠️ Keine aktive Verbindung'); return; }
  const btn = document.getElementById('voice-btn');
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];
      mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
      mediaRecorder.onstop = async () => {
        btn.classList.remove('recording');
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        if (blob.size === 0) return;
        const id = Math.random().toString(36).slice(2,10);
        const total = Math.ceil(blob.size / CHUNK);
        conn.send({ t: 'audio-start', id, size: blob.size, total, duration: (Date.now()-recordingStartTime)/1000 });
        const reader = new FileReader();
        let off = 0, idx = 0;
        reader.onload = e => {
          conn.send({ t: 'audio-chunk', id, idx, data: e.target.result });
          off += CHUNK; idx++;
          if (off < blob.size) { reader.readAsArrayBuffer(blob.slice(off, off+CHUNK)); }
          else {
            conn.send({ t: 'audio-end', id });
            toast('🎤 Sprachnachricht gesendet');
            const url = URL.createObjectURL(blob);
            const msg = { t: 'audio', url, duration: (Date.now()-recordingStartTime)/1000, ts: Date.now(), own: true };
            appendMsg(msg); persistMsg(msg);
          }
        };
        reader.readAsArrayBuffer(blob.slice(0, CHUNK));
        stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
      };
      mediaRecorder.start();
      recordingStartTime = Date.now();
      btn.classList.add('recording');
      toast('🎤 Aufnahme läuft...');
    } catch (e) { toast('❌ Mikrofon nicht verfügbar'); }
  } else { mediaRecorder.stop(); }
}

// ══════════════════════════════════════════════════════════════════════════════
// LOCATION FUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════════
function openLocationScreen() {
  if (!conn || !conn.open) { toast('⚠️ Keine aktive Verbindung'); return; }
  showScreen('s-location');
  initLocationMap();
  startLocationSharing();
}

function closeLocationScreen() {
  stopLocationSharing();
  showScreen('s-chat');
}

function initLocationMap() {
  if (locationMap) return;
  locationMap = L.map('location-map').setView([51.1657, 10.4515], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    maxZoom: 19
  }).addTo(locationMap);
  
  myMarker = L.marker([0,0], { icon: blueIcon() }).addTo(locationMap).bindPopup('Ich').openPopup();
  partnerMarker = L.marker([0,0], { icon: greenIcon() }).addTo(locationMap).bindPopup(partnerName || 'Partner');
  
  const slider = document.getElementById('radius-slider');
  slider.addEventListener('input', () => {
    currentRadius = parseInt(slider.value);
    document.getElementById('radius-value').textContent = formatDistance(currentRadius);
    updateDistanceDisplay();
  });
}

function blueIcon() {
  return L.divIcon({ className: 'custom-div-icon', html: '<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #3b82f6;"></div>', iconSize: [22,22], popupAnchor: [0,-11] });
}
function greenIcon() {
  return L.divIcon({ className: 'custom-div-icon', html: '<div style="background:#1ecc68;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 10px #1ecc68;"></div>', iconSize: [22,22], popupAnchor: [0,-11] });
}

function startLocationSharing() {
  if (locationWatchId) return;
  document.getElementById('location-status').textContent = 'Warte auf GPS...';
  if (navigator.geolocation) {
    locationWatchId = navigator.geolocation.watchPosition(
      pos => {
        myPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        updateMyMarker();
        sendLocationUpdate();
        document.getElementById('location-status').textContent = `GPS aktiv (Genauigkeit: ±${Math.round(pos.coords.accuracy)}m)`;
      },
      err => { toast('⚠️ Standort nicht verfügbar'); document.getElementById('location-status').textContent = 'Standortfehler'; },
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
  } else { toast('❌ Geolocation nicht unterstützt'); }
  locationInterval = setInterval(() => { if (myPosition) sendLocationUpdate(); }, 5000);
}

function stopLocationSharing() {
  if (locationWatchId) { navigator.geolocation.clearWatch(locationWatchId); locationWatchId = null; }
  if (locationInterval) { clearInterval(locationInterval); locationInterval = null; }
  myPosition = null;
}

function sendLocationUpdate() {
  if (!conn || !conn.open || !myPosition) return;
  conn.send({ t: 'location_update', lat: myPosition.lat, lng: myPosition.lng, accuracy: myPosition.accuracy });
}

function updateMyMarker() {
  if (!myMarker || !myPosition) return;
  myMarker.setLatLng([myPosition.lat, myPosition.lng]);
  locationMap.setView([myPosition.lat, myPosition.lng], locationMap.getZoom());
  updateDistanceDisplay();
}

function updatePartnerMarker(lat, lng) {
  if (!partnerMarker) return;
  partnerMarker.setLatLng([lat, lng]);
  partnerMarker.getPopup().setContent(partnerName || 'Partner');
  updateDistanceDisplay();
}

function updateDistanceDisplay() {
  const infoEl = document.getElementById('distance-info');
  const statusEl = document.getElementById('location-status-text');
  if (!myPosition || !partnerPosition) {
    infoEl.textContent = 'Warte auf Position des Partners...';
    infoEl.className = 'distance-info';
    statusEl.textContent = '○ Warte auf Partner';
    return;
  }
  const dist = getDistance(myPosition.lat, myPosition.lng, partnerPosition.lat, partnerPosition.lng);
  const inside = dist <= currentRadius;
  infoEl.textContent = `Entfernung: ${formatDistance(dist)} ${inside ? '– Ihr seid im Radius!' : ''}`;
  infoEl.className = 'distance-info' + (inside ? ' inside' : '');
  statusEl.textContent = inside ? '✅ Innerhalb des Radius' : '📍 Außerhalb';
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function formatDistance(m) {
  if (m < 1000) return Math.round(m) + ' m';
  return (m/1000).toFixed(1) + ' km';
}

// ══════════════════════════════════════════════════════════════════════════════
// PEERJS & VERBINDUNG
// ══════════════════════════════════════════════════════════════════════════════
let peerRetries = 0;
function initPeer() {
  if(peer && !peer.destroyed && peer.open) return;
  if(peer && !peer.destroyed) { try { peer.destroy(); } catch(e){} }
  peer = null;
  setSpill('connecting', 'Verbinde mit Server...');
  peer = new Peer(myCode, { host: SERVER_HOST, port: 443, path: SERVER_PATH, secure: true, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] } });
  peer.on('open', () => { peerRetries = 0; setSpill('online', '● ONLINE'); isOffline = false; showCodeCard(true); });
  peer.on('error', err => {
    console.warn('[peer]', err.type, err.message);
    if(err.type === 'unavailable-id') {
      peerRetries++; const delay = Math.min(3000*peerRetries,15000);
      setSpill('connecting', `Code kurz belegt · Neuer Versuch in ${delay/1000}s...`);
      setTimeout(() => { peer = null; initPeer(); }, delay);
      return;
    }
    if(err.type === 'peer-unavailable') {
      if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
      toast('⚠️ Partner nicht erreichbar');
      addMissed(partnerCode, partnerName);
      if (conn) { try{ conn.close(); } catch(e){} conn = null; }
      showLeaveMessageSheet(partnerCode, partnerName);
      return;
    }
    peerRetries++; const delay = Math.min(4000*peerRetries,20000);
    setSpill('offline', `⚠️ Verbindungsfehler · Retry in ${delay/1000}s`);
    setTimeout(() => { peer = null; initPeer(); }, delay);
  });
  peer.on('disconnected', () => { setSpill('connecting', 'Unterbrochen · verbinde erneut...'); setTimeout(() => { peer = null; initPeer(); }, 2500); });
  peer.on('connection', incoming => {
    if(conn && conn.open) { incoming.close(); return; }
    pendingConn = incoming;
    partnerCode = incoming.peer;
    partnerName = localName(incoming.peer, incoming.metadata?.name);
    document.getElementById('in-name').textContent = partnerName;
    document.getElementById('in-code').textContent = 'Code: ' + formatCode(partnerCode);
    showScreen('s-in');
    pushNotif(partnerName, 'möchte mit dir chatten');
    inAppNotif(partnerName, 'Eingehender Chat');
    playRingingTone();
    triggerHaptic();
    incoming.on('close', () => { if(pendingConn === incoming){ stopRingingTone(); addMissed(incoming.peer, localName(incoming.peer, incoming.metadata?.name)); pendingConn = null; showScreen('s-home'); toast('📵 Verpasster Anruf von ' + localName(incoming.peer, incoming.metadata?.name)); } });
  });
}

function acceptCall() { stopRingingTone(); if(!pendingConn){ toast('⚠️ Verbindung nicht mehr verfügbar'); return; } const c = pendingConn; pendingConn = null; partnerCode = c.peer; partnerName = localName(c.peer, c.metadata?.name); chatId = buildCID(myCode, partnerCode); loadPendingMessages(); migratePendingMessages(chatId); openChat(c); }
function declineCall() { stopRingingTone(); if(pendingConn){ const c = pendingConn; pendingConn = null; addMissed(c.peer, localName(c.peer, c.metadata?.name)); try{ c.close(); } catch(e){} } showScreen('s-home'); }

function connectToPeer() {
  const code = getDigits();
  if(code.length !== 6 || code === myCode) return;
  if(!peer || !peer.open){ toast('⚠️ Noch nicht verbunden'); return; }
  if(outgoingCallTimer) clearTimeout(outgoingCallTimer);
  partnerCode = code;
  partnerName = localName(code);
  chatId = buildCID(myCode, code);
  loadPendingMessages();
  migratePendingMessages(chatId);
  const newConn = peer.connect(code, { reliable:true, metadata:{ name: myName } });
  openChat(newConn);
  setSpill('online', `📞 Rufe ${partnerName} an...`);

outgoingCallTimer = setTimeout(() => {
  outgoingCallTimer = null;
  // Nur als verpasst werten, wenn keine aktive Verbindung besteht
  if (!conn || !conn.open) {
    toast('⏰ Keine Antwort');
    addMissed(partnerCode, partnerName);
    if (conn) {
      try { conn.close(); } catch (e) {}
      conn = null;
    }
    showLeaveMessageSheet(partnerCode, partnerName);
  }
  setSpill('online', '● ONLINE');
}, 30000);

}

function showLeaveMessageSheet(code, name) {
  partnerCode = code; partnerName = name;
  document.getElementById('leave-message-input').value = '';
  document.getElementById('leave-message-ovl').classList.add('open');
  document.getElementById('leave-message-sheet').classList.add('open');
  setTimeout(() => document.getElementById('leave-message-input').focus(), 100);
}
function closeLeaveMessageSheet() {
  document.getElementById('leave-message-ovl').classList.remove('open');
  document.getElementById('leave-message-sheet').classList.remove('open');
  showScreen('s-home');
  setSpill('online', '● ONLINE');
}
function submitLeaveMessage() {
  const input = document.getElementById('leave-message-input');
  const text = input.value.trim();
  if (!text) { toast('Bitte eine Nachricht eingeben'); return; }
  const cid = buildCID(myCode, partnerCode);
  const oldChatId = chatId;
  chatId = cid;
  addPendingMessage(text);
  toast(`📨 Nachricht für ${partnerName} hinterlegt`);
  chatId = oldChatId;
  closeLeaveMessageSheet();
  showScreen('s-home');
  setSpill('online', '● ONLINE');
}

function tryReconnect() { if(!partnerCode || !peer || !peer.open) return; document.getElementById('rcbar').classList.remove('show'); toast('↺ Verbinde erneut...'); openChat(peer.connect(partnerCode, { reliable:true, metadata:{ name: myName } })); }

function openChat(c) {
  if(conn && conn !== c) { try{ conn.close(); } catch(e){} }
  conn = c;
  prepChat();
  showScreen('s-chat');
  const onOpen = () => {
    if(outgoingCallTimer){ clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('sbtn').disabled = false;
    document.getElementById('rcbar').classList.remove('show');
    refreshStatusText();
    document.getElementById('pav').className = 'pav';
    const alias = getContacts()[partnerCode];
    const netName = conn.metadata?.name || partnerName;
    if(!alias && netName) partnerName = netName;
    applyPartnerName();
    const h = document.getElementById('ehint');
    if(h) h.innerHTML = `<div class="empty-icon">💬</div><div class="empty-txt" style="font-weight:600;color:var(--text)">Verbunden!</div><div class="empty-hint">🔒 P2P · Ende-zu-Ende verschlüsselt</div>`;
    updateIdx('');
    toast('✓ Verbunden');
    flushPendingMessages();
    setSpill('online', '● ONLINE');
  };
  if(conn.open) onOpen();
  else conn.on('open', onOpen);
  conn.on('data', d => handleData(d));
  conn.on('close', () => {
    if(outgoingCallTimer){ clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    conn = null;
    if(partnerTypingTimer){ clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
    if(typingStarted){ typingStarted = false; if(typingDebounceTimer) clearTimeout(typingDebounceTimer); }
    document.getElementById('sbtn').disabled = true;
    refreshStatusText();
    document.getElementById('pav').className = 'pav offline';
    if(document.getElementById('s-chat').classList.contains('active')){
      document.getElementById('rcbar').classList.add('show');
      toast('○ Partner hat den Chat verlassen');
    }
  });
  conn.on('error', err => {
    console.warn('[conn]', err);
    if(outgoingCallTimer){ clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('rcbar').classList.add('show');
  });
}

function prepChat() {
  const alias = getContacts()[partnerCode]; if(alias) partnerName = alias;
  applyPartnerName();
  if(partnerTypingTimer){ clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
  if(typingStarted){ typingStarted = false; if(typingDebounceTimer) clearTimeout(typingDebounceTimer); }
  refreshStatusText();
  document.getElementById('pav').className = 'pav offline';
  document.getElementById('sbtn').disabled = true;
  document.getElementById('rcbar').classList.remove('show');
  document.getElementById('messages').innerHTML = `<div class="empty-chat" id="ehint"><div class="empty-icon">💬</div><div class="empty-txt">Verbindung wird aufgebaut...</div><div class="empty-hint"><span class="spin"></span></div></div>`;
  lastDate = null;
  loadHistory();
  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
}

// ══════════════════════════════════════════════════════════════════════════════
// NACHRICHTEN & DATEIEN
// ══════════════════════════════════════════════════════════════════════════════
function sendMsg() { const inp = document.getElementById('minp'); const text = inp.value.trim(); if(!text) return; if(!conn || !conn.open){ if(!chatId){ toast('⚠️ Bitte zuerst eine Verbindung aufbauen'); return; } addPendingMessage(text); toast(`📦 Nachricht in Warteschlange (${pendingMessages.length})`); inp.value = ''; inp.style.height = 'auto'; return; } if(typingStarted){ conn.send({ t:'typing', state:'end' }); if(typingDebounceTimer) clearTimeout(typingDebounceTimer); typingStarted = false; } const m = { t:'text', text, ts:Date.now() }; conn.send(m); appendMsg({ ...m, own:true }); persistMsg({ ...m, own:true }); inp.value = ''; inp.style.height = 'auto'; }

async function sendFile(inp) {
  const f = inp.files[0]; inp.value = '';
  if (!f) return;
  if (!conn || !conn.open) { toast('⚠️ Dateiübertragung nur bei aktiver Verbindung möglich'); return; }
  if (f.size > 100*1024*1024) { toast('⚠️ Max. 100 MB'); return; }
  if (typingStarted) { conn.send({ t:'typing', state:'end' }); if(typingDebounceTimer) clearTimeout(typingDebounceTimer); typingStarted = false; }
  const id = Math.random().toString(36).slice(2,10);
  const total = Math.ceil(f.size / CHUNK);
  conn.send({ t:'f-start', id, name:f.name, type:f.type, size:f.size, total });
  showUP(true);
  toast(`📤 Sende "${f.name}"...`);
  const reader = new FileReader();
  let off = 0, idx = 0;
  reader.onload = async e => {
    conn.send({ t:'f-chunk', id, idx, data:e.target.result });
    off += CHUNK; idx++;
    document.getElementById('upb').style.width = Math.floor((idx/total)*100) + '%';
    if (off < f.size) {
      if (idx % 10 === 0) await new Promise(r => setTimeout(r, 20));
      reader.readAsArrayBuffer(f.slice(off, off+CHUNK));
    } else {
      conn.send({ t:'f-end', id });
      showUP(false);
      toast(`✅ "${f.name}" gesendet!`);
      const url = await fileToB64(f);
      const msg = { t:'file', url, name:f.name, ftype:f.type, size:f.size, ts:Date.now(), own:true };
      appendMsg(msg); persistMsg(msg);
    }
  };
  reader.readAsArrayBuffer(f.slice(0, CHUNK));
}
function showUP(v) { document.getElementById('upw').style.opacity = v ? '1' : '0'; if(!v) setTimeout(()=>{ document.getElementById('upb').style.width = '0%'; },400); }
function fileToB64(f) { return new Promise(r => { const rd = new FileReader(); rd.onload = () => r(rd.result); rd.readAsDataURL(f); }); }

function handleData(d) {
  if(d.t === 'text') {
    const m = { ...d, own:false };
    appendMsg(m); persistMsg(m); notify(d.text); playNotificationSound(); triggerHaptic();
  } else if(d.t === 'typing') {
    if(d.state === 'start') { if(partnerTypingTimer) clearTimeout(partnerTypingTimer); partnerTypingTimer = setTimeout(()=>{ partnerTypingTimer = null; refreshStatusText(); },5000); refreshStatusText(); }
    else if(d.state === 'end') { if(partnerTypingTimer) clearTimeout(partnerTypingTimer); partnerTypingTimer = null; refreshStatusText(); }
  } else if(d.t === 'f-start') { fileBufs[d.id] = { meta:d, chunks: new Array(d.total).fill(null) }; toast(`📥 Empfange "${d.name}"...`); }
  else if(d.t === 'f-chunk') { const b = fileBufs[d.id]; if(b) b.chunks[d.idx] = d.data; }
  else if(d.t === 'f-end') { const b = fileBufs[d.id]; if(!b) return; const valid = b.chunks.filter(c=>c!==null); if(valid.length !== b.meta.total){ toast('❌ Übertragungsfehler'); return; } const blob = new Blob(valid, { type:b.meta.type }); const rd = new FileReader(); rd.onload = e => { const msg = { t:'file', url:e.target.result, name:b.meta.name, ftype:b.meta.type, size:b.meta.size, ts:Date.now(), own:false }; appendMsg(msg); persistMsg(msg); notify('📎 Datei: ' + b.meta.name); playNotificationSound(); triggerHaptic(); delete fileBufs[d.id]; }; rd.readAsDataURL(blob); }
  else if (d.t === 'audio-start') {
    fileBufs[d.id] = { meta: d, chunks: new Array(d.total).fill(null) };
    toast(`🎤 Empfange Sprachnachricht (${d.duration.toFixed(1)}s)...`);
  }
  else if (d.t === 'audio-chunk') { const b = fileBufs[d.id]; if(b) b.chunks[d.idx] = d.data; }
  else if (d.t === 'audio-end') {
    const b = fileBufs[d.id]; if(!b) return;
    const valid = b.chunks.filter(c=>c!==null);
    if(valid.length !== b.meta.total){ toast('❌ Übertragungsfehler'); return; }
    const blob = new Blob(valid, { type: 'audio/webm' });
    const url = URL.createObjectURL(blob);
    const msg = { t: 'audio', url, duration: b.meta.duration, ts: Date.now(), own: false };
    appendMsg(msg); persistMsg(msg);
    notify('🎤 Sprachnachricht'); playNotificationSound(); triggerHaptic();
    delete fileBufs[d.id];
  }
  else if (d.t === 'location_update') {
    partnerPosition = { lat: d.lat, lng: d.lng, accuracy: d.accuracy };
    updatePartnerMarker(d.lat, d.lng);
    document.getElementById('location-status-text').textContent = '📍 Partner online';
    updateDistanceDisplay();
  }
  else if (d.t === 'album_list_request') {
    getAllAlbums().then(async albums => {
      const list = [];
      for (const album of albums) { const photos = await getPhotosByAlbum(album.id); list.push({ id: album.id, name: album.name, photoCount: photos.length }); }
      if (conn && conn.open) conn.send({ t: 'album_list_response', list });
    }).catch(e => console.warn(e));
  }
  else if (d.t === 'album_list_response') {
    const albums = d.list || [];
    if (albums.length) showPartnerAlbumsSheet(albums); else toast('ℹ️ Partner hat keine Alben');
  }
  else if (d.t === 'album_images_request') {
    const albumId = d.albumId;
    getPhotosByAlbum(albumId).then(photos => {
      conn.send({ t: 'album_images_meta', albumId, total: photos.length });
      for (const photo of photos) {
        const bytes = new TextEncoder().encode(photo.dataURL);
        const totalChunks = Math.ceil(bytes.length / CHUNK);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = bytes.slice(i*CHUNK, Math.min((i+1)*CHUNK, bytes.length)).buffer;
          conn.send({ t:'album_image_chunk', albumId, photoId:photo.id, idx:i, total:totalChunks, chunk, name:photo.name });
        }
      }
      conn.send({ t: 'album_images_end', albumId });
    }).catch(e => console.warn(e));
  }
  else if (d.t === 'album_images_meta') {
    let meta = pendingAlbumMeta.get(d.albumId);
    if (!meta) { meta = { expectedCount: d.total, receivedCount:0, images:[], timeout:null }; pendingAlbumMeta.set(d.albumId, meta); }
    else meta.expectedCount = d.total;
    if (meta.timeout) clearTimeout(meta.timeout);
    meta.timeout = setTimeout(() => {
      if (meta.images.length) buildGallery(meta.images);
      else { document.getElementById('dynamic-gallery-overlay')?.remove(); toast('⚠️ Übertragung unvollständig'); }
      pendingAlbumMeta.delete(d.albumId);
    }, 20000);
  }
  else if (d.t === 'album_image_chunk') handleAlbumImageChunk(d);
  else if (d.t === 'album_images_end') handleAlbumImagesEnd(d.albumId);
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT-VERLAUF & UI-HILFEN
// ══════════════════════════════════════════════════════════════════════════════
function appendMsg(m) {
  const list = document.getElementById('messages');
  const hint = document.getElementById('ehint');
  if(hint && !hint.querySelector('.spin')) hint.remove();
  const d = new Date(m.ts);
  const ds = d.toLocaleDateString('de-DE', { weekday:'long', day:'2-digit', month:'long' });
  const ts = d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
  if(ds !== lastDate){ lastDate = ds; const sep = document.createElement('div'); sep.className = 'date-sep'; sep.textContent = ds; list.appendChild(sep); }
  const w = document.createElement('div');
  w.className = 'msg ' + (m.own ? 'msg-o' : 'msg-i');
  
  if(m.t === 'text'){
    w.innerHTML = `<div class="bubble"><div class="btxt">${esc(m.text)}</div><div class="btime">${ts}${m.own?' ✓✓':''}</div></div>`;
  } else if(m.t === 'file'){
    const isImg = m.ftype && m.ftype.startsWith('image/');
    if(isImg){
      w.innerHTML = `<div class="imgbbl" onclick="bigImg('${m.url}')"><img src="${m.url}" loading="lazy"></div><div class="btime">${ts}${m.own?' ✓✓':''}</div>`;
    } else {
      const icon = m.ftype?.includes('pdf')?'📕':m.ftype?.includes('zip')?'🗜️':m.ftype?.includes('video')?'🎥':'📄';
      const sz = m.size>1048576?(m.size/1048576).toFixed(1)+' MB':Math.round(m.size/1024)+' KB';
      w.innerHTML = `<a class="filbbl" href="${m.url}" download="${esc(m.name)}"><span style="font-size:1.4rem">${icon}</span><div><div class="fnam">${esc(m.name)}</div><div class="fsiz">${sz} · Tippen zum Speichern</div></div></a><div class="btime">${ts}${m.own?' ✓✓':''}</div>`;
    }
  } else if(m.t === 'audio'){
    const duration = m.duration || 0;
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    const durationStr = `${mins}:${secs.toString().padStart(2,'0')}`;
    w.innerHTML = `
      <div class="audio-player" data-url="${m.url}">
        <button class="audio-play-btn" onclick="toggleAudioPlay(this)">▶</button>
        <div class="audio-wave" id="wave-${m.ts}"></div>
        <span class="audio-duration">${durationStr}</span>
      </div>
      <div class="btime">${ts}${m.own?' ✓✓':''}</div>
    `;
    setTimeout(() => initAudioPlayer(w.querySelector('.audio-player'), m.url), 10);
  }
  list.appendChild(w);
  list.scrollTop = list.scrollHeight;
}

window.toggleAudioPlay = function(btn) {
  const player = btn.closest('.audio-player');
  const audio = player._audio;
  if (!audio) {
    const url = player.dataset.url;
    const newAudio = new Audio(url);
    player._audio = newAudio;
    newAudio.onplay = () => btn.textContent = '⏸';
    newAudio.onpause = () => btn.textContent = '▶';
    newAudio.onended = () => btn.textContent = '▶';
    newAudio.onerror = () => toast('❌ Audio konnte nicht geladen werden');
    newAudio.play();
    return;
  }
  if (audio.paused) audio.play();
  else audio.pause();
};

function initAudioPlayer(player, url) {
  if (player._audio) return;
  const audio = new Audio(url);
  player._audio = audio;
  const btn = player.querySelector('.audio-play-btn');
  audio.onplay = () => btn.textContent = '⏸';
  audio.onpause = () => btn.textContent = '▶';
  audio.onended = () => btn.textContent = '▶';
  const wave = player.querySelector('.audio-wave');
  if (wave) wave.innerHTML = Array.from({length:12}, () => `<div class="audio-wave-bar" style="height:${Math.floor(Math.random()*20+4)}px"></div>`).join('');
}

function bigImg(url) { const w = window.open(); w.document.write(`<style>body{margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;max-height:100vh}</style><img src="${url}">`); }

function buildCID(a,b) { return 'sm_' + [a,b].sort().join('_'); }
function persistMsg(m) { if(!chatId) return; const k = 'smmsg_' + chatId; const arr = JSON.parse(localStorage.getItem(k) || '[]'); arr.push(m); if(arr.length > 200) arr.splice(0, arr.length-200); localStorage.setItem(k, JSON.stringify(arr)); updateIdx(m.text || (m.t==='audio'?'🎤 Sprachnachricht':'📎 ' + (m.name||''))); }
function loadHistory() { if(!chatId) return; lastDate = null; const h = document.getElementById('ehint'); if(h) h.remove(); JSON.parse(localStorage.getItem('smmsg_' + chatId) || '[]').forEach(m => appendMsg(m)); }
function updateIdx(preview) { if(!chatId) return; const k = 'sm_idx'; const arr = JSON.parse(localStorage.getItem(k) || '[]'); const i = arr.findIndex(x => x.id === chatId); const e = { id:chatId, partner:partnerName, code:partnerCode, ts:Date.now(), preview }; if(i >= 0) arr[i] = e; else arr.unshift(e); localStorage.setItem(k, JSON.stringify(arr.slice(0,15))); renderPrev(); }
function applyPartnerName() { const alias = getContacts()[partnerCode]; const display = alias || partnerName; const lbl = document.getElementById('pname'); if(!lbl) return; if(alias && partnerName && alias !== partnerName){ lbl.innerHTML = esc(alias) + `<span class="alias-badge" title="Netzwerkname: ${esc(partnerName)}">✏️</span>`; } else { lbl.textContent = display; } }
function renamePartner() { closeSheet(); const current = getContacts()[partnerCode] || ''; const input = prompt(`Spitzname für diesen Kontakt:\n(leer lassen zum Zurücksetzen)`, current); if(input === null) return; const trimmed = input.trim(); setAlias(partnerCode, trimmed); if(trimmed) partnerName = trimmed; applyPartnerName(); updateIdx(''); renderPrev(); toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt'); }
function renderPrev() {
  const arr = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const sec = document.getElementById('psec');
  const lst = document.getElementById('plist');
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(c => {
    const alias = getContacts()[c.code] || c.partner;
    const preview = c.preview || '—';
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${c.id}')">
      <div class="card-row">
        <div class="card-avatar">🧑</div>
        <div class="card-details">
          <div class="card-name">${esc(alias)}</div>
          <div class="card-preview">${esc(preview)}</div>
        </div>
      </div>
      <div class="card-meta">
        <span class="card-time">${timeAgo(c.ts)}</span>
        <span class="card-code">${formatCode(c.code)}</span>
      </div>
    </div>`;
  }).join('');
}
function renameContact(code, networkName) { const current = getContacts()[code] || ''; const input = prompt(`Spitzname für ${networkName || formatCode(code)}:\n(leer lassen zum Zurücksetzen)`, current); if(input === null) return; const trimmed = input.trim(); setAlias(code, trimmed); renderPrev(); toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt'); }
function reconnectTo(code, name, cid) { if(!peer || !peer.open){ toast('⚠️ Warte auf Server...'); return; } partnerCode = code; partnerName = name; chatId = cid; loadPendingMessages(); migratePendingMessages(chatId); openChat(peer.connect(code, { reliable:true, metadata:{ name: myName } })); }
function exportChat() { closeSheet(); if(!chatId){ toast('⚠️ Kein aktiver Chat'); return; } const msgs = JSON.parse(localStorage.getItem('smmsg_' + chatId) || '[]'); const blob = new Blob([JSON.stringify({ partner:partnerName, code:partnerCode, chatId, messages:msgs }, null, 2)], { type:'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SpotMe_${partnerName}_${new Date().toISOString().slice(0,10)}.json`; a.click(); toast('💾 Backup exportiert'); }
function triggerImport() { closeSheet(); document.getElementById('fimp').value=''; document.getElementById('fimp').click(); }
function importChat(inp) { if(!inp.files[0]) return; const rd = new FileReader(); rd.onload = e => { try { const d = JSON.parse(e.target.result); if(!d.messages){ toast('❌ Keine Nachrichten gefunden'); return; } if(chatId){ localStorage.setItem('smmsg_' + chatId, JSON.stringify(d.messages)); document.getElementById('messages').innerHTML = ''; lastDate = null; loadHistory(); toast('📂 Backup importiert'); } } catch { toast('❌ Ungültige Datei'); } }; rd.readAsText(inp.files[0]); inp.value = ''; }
function clearChat() { if(!confirm('Verlauf auf diesem Gerät löschen?')) return; if(!chatId) return; localStorage.removeItem('smmsg_' + chatId); const idx = JSON.parse(localStorage.getItem('sm_idx') || '[]'); localStorage.setItem('sm_idx', JSON.stringify(idx.filter(c => c.id !== chatId))); document.getElementById('messages').innerHTML = '<div class="empty-chat"><div class="empty-icon">🗑️</div><div class="empty-txt">Verlauf gelöscht.</div></div>'; lastDate = null; renderPrev(); toast('🗑️ Verlauf gelöscht'); }
function notify(text) { const onChat = document.getElementById('s-chat').classList.contains('active'); if(!onChat || document.hidden){ inAppNotif(partnerName, text); pushNotif(partnerName, text); } }
function pushNotif(from, text) { if(Notification.permission !== 'granted') return; try { const n = new Notification('💬 ' + from, { body:text.length>80?text.slice(0,80)+'…':text, tag:'spotme', renotify:true }); n.onclick = () => { window.focus(); switchToChat(); n.close(); }; setTimeout(() => n.close(), 6000); } catch(e){} }
let inTimer = null;
function inAppNotif(from, text) { document.getElementById('in-from').textContent = '💬 ' + from; document.getElementById('in-msg').textContent = text.length > 60 ? text.slice(0,60)+'…' : text; const el = document.getElementById('in-notif'); el.classList.add('show'); clearTimeout(inTimer); inTimer = setTimeout(() => el.classList.remove('show'), 5000); }
function switchToChat() { document.getElementById('in-notif').classList.remove('show'); showScreen('s-chat'); }
function initDigits() {
  const inps = document.querySelectorAll('.dinp-new');
  inps.forEach((p, i) => {
    p.addEventListener('input', () => {
      const v = p.value.replace(/\D/g, '');
      p.value = v ? v.slice(-1) : '';
      p.classList.toggle('filled', !!p.value);
      if (p.value && i < 5) inps[i + 1].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
    p.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !p.value && i > 0) {
        inps[i - 1].value = '';
        inps[i - 1].classList.remove('filled');
        inps[i - 1].focus();
        document.getElementById('cbtn').disabled = true;
      }
    });
    p.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      txt.split('').forEach((ch, j) => {
        if (inps[i + j]) {
          inps[i + j].value = ch;
          inps[i + j].classList.add('filled');
        }
      });
      inps[Math.min(i + txt.length, 5)].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
  });
}
function getDigits() { return [...document.querySelectorAll('.dinp-new')].map(x => x.value).join(''); }
function showScreen(id) { document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); document.getElementById(id).classList.add('active'); document.getElementById('in-notif').classList.remove('show'); }
function setSpill(type, text) {
  const badge = document.getElementById('header-status');
  if (!badge) return;
  badge.textContent = text;
  badge.className = 'status-badge';
  if (type === 'offline') badge.classList.add('offline');
}
function openSheet() { document.getElementById('sovl').classList.add('open'); document.getElementById('sheet').classList.add('open'); }
function closeSheet() { document.getElementById('sovl').classList.remove('open'); document.getElementById('sheet').classList.remove('open'); }
function goHome() {
  stopRingingTone();
  if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
  if (conn) { try { conn.close(); } catch (e) {} conn = null; }
  if (partnerTypingTimer) { clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
  if (typingStarted) { typingStarted = false; if (typingDebounceTimer) clearTimeout(typingDebounceTimer); }
  pendingConn = null;
  lastDate = null;
  document.querySelectorAll('.dinp-new').forEach(d => { d.value = ''; d.classList.remove('filled'); });
  document.getElementById('cbtn').disabled = true;
  closeSheet();
  showScreen('s-home');
  renderPrev();
  setSpill('online', '● ONLINE');
}
function hkey(e) { if(e.key === 'Enter' && !e.shiftKey){ e.preventDefault(); sendMsg(); } }
function autoH(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }
function esc(s) { const d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
function esc2(s) { return s.replace(/'/g,"\\'"); }
function formatCode(c) { return c.slice(0,3)+' · '+c.slice(3,6); }
function copyCode() { navigator.clipboard.writeText(myCode).then(()=>toast('✅ Code kopiert')).catch(()=>toast('Code: '+myCode)); }
function shareCode() { if(navigator.share) navigator.share({ title:'SpotMe', text:`Mein Code: ${formatCode(myCode)} – schreib mir!` }); else copyCode(); }
function escapeHtml(s) { return esc(s); }
function toggleHomeMenu(e) { e.stopPropagation(); document.getElementById('home-drop').classList.toggle('open'); }
function closeHomeMenu() { document.getElementById('home-drop').classList.remove('open'); }
function goOffline() { if(!confirm('Verbindung zum Server trennen?')) return; if(conn){ try{ conn.close(); } catch(e){} conn = null; } if(peer){ try{ peer.destroy(); } catch(e){} peer = null; } isOffline = true; showCodeCard(false); setSpill('offline', '○ OFFLINE'); showScreen('s-home'); }
function showCodeCard(show) {
  const card = document.querySelector('.code-card-new');
  if (card) card.style.display = show ? '' : 'none';
  if (!show) {
    setSpill('offline', '○ OFFLINE');
  } else {
    setSpill('online', '● ONLINE');
  }
}
function timeAgo(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 2) return 'gerade';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.floor(h / 24)} Tag${Math.floor(h / 24) > 1 ? 'en' : ''}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// VERSCHLÜSSELTES BACKUP
// ══════════════════════════════════════════════════════════════════════════════
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

async function encryptData(text, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  
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
  
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function restoreProfile(input) {
  closeHomeMenu();
  if (!input.files[0]) return;
  pendingRestoreFile = input.files[0];
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const raw = e.target.result;
      const json = JSON.parse(raw);
      if (!json._spotme_backup) { toast('❌ Keine SpotMe-Backup-Datei'); pendingRestoreFile = null; return; }
      
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
  if (!password) { toast('Bitte Passwort eingeben'); return; }
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
    let codeDisplay='unbekannt', nameDisplay='unbekannt';
    try { codeDisplay = backupData.localStorage?.sm_code ? formatCode(JSON.parse(backupData.localStorage.sm_code)) : 'unbekannt'; } catch {}
    try { nameDisplay = backupData.localStorage?.sm_name ? JSON.parse(backupData.localStorage.sm_name) : 'unbekannt'; } catch {}
    if (!confirm(`Backup wiederherstellen?\n\nCode: ${codeDisplay}\nName: ${nameDisplay}\nAlben: ${backupData.indexedDB?.albums?.length||0}, Fotos: ${backupData.indexedDB?.photos?.length||0}\nChats: ${Object.keys(backupData.chatMessages||{}).length}\nDatum: ${backupData._date?.slice(0,10)||'?'}\n\n⚠️ Alle aktuellen Daten werden überschrieben!`)) return;

    toast('🔄 Stelle Backup wieder her...');
    
    const keysToClear = [];
    for (let i=0; i<localStorage.length; i++) { const key=localStorage.key(i); if (key&&(key.startsWith('sm_')||key.startsWith('smmsg_')||key.startsWith('sm_pending_'))) keysToClear.push(key); }
    keysToClear.forEach(k=>localStorage.removeItem(k));
    
    if (backupData.localStorage) Object.entries(backupData.localStorage).forEach(([k,v])=>localStorage.setItem(k,v));
    if (backupData.chatMessages) Object.entries(backupData.chatMessages).forEach(([k,v])=>localStorage.setItem(k,v));
    
    await initDB();
    const oldAlbums = await getAllAlbums();
    for (const a of oldAlbums) await deleteAlbum(a.id);
    
    const albumIdMap = new Map();
    if (backupData.indexedDB?.albums) for (const a of backupData.indexedDB.albums) { const id = await createAlbum(a.name); albumIdMap.set(a.name, id); }
    if (backupData.indexedDB?.photos) for (const p of backupData.indexedDB.photos) { const aid = albumIdMap.get(p.albumName); if (aid) await addPhoto(aid, p.dataURL, p.name); }
    
    toast('✅ Backup wiederhergestellt · Neustart...');
    setTimeout(()=>location.reload(),2000);
  } catch (ex) { toast('❌ Fehler: ' + ex.message); }
}

let tTimer = null;
function toast(msg, ms=2400) { const ex = document.querySelector('.toast'); if(ex) ex.remove(); const t = document.createElement('div'); t.className='toast'; t.textContent=msg; document.body.appendChild(t); requestAnimationFrame(()=>requestAnimationFrame(()=>t.classList.add('show'))); clearTimeout(tTimer); tTimer = setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(),300); }, ms); }

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  document.getElementById('mycode').textContent = myCode.slice(0,3) + ' · ' + myCode.slice(3,6);
  initDigits(); renderPrev(); renderMissed(); initPeer(); initDB(); ensureRingingToneCached();
  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon'), desc = document.getElementById('voice-toggle-desc');
  if (voiceEnabled) { icon.textContent = '🎤'; desc.textContent = 'Aktiviert · Button in Chatleiste'; }
  else { icon.textContent = '🔇'; desc.textContent = 'Deaktiviert · Button ausgeblendet'; }
  if('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  window.addEventListener('online', () => { if(!peer || peer.destroyed) initPeer(); });
  window.addEventListener('offline', () => setSpill('offline', '○ OFFLINE'));
  document.addEventListener('click', e => { if(!e.target.closest('.home-drop') && !e.target.closest('.home-menu-btn')) closeHomeMenu(); });
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  const textarea = document.getElementById('minp');
  if(textarea) textarea.addEventListener('input', () => { if(!conn||!conn.open) return; if(typingDebounceTimer) clearTimeout(typingDebounceTimer); if(!typingStarted){ conn.send({t:'typing',state:'start'}); typingStarted=true; } typingDebounceTimer = setTimeout(()=>{ if(conn&&conn.open&&typingStarted){ conn.send({t:'typing',state:'end'}); typingStarted=false; } typingDebounceTimer=null; },2000); });
  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if(autoConnect && peer) { sessionStorage.removeItem('sm_connect_to'); setTimeout(()=>{ const inps=document.querySelectorAll('.dinp-new'); autoConnect.split('').forEach((ch,i)=>{ if(inps[i]){ inps[i].value=ch; inps[i].classList.add('filled'); } }); document.getElementById('cbtn').disabled=false; connectToPeer(); },1500); }

  setTimeout(async () => {
    const remoteMissed = await fetchRemoteMissedCalls();
    const localMissed = getMissed();
    for (const call of remoteMissed) {
      const exists = localMissed.some(m => 
        m.code === call.callerId && 
        Math.abs(m.ts - new Date(call.timestamp).getTime()) < 300000
      );
      if (!exists) {
        addMissed(call.callerId, call.callerName);
      }
    }
  }, 2000);
});