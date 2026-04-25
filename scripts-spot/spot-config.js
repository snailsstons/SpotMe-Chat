'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KONFIGURATION (spot-config.js)
// Globaler Token für ALLE Spots!
// ══════════════════════════════════════════════════════════════════════════════

const API  = 'https://spotme-chat-obom.onrender.com/api';

// 🆕 GLOBALER Token – EIN Token für ALLE Spots und den Chat!
const TOKEN_KEY = 'sm_token';

// 🆕 Profil ist Spot-spezifisch – wird in spot-init.js gesetzt!
let PROFILE_KEY = 'sm_profile_temp';

const KEEPALIVE_INTERVAL = 8 * 60 * 1000;
const LOCATION_UPDATE_INTERVAL = 30000;

// ── Standort State (global für alle Spots) ──
let isSharingLocation = false;
let locationWatchId   = null;
let locationTimer     = null;
let userPosition      = null;
let currentMap        = null;
let targetMarker      = null;
let userMarker        = null;
let currentTargetCode = null;
let currentTargetLat  = null;
let currentTargetLng  = null;
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL = 30000;
const DEFAULT_RADIUS = 500;
const CACHE_VERSION = 1;

const REGIONS = [
  'Andalusien','Aragón','Asturien','Balearen','Baskenland',
  'Extremadura','Galicien','Kanaren','Kantabrien',
  'Kastilien-La Mancha','Kastilien-León','Katalonien',
  'La Rioja','Madrid','Murcia','Navarra','Valencia (Region)'
];
