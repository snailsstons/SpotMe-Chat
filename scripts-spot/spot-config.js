'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KONFIGURATION (spot-config.js)
// ══════════════════════════════════════════════════════════════════════════════

const API  = 'https://spotme-pg-test.onrender.com/api';
const PROFILE_KEY = 'sm_profile';
const TOKEN_KEY   = 'sm_token';
const KEEPALIVE_INTERVAL = 8 * 60 * 1000;
const LOCATION_UPDATE_INTERVAL = 30000;
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;
const HEARTBEAT_INTERVAL = 30000;
const DEFAULT_RADIUS = 500;
const CACHE_VERSION = 1;
const CACHE_KEY = `spot_cache_${SPOT}_v${CACHE_VERSION}`;

const REGIONS = [
  'Andalusien','Aragón','Asturien','Balearen','Baskenland',
  'Extremadura','Galicien','Kanaren','Kantabrien',
  'Kastilien-La Mancha','Kastilien-León','Katalonien',
  'La Rioja','Madrid','Murcia','Navarra','Valencia (Region)'
];
