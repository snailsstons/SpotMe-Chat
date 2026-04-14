'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – GLOBALER STATE (spot-state.js)
// ══════════════════════════════════════════════════════════════════════════════

let myProfile = null;
let myCode  = localStorage.getItem('sm_code')  || '';
let myToken = localStorage.getItem(TOKEN_KEY)  || '';
let isPublished = false;
let isSharingLocation = false;
let allProfiles = [];
let filtered = [];
let keepaliveTimer = null;
let locationTimer = null;
let locationWatchId = null;
let userPosition = null;
let autoRefreshTimer = null;
let heartbeatTimer = null;

let currentTargetCode = null;
let currentTargetLat = null, currentTargetLng = null;
let currentMap = null, userMarker = null, targetMarker = null;

const locationCache = new Map();
const onlineStatusCache = new Map();
const verificationCache = new Map();
