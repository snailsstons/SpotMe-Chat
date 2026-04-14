'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// KONFIGURATION & GLOBALE VARIABLEN
// ══════════════════════════════════════════════════════════════════════════════
const SERVER_HOST = 'spotme-pg-test.onrender.com';
const SERVER_PATH = '/peerjs';
const API_MISSED  = 'https://spotme-pg-test.onrender.com/api/missed-call';
const API_BASE    = 'https://spotme-pg-test.onrender.com/api';
const TOKEN_KEY   = 'sm_token';
let   myToken     = localStorage.getItem(TOKEN_KEY) || '';
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

// Local‑First Heartbeat Timer
let heartbeatInterval = null;

localStorage.setItem('sm_code', myCode);
localStorage.setItem('sm_name', myName);

// ══════════════════════════════════════════════════════════════════════════════
// STATUS & LOCAL‑FIRST UI
// ══════════════════════════════════════════════════════════════════════════════
function updateConnectionStatus() {
  const online = peer && peer.open && !isOffline;
  const badge = document.getElementById('header-status');
  const banner = document.getElementById('local-mode-banner');
  
  if (!badge) return;
  
  if (online) {
    badge.innerHTML = '● ONLINE';
    badge.className = 'status-badge online';
    if (banner) banner.style.display = 'none';
  } else {
    badge.innerHTML = '○ LOCAL';
    badge.className = 'status-badge local';
    if (banner) banner.style.display = 'block';
  }
  
  // Aktualisiere auch den Status im Chat
  refreshStatusText();
}

function showLocalModeHint() {
  const banner = document.getElementById('local-mode-banner');
  if (banner) banner.style.display = isOffline || !peer?.open ? 'block' : 'none';
}

// Heartbeat – hält Server wach und verlängert Sichtbarkeit
function startHeartbeat() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  heartbeatInterval = setInterval(async () => {
    if (!myCode) return;
    try {
      await fetch(`${API_BASE}/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: myCode })
      });
      console.debug('🫀 Heartbeat gesendet');
    } catch (e) { /* stiller Fehler */ }
  }, 600000); // alle 10 Minuten
}

// ══════════════════════════════════════════════════════════════════════════════
// PENDING MESSAGES (Warteschlange für Local‑Modus)
// ══════════════════════════════════════════════════════════════════════════════
function getPendingStorageKey() { return chatId ? 'sm_pending_' + chatId : 'sm_pending_temp'; }
function loadPendingMessages() {
  const key = getPendingStorageKey();
  const stored = localStorage.getItem(key);
  try { pendingMessages = stored ? JSON.parse(stored) : []; } catch(e){ pendingMessages = []; }
  updatePendingBadge();
}
function savePendingMessages() {
  const key = getPendingStorageKey();
  if(pendingMessages.length === 0) localStorage.removeItem(key);
  else localStorage.setItem(key, JSON.stringify(pendingMessages));
}
function addPendingMessage(text) {
  pendingMessages.push({ text, ts: Date.now() });
  savePendingMessages();
  updatePendingBadge();
  toast(`📦 Nachricht gespeichert (${pendingMessages.length} in Warteschlange)`);
}
function clearPendingMessages() {
  pendingMessages = [];
  const key = getPendingStorageKey();
  localStorage.removeItem(key);
  updatePendingBadge();
}
function updatePendingBadge() {
  const btn = document.getElementById('sbtn');
  if(!btn) return;
  const count = pendingMessages.length;
  if(count > 0) {
    btn.style.position = 'relative';
    let badge = document.getElementById('pending-badge');
    if(!badge) {
      badge = document.createElement('span');
      badge.id = 'pending-badge';
      badge.style.position = 'absolute';
      badge.style.top = '-8px';
      badge.style.right = '-8px';
      badge.style.backgroundColor = 'var(--p3)';
      badge.style.color = 'white';
      badge.style.borderRadius = '12px';
      badge.style.padding = '2px 6px';
      badge.style.fontSize = '11px';
      badge.style.fontWeight = 'bold';
      btn.appendChild(badge);
    }
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'block';
  } else {
    const badge = document.getElementById('pending-badge');
    if(badge) badge.style.display = 'none';
  }
}
function flushPendingMessages() {
  if(!conn || !conn.open) return;
  if(pendingMessages.length === 0) return;
  const toSend = [...pendingMessages];
  clearPendingMessages();
  for(let msg of toSend){
    const m = { t:'text', text: msg.text, ts: msg.ts };
    conn.send(m);
    appendMsg({ ...m, own: true });
    persistMsg({ ...m, own: true });
  }
  toast(`📨 ${toSend.length} ${toSend.length===1?'Nachricht':'Nachrichten'} gesendet`);
}
function migratePendingMessages(newChatId) {
  const oldKey = 'sm_pending_temp';
  const stored = localStorage.getItem(oldKey);
  if(stored){
    try{
      const tempMsgs = JSON.parse(stored);
      if(tempMsgs.length > 0){
        pendingMessages = tempMsgs;
        savePendingMessages();
        localStorage.removeItem(oldKey);
        updatePendingBadge();
      }
    } catch(e){}
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIO & HAPTIK (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
const CACHE_NAME = 'spotme-sounds';
const TONE_URL = '/sounds/ringing.wav';
async function ensureRingingToneCached() { /* ... unverändert ... */ }
function generateRingingToneBlob() { /* ... unverändert ... */ }
function bufferToWav(buffer) { /* ... unverändert ... */ }
function writeString(view, offset, str) { /* ... unverändert ... */ }
async function playRingingTone() { /* ... unverändert ... */ }
function stopRingingTone() { /* ... unverändert ... */ }
let fallbackInterval = null, fallbackCtx = null;
function startFallbackRinging() { /* ... unverändert ... */ }
function stopFallbackRinging() { /* ... unverändert ... */ }
function playNotificationSound() { /* ... unverändert ... */ }
function triggerHaptic() { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// VERPASSTE ANRUFE & OFFLINE-NACHRICHTEN (angepasst für Local‑First)
// ══════════════════════════════════════════════════════════════════════════════
function getMissed() { return JSON.parse(localStorage.getItem('sm_missed') || '[]'); }
function saveMissed(a) { localStorage.setItem('sm_missed', JSON.stringify(a)); }
async function addMissed(code, name, outgoing = false) {
  const arr = getMissed();
  const recent = arr.findIndex(m => m.code === code && Date.now() - m.ts < 60000);
  const entry = { code, name, ts: Date.now() };
  if (recent >= 0) arr[recent] = entry; else arr.unshift(entry);
  saveMissed(arr.slice(0,30));
  renderMissed();
  
  // Versuche Server-Sync – falls offline, wird es im Hintergrund später synchronisiert
  try {
    const payload = outgoing
      ? { recipient: code,   callerId: myCode, callerName: myName }
      : { recipient: myCode, callerId: code,   callerName: name   };
    await fetch(API_MISSED, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) { console.warn('Server missed call sync delayed (offline)'); }
}

function renderMissed() { /* ... unverändert ... */ }
function clearMissed() { saveMissed([]); renderMissed(); }
function callBack(code) { /* ... unverändert ... */ }

async function fetchOfflineMessages() {
  if (!myToken) return [];
  try {
    const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
    if (!res.ok) return [];
    return await res.json();
  } catch (e) { return []; }
}
async function markOfflineMsgRead(id) { /* ... unverändert ... */ }
async function markAllOfflineMsgsRead() { /* ... unverändert ... */ }
function renderOfflineMessages(msgs) { /* ... unverändert ... */ }
async function dismissOfflineMsg(id) { /* ... unverändert ... */ }

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

function refreshStatusText() {
  const statusEl = document.getElementById('pstatus');
  if(!statusEl) return;
  const online = peer?.open && !isOffline;
  
  if(partnerTypingTimer !== null){
    statusEl.textContent = '✍️ schreibt...';
    statusEl.className = 'pstatus';
    return;
  }
  if(conn && conn.open){
    statusEl.textContent = online ? '● Verbunden' : '○ Lokal verbunden';
    statusEl.className = 'pstatus ' + (online ? '' : 'dim');
  } else {
    if(document.getElementById('s-chat').classList.contains('active')){
      statusEl.textContent = '○ Verbindung getrennt';
      statusEl.className = 'pstatus dim';
    } else {
      statusEl.textContent = '○ Bereit';
      statusEl.className = 'pstatus dim';
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// INDEXEDDB – VERSION 3 (Alben & Fotos) – unverändert
// ══════════════════════════════════════════════════════════════════════════════
let db = null;
const DB_NAME = 'SpotMeDB';
const DB_VERSION = 3;

async function initDB() { /* ... unverändert ... */ }
async function getAllAlbums() { /* ... unverändert ... */ }
async function getPhotosByAlbum(albumId) { /* ... unverändert ... */ }
async function createAlbum(name) { /* ... unverändert ... */ }
async function deleteAlbum(id) { /* ... unverändert ... */ }
async function addPhoto(albumId, dataURL, name) { /* ... unverändert ... */ }
async function updateAlbumTimestamp(albumId) { /* ... unverändert ... */ }
async function deletePhotosByAlbum(albumId) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// ALBUM-MENÜ & PARTNER-INTERAKTION (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
function showAlbumMenu() { /* ... unverändert ... */ }
function closeAlbumMenu() { /* ... unverändert ... */ }
function requestPartnerAlbums() { /* ... unverändert ... */ }
let partnerAlbumsList = [];
function showPartnerAlbumsSheet(albums) { /* ... unverändert ... */ }
function closePartnerAlbumsSheet() { /* ... unverändert ... */ }
function selectPartnerAlbum(albumId) { /* ... unverändert ... */ }
function showImageOverlayLoader() { /* ... unverändert ... */ }
let currentGalleryImages = [];
let currentGalleryIndex = 0;
function buildGallery(images) { /* ... unverändert ... */ }
let pendingAlbumChunks = new Map();
let pendingAlbumMeta = new Map();
function handleAlbumImageChunk(d) { /* ... unverändert ... */ }
function handleAlbumImagesEnd(albumId) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// SPRACHNACHRICHTEN (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;

function toggleVoiceButton() { /* ... unverändert ... */ }
async function toggleVoiceRecording() { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// LOCATION FUNKTIONEN (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
function openLocationScreen() { /* ... unverändert ... */ }
function closeLocationScreen() { /* ... unverändert ... */ }
function initLocationMap() { /* ... unverändert ... */ }
function blueIcon() { /* ... unverändert ... */ }
function greenIcon() { /* ... unverändert ... */ }
function startLocationSharing() { /* ... unverändert ... */ }
function stopLocationSharing() { /* ... unverändert ... */ }
function sendLocationUpdate() { /* ... unverändert ... */ }
function updateMyMarker() { /* ... unverändert ... */ }
function updatePartnerMarker(lat, lng) { /* ... unverändert ... */ }
function updateDistanceDisplay() { /* ... unverändert ... */ }
function getDistance(lat1, lon1, lat2, lon2) { /* ... unverändert ... */ }
function formatDistance(m) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// PEERJS & VERBINDUNG – erweitert für Local‑First
// ══════════════════════════════════════════════════════════════════════════════
let peerRetries = 0;
function initPeer() {
  if(peer && !peer.destroyed && peer.open) return;
  if(peer && !peer.destroyed) { try { peer.destroy(); } catch(e){} }
  peer = null;
  setSpill('connecting', 'Verbinde mit Server...');
  peer = new Peer(myCode, {
    host: SERVER_HOST, port: 443, path: SERVER_PATH, secure: true,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }] }
  });
  
  peer.on('open', () => {
    peerRetries = 0;
    isOffline = false;
    updateConnectionStatus();
    showCodeCard(true);
    // Heartbeat starten, sobald Server erreichbar
    startHeartbeat();
  });
  
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
      addMissed(partnerCode, partnerName, true);
      if (conn) { try{ conn.close(); } catch(e){} conn = null; }
      showLeaveMessageSheet(partnerCode, partnerName);
      return;
    }
    // Server nicht erreichbar -> in den Local‑Modus wechseln
    isOffline = true;
    updateConnectionStatus();
    setSpill('offline', '○ LOCAL');
    peerRetries++;
    const delay = Math.min(4000*peerRetries,20000);
    setTimeout(() => { peer = null; initPeer(); }, delay);
  });
  
  peer.on('disconnected', () => {
    isOffline = true;
    updateConnectionStatus();
    setSpill('connecting', 'Unterbrochen · verbinde erneut...');
    setTimeout(() => { peer = null; initPeer(); }, 2500);
  });
  
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
    incoming.on('close', () => {
      if(pendingConn === incoming){
        stopRingingTone();
        addMissed(incoming.peer, localName(incoming.peer, incoming.metadata?.name));
        pendingConn = null;
        showScreen('s-home');
        toast('📵 Verpasster Anruf von ' + localName(incoming.peer, incoming.metadata?.name));
      }
    });
  });
}

function acceptCall() {
  stopRingingTone();
  if(!pendingConn){ toast('⚠️ Verbindung nicht mehr verfügbar'); return; }
  const c = pendingConn; pendingConn = null;
  partnerCode = c.peer;
  partnerName = localName(c.peer, c.metadata?.name);
  chatId = buildCID(myCode, partnerCode);
  loadPendingMessages();
  migratePendingMessages(chatId);
  openChat(c);
}

function declineCall() {
  stopRingingTone();
  if(pendingConn){
    const c = pendingConn; pendingConn = null;
    addMissed(c.peer, localName(c.peer, c.metadata?.name));
    try{ c.close(); } catch(e){}
  }
  showScreen('s-home');
}

function connectToPeer() {
  const code = getDigits();
  if(code.length !== 6 || code === myCode) return;
  
  // Auch ohne Serververbindung können wir lokal starten
  if(!peer || !peer.open){
    toast('⚠️ Im Local‑Modus – Verbindung wird hergestellt, sobald Server erreichbar');
    // Partnerdaten trotzdem setzen, damit UI reagiert
    partnerCode = code;
    partnerName = localName(code);
    chatId = buildCID(myCode, code);
    loadPendingMessages();
    migratePendingMessages(chatId);
    // Wir versuchen im Hintergrund weiter zu verbinden
  }
  
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
    if (!conn || !conn.open) {
      toast('⏰ Keine Antwort');
      addMissed(partnerCode, partnerName, true);
      if (conn) { try { conn.close(); } catch (e) {} conn = null; }
      showLeaveMessageSheet(partnerCode, partnerName);
    }
    setSpill('online', '● ONLINE');
  }, 30000);
}

function showLeaveMessageSheet(code, name) { /* ... unverändert ... */ }
function closeLeaveMessageSheet() { /* ... unverändert ... */ }
async function submitLeaveMessage() { /* ... unverändert ... */ }

function tryReconnect() {
  if(!partnerCode || !peer || !peer.open) {
    toast('↺ Warte auf Serververbindung...');
    return;
  }
  document.getElementById('rcbar').classList.remove('show');
  toast('↺ Verbinde erneut...');
  openChat(peer.connect(partnerCode, { reliable:true, metadata:{ name: myName } }));
}

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
    // Wichtig: Warteschlange jetzt abarbeiten
    flushPendingMessages();
    updateConnectionStatus();
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
    updateConnectionStatus();
  });
  
  conn.on('error', err => {
    console.warn('[conn]', err);
    if(outgoingCallTimer){ clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
    document.getElementById('rcbar').classList.add('show');
    updateConnectionStatus();
  });
}

function prepChat() { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// NACHRICHTEN & DATEIEN – erweitert für Local‑Queue
// ══════════════════════════════════════════════════════════════════════════════
function sendMsg() {
  const inp = document.getElementById('minp');
  const text = inp.value.trim();
  if(!text) return;
  
  // Prüfe ob Verbindung aktiv ist
  if(!conn || !conn.open){
    if(!chatId){
      toast('⚠️ Bitte zuerst eine Verbindung aufbauen');
      return;
    }
    // Local‑Modus: Nachricht speichern
    addPendingMessage(text);
    inp.value = '';
    inp.style.height = 'auto';
    return;
  }
  
  // Online – direkt senden
  if(typingStarted){
    conn.send({ t:'typing', state:'end' });
    if(typingDebounceTimer) clearTimeout(typingDebounceTimer);
    typingStarted = false;
  }
  const m = { t:'text', text, ts:Date.now() };
  conn.send(m);
  appendMsg({ ...m, own:true });
  persistMsg({ ...m, own:true });
  inp.value = '';
  inp.style.height = 'auto';
}

async function sendFile(inp) { /* ... unverändert ... */ }
function showUP(v) { /* ... unverändert ... */ }
function fileToB64(f) { /* ... unverändert ... */ }

function handleData(d) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// CHAT-VERLAUF & UI-HILFEN (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
function appendMsg(m) { /* ... unverändert ... */ }
window.toggleAudioPlay = function(btn) { /* ... unverändert ... */ };
function initAudioPlayer(player, url) { /* ... unverändert ... */ }
function bigImg(url) { /* ... unverändert ... */ }
function buildCID(a,b) { return 'sm_' + [a,b].sort().join('_'); }
function persistMsg(m) { /* ... unverändert ... */ }
function loadHistory() { /* ... unverändert ... */ }
function updateIdx(preview) { /* ... unverändert ... */ }
function applyPartnerName() { /* ... unverändert ... */ }
function renamePartner() { /* ... unverändert ... */ }
function renderPrev() { /* ... unverändert ... */ }
function renameContact(code, networkName) { /* ... unverändert ... */ }
function reconnectTo(code, name, cid) { /* ... unverändert ... */ }
function exportChat() { /* ... unverändert ... */ }
function triggerImport() { /* ... unverändert ... */ }
function importChat(inp) { /* ... unverändert ... */ }
function clearChat() { /* ... unverändert ... */ }
function notify(text) { /* ... unverändert ... */ }
function pushNotif(from, text) { /* ... unverändert ... */ }
let inTimer = null;
function inAppNotif(from, text) { /* ... unverändert ... */ }
function switchToChat() { /* ... unverändert ... */ }
function initDigits() { /* ... unverändert ... */ }
function getDigits() { /* ... unverändert ... */ }
function showScreen(id) { /* ... unverändert ... */ }

function setSpill(type, text) {
  const badge = document.getElementById('header-status');
  if (!badge) return;
  badge.textContent = text;
  badge.className = 'status-badge';
  if (type === 'offline') badge.classList.add('offline');
  else if (type === 'online') badge.classList.add('online');
  else badge.classList.add('connecting');
}

function openSheet() { /* ... unverändert ... */ }
function closeSheet() { /* ... unverändert ... */ }

function goHome() {
  stopRingingTone();
  const wasCallingOut = outgoingCallTimer !== null && partnerCode;
  if (outgoingCallTimer) { clearTimeout(outgoingCallTimer); outgoingCallTimer = null; }
  if (conn) { try { conn.close(); } catch (e) {} conn = null; }
  if (partnerTypingTimer) { clearTimeout(partnerTypingTimer); partnerTypingTimer = null; }
  if (typingStarted) { typingStarted = false; if (typingDebounceTimer) clearTimeout(typingDebounceTimer); }
  pendingConn = null;
  lastDate = null;
  document.querySelectorAll('.dinp-new').forEach(d => { d.value = ''; d.classList.remove('filled'); });
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

function hkey(e) { /* ... unverändert ... */ }
function autoH(el) { /* ... unverändert ... */ }
function esc(s) { /* ... unverändert ... */ }
function esc2(s) { /* ... unverändert ... */ }
function formatCode(c) { /* ... unverändert ... */ }
function copyCode() { /* ... unverändert ... */ }
function shareCode() { /* ... unverändert ... */ }
function escapeHtml(s) { /* ... unverändert ... */ }
function toggleHomeMenu(e) { /* ... unverändert ... */ }
function closeHomeMenu() { /* ... unverändert ... */ }

function goOffline() {
  if(!confirm('Verbindung zum Server trennen?')) return;
  if(conn){ try{ conn.close(); } catch(e){} conn = null; }
  if(peer){ try{ peer.destroy(); } catch(e){} peer = null; }
  isOffline = true;
  updateConnectionStatus();
  showCodeCard(false);
  setSpill('offline', '○ LOCAL');
  showScreen('s-home');
}

function showCodeCard(show) {
  const card = document.querySelector('.code-card-new');
  if (card) card.style.display = show ? '' : 'none';
  updateConnectionStatus();
}

function timeAgo(ts) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// VERSCHLÜSSELTES BACKUP (unverändert)
// ══════════════════════════════════════════════════════════════════════════════
function showBackupPasswordModal() { /* ... unverändert ... */ }
function closeBackupPasswordModal() { /* ... unverändert ... */ }
async function performBackupWithPassword() { /* ... unverändert ... */ }
async function createBackup(password) { /* ... unverändert ... */ }
async function encryptData(text, password) { /* ... unverändert ... */ }
async function decryptData(encryptedBase64, password) { /* ... unverändert ... */ }
function restoreProfile(input) { /* ... unverändert ... */ }
function closeImportPasswordModal() { /* ... unverändert ... */ }
async function submitImportPassword() { /* ... unverändert ... */ }
async function performRestore(backupData) { /* ... unverändert ... */ }

let tTimer = null;
function toast(msg, ms=2400) { /* ... unverändert ... */ }

// ══════════════════════════════════════════════════════════════════════════════
// SPOT PROFILE CACHE (Local‑First)
// ══════════════════════════════════════════════════════════════════════════════
async function loadSpotProfiles(spot) {
  const cacheKey = `spot_cache_${spot}`;
  const cached = localStorage.getItem(cacheKey);
  
  // Zuerst Cache anzeigen (falls vorhanden)
  if (cached) {
    try {
      renderSpotGrid(JSON.parse(cached));
    } catch(e) {}
  }
  
  // Dann im Hintergrund aktualisieren
  try {
    const res = await fetch(`${API_BASE}/profiles?spot=${spot}`);
    const data = await res.json();
    localStorage.setItem(cacheKey, JSON.stringify(data));
    renderSpotGrid(data);
  } catch (e) {
    if (!cached) {
      // Kein Cache und kein Netz – leere Anzeige
      const container = document.querySelector('.spots-grid');
      if (container) container.innerHTML = '<div class="empty-state">📴 Keine Profile im Cache – bitte später aktualisieren</div>';
    }
  }
}

function renderSpotGrid(profiles) {
  const container = document.querySelector('.spots-grid');
  if (!container) return;
  // Diese Funktion müsstest du noch implementieren – sie rendert die Profile in der Grid
  // Platzhalter:
  if (!profiles.length) {
    container.innerHTML = '<div class="empty-state">👥 Noch keine Profile</div>';
    return;
  }
  // ... (deine bestehende Render-Logik)
}

// ══════════════════════════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════════════════════════
window.addEventListener('load', () => {
  document.getElementById('mycode').textContent = myCode.slice(0,3) + ' · ' + myCode.slice(3,6);
  initDigits();
  renderPrev();
  renderMissed();
  initPeer();
  initDB();
  ensureRingingToneCached();
  
  // Initialen Status setzen
  updateConnectionStatus();
  
  // Voice-Button Einstellungen
  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon'), desc = document.getElementById('voice-toggle-desc');
  if (voiceEnabled) { icon.textContent = '🎤'; desc.textContent = 'Aktiviert · Button in Chatleiste'; }
  else { icon.textContent = '🔇'; desc.textContent = 'Deaktiviert · Button ausgeblendet'; }
  
  if('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  
  window.addEventListener('online', () => {
    if(!peer || peer.destroyed) initPeer();
    updateConnectionStatus();
  });
  window.addEventListener('offline', () => {
    isOffline = true;
    updateConnectionStatus();
  });
  
  document.addEventListener('click', e => {
    if(!e.target.closest('.home-drop') && !e.target.closest('.home-menu-btn')) closeHomeMenu();
  });
  
  if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
  
  const textarea = document.getElementById('minp');
  if(textarea) {
    textarea.addEventListener('input', () => {
      if(!conn||!conn.open) return;
      if(typingDebounceTimer) clearTimeout(typingDebounceTimer);
      if(!typingStarted){
        conn.send({t:'typing',state:'start'});
        typingStarted=true;
      }
      typingDebounceTimer = setTimeout(()=>{
        if(conn&&conn.open&&typingStarted){
          conn.send({t:'typing',state:'end'});
          typingStarted=false;
        }
        typingDebounceTimer=null;
      },2000);
    });
  }
  
  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if(autoConnect && peer) {
    sessionStorage.removeItem('sm_connect_to');
    setTimeout(()=>{
      const inps=document.querySelectorAll('.dinp-new');
      autoConnect.split('').forEach((ch,i)=>{
        if(inps[i]){
          inps[i].value=ch;
          inps[i].classList.add('filled');
        }
      });
      document.getElementById('cbtn').disabled=false;
      connectToPeer();
    },1500);
  }

  // Offline-Nachrichten & verpasste Anrufe laden
  setTimeout(async () => {
    if (myToken) {
      const offlineMsgs = await fetchOfflineMessages();
      if (offlineMsgs.length) renderOfflineMessages(offlineMsgs);
    }
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
  
  // Local‑First: Beim Start prüfen, ob wir überhaupt online sind
  if (!navigator.onLine) {
    isOffline = true;
    updateConnectionStatus();
    toast('📴 Lokaler Modus – alle Aktionen werden gespeichert');
  }
});