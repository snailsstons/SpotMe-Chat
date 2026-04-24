'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – KONFIGURATION & GLOBALE VARIABLEN (config.js)
// ══════════════════════════════════════════════════════════════════════════════

// Server & API
// const SERVER_HOST = 'spotme-pg-test.onrender.com';
const SERVER_Host = 'spotme-chat-obom.onrender.com';
const SERVER_PATH = '/peerjs';

// const API_MISSED  = 'https://spotme-pg-test.onrender.com/api/missed-call';
// const API_BASE    = 'https://spotme-pg-test.onrender.com/api';
const API_MISSED = 'spotme-chat-obom.onrender.com';
const API_BASE = 'spotme-chat-obom.onrender.com';

const TOKEN_KEY   = 'sm_token';

// Chunk-Größe
const CHUNK = 16384;

function newCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Globale Variablen (let, nicht const!)
let myCode  = localStorage.getItem('sm_code') || newCode();
let myName  = localStorage.getItem('sm_name') || 'User_' + myCode.slice(0, 4);
let myToken = localStorage.getItem(TOKEN_KEY) || '';

localStorage.setItem('sm_code', myCode);
localStorage.setItem('sm_name', myName);

// PeerJS & Verbindung
let peer = null;
let conn = null;
let pendingConn = null;
let isOffline = false;
let peerReady = false;

// Partner-Daten
let partnerCode = '';
let partnerName = '';
let chatId = '';

// Anruf-Timer & Audio
let outgoingCallTimer = null;
let currentRingingAudio = null;

// Typing-Indikator
let typingStarted = false;
let typingDebounceTimer = null;
let partnerTypingTimer = null;

// Pending Messages
let pendingMessages = [];

// Voice-Button
let voiceEnabled = localStorage.getItem('sm_voice_enabled') !== 'false';

// Datei-Chunking (Empfang)
let fileBufs = {};

// Chat-Verlauf
let lastDate = null;

// Location Sharing
let locationMap = null;
let myMarker = null;
let partnerMarker = null;
let myPosition = null;
let partnerPosition = null;
let locationWatchId = null;
let locationInterval = null;
let currentRadius = 500;

// Backup
let pendingRestoreFile = null;

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 SUPABASE INTEGRATION (wenn vorhanden)
// ══════════════════════════════════════════════════════════════════════════════

// Supabase Client wird in supabase-config.js erstellt und hier referenziert
let supabase = null;

// Warte auf Supabase-Initialisierung
document.addEventListener('supabase-ready', (e) => {
  supabase = e.detail.client;
  console.log('✅ Supabase in config.js verfügbar');
});

// Fallback: Direkt aus window holen
setTimeout(() => {
  if (window.supabase && !supabase) {
    supabase = window.supabase;
    console.log('✅ Supabase aus window geladen');
  }
}, 500);
