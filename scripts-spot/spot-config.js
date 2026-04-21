'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KONFIGURATION (spot-config.js)
// ══════════════════════════════════════════════════════════════════════════════

const API  = 'https://spotme-pg-test.onrender.com/api';

// 🆕 Werden in spot-init.js dynamisch gesetzt!
let PROFILE_KEY = 'sm_profile_temp';
let TOKEN_KEY   = 'sm_token_temp';

const KEEPALIVE_INTERVAL = 8 * 60 * 1000;
const LOCATION_UPDATE_INTERVAL = 30000;
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
