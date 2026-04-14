'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – KONFIGURATION & GLOBALE VARIABLEN (config.js)
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Server & API
const SERVER_HOST = 'spotme-pg-test.onrender.com';
const SERVER_PATH = '/peerjs';
const API_MISSED  = 'https://spotme-pg-test.onrender.com/api/missed-call';
const API_BASE    = 'https://spotme-pg-test.onrender.com/api';
const TOKEN_KEY   = 'sm_token';

// ─────────────────────────────────────────────────────────────────────────────
// Chunk-Größe für Dateiübertragung
const CHUNK = 16384;

// ─────────────────────────────────────────────────────────────────────────────
// Benutzerdaten (localStorage oder neu generiert)
function newCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

let myCode  = localStorage.getItem('sm_code') || newCode();
let myName  = localStorage.getItem('sm_name') || 'User_' + myCode.slice(0, 4);
let myToken = localStorage.getItem(TOKEN_KEY) || '';

// Beim ersten Start speichern
localStorage.setItem('sm_code', myCode);
localStorage.setItem('sm_name', myName);

// ─────────────────────────────────────────────────────────────────────────────
// PeerJS & Verbindung
let peer = null;
let conn = null;
let pendingConn = null;
let isOffline = false;
let peerRetries = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Partner-Daten
let partnerCode = '';
let partnerName = '';
let chatId = '';

// ─────────────────────────────────────────────────────────────────────────────
// Anruf-Timer & Audio
let outgoingCallTimer = null;
let currentRingingAudio = null;

// ─────────────────────────────────────────────────────────────────────────────
// Typing-Indikator
let typingStarted = false;
let typingDebounceTimer = null;
let partnerTypingTimer = null;

// ─────────────────────────────────────────────────────────────────────────────
// Pending Messages (Offline-Warteschlange)
let pendingMessages = [];

// ─────────────────────────────────────────────────────────────────────────────
// Voice-Button
let voiceEnabled = localStorage.getItem('sm_voice_enabled') !== 'false';

// ─────────────────────────────────────────────────────────────────────────────
// Datei-Chunking (Empfang)
let fileBufs = {};

// ─────────────────────────────────────────────────────────────────────────────
// Chat-Verlauf (letztes Datum für Trennlinie)
let lastDate = null;

// ─────────────────────────────────────────────────────────────────────────────
// Location Sharing
let locationMap = null;
let myMarker = null;
let partnerMarker = null;
let myPosition = null;
let partnerPosition = null;
let locationWatchId = null;
let locationInterval = null;
let currentRadius = 500;

// ─────────────────────────────────────────────────────────────────────────────
// Backup (Zwischenspeicher für Passwort-Import)
let pendingRestoreFile = null;