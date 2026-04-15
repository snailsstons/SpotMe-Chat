'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – LOCAL ANALYTICS (analytics.js)
// Sammelt anonyme Nutzungsdaten für adaptiven Algorithmus – 100% lokal
// ══════════════════════════════════════════════════════════════════════════════

const ANALYTICS_KEY = 'sm_analytics';

// Standard-Struktur
const DEFAULT_STATS = {
  // === Sitzungen ===
  sessions: [],                // { start, duration } der letzten 7 Tage
  totalSessions: 0,            // Gesamtzahl aller Sitzungen

  // === Nachrichten ===
  messagesSent: 0,             // Gesendete P2P-Nachrichten
  messagesReceived: 0,         // Empfangene P2P-Nachrichten
  offlineMessagesSent: 0,      // Kurznachrichten (Spot/Home)
  pendingMessagesSent: 0,      // Aus Pending-Queue gesendet

  // === Anrufe ===
  callsOutgoing: 0,            // Ausgehende Anrufe
  callsIncoming: 0,            // Eingehende Anrufe
  callsAccepted: 0,            // Angenommene Anrufe
  callsDeclined: 0,            // Abgelehnte / verpasste Anrufe
  callsMissed: 0,              // Verpasste Anrufe (nicht angenommen)

  // === Lokal‑Modus ===
  localModeTime: 0,            // Gesamtzeit im Lokal‑Modus (ms)
  manualOfflineCount: 0,       // Wie oft manuell "Offline gehen" geklickt

  // === Spots ===
  profileViews: 0,             // Geöffnete fremde Profile
  spotSessions: { gay: 0, dates: 0, general: 0 }, // Besuche pro Spot

  // === Traffic (Bytes) ===
  p2pSent: 0,
  p2pReceived: 0,
  serverSent: 0,
  serverReceived: 0,

  // === Sonstiges ===
  appStarts: 0,                // Wie oft die App gestartet wurde (load)
  lastReset: Date.now()        // Zeitstempel der letzten Zurücksetzung
};

// Aktuelle Statistiken aus localStorage laden
function getAnalytics() {
  const raw = localStorage.getItem(ANALYTICS_KEY);
  if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATS));
  try {
    return JSON.parse(raw);
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_STATS));
  }
}

function saveAnalytics(stats) {
  localStorage.setItem(ANALYTICS_KEY, JSON.stringify(stats));
}

// ─────────────────────────────────────────────────────────────────────────────
// Zähler-Funktionen (werden von anderen Modulen aufgerufen)
// ─────────────────────────────────────────────────────────────────────────────

function analyticsRecordSession(durationMs) {
  const stats = getAnalytics();
  stats.totalSessions++;
  stats.sessions.push({ start: Date.now() - durationMs, duration: durationMs });
  // Nur 7 Tage behalten
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  stats.sessions = stats.sessions.filter(s => s.start > sevenDaysAgo);
  saveAnalytics(stats);
}

function analyticsIncrement(key, amount = 1) {
  const stats = getAnalytics();
  if (typeof stats[key] === 'number') {
    stats[key] += amount;
  }
  saveAnalytics(stats);
}

function analyticsAddLocalModeTime(ms) {
  const stats = getAnalytics();
  stats.localModeTime += ms;
  saveAnalytics(stats);
}

function analyticsRecordSpotVisit(spot) {
  const stats = getAnalytics();
  if (stats.spotSessions[spot] !== undefined) {
    stats.spotSessions[spot]++;
  }
  saveAnalytics(stats);
}

function analyticsSyncTraffic() {
  if (typeof Traffic === 'undefined') return;
  const stats = getAnalytics();
  stats.p2pSent      = Traffic.p2pSent;
  stats.p2pReceived  = Traffic.p2pReceived;
  stats.serverSent   = Traffic.serverSent;
  stats.serverReceived = Traffic.serverReceived;
  saveAnalytics(stats);
}

// App-Start
function analyticsRecordAppStart() {
  const stats = getAnalytics();
  stats.appStarts++;
  saveAnalytics(stats);
}

// Reset (für Nutzer oder zu Testzwecken)
function analyticsReset() {
  const fresh = JSON.parse(JSON.stringify(DEFAULT_STATS));
  fresh.lastReset = Date.now();
  saveAnalytics(fresh);
}

// ─────────────────────────────────────────────────────────────────────────────
// Konsolen-Ausgabe (tabellarisch)
// ─────────────────────────────────────────────────────────────────────────────
function analyticsShowConsole() {
  const stats = getAnalytics();
  analyticsSyncTraffic(); // Aktuelle Traffic-Werte übernehmen

  console.group('📊 SpotMe Analytics (100% lokal)');
  console.log('🕐 Letzte Aktualisierung:', new Date().toLocaleString());
  console.log('🔄 Letzter Reset:', stats.lastReset ? new Date(stats.lastReset).toLocaleString() : 'nie');

  // Tabelle 1: Übersicht
  console.table({
    'App-Starts': stats.appStarts,
    'Sitzungen (gesamt)': stats.totalSessions,
    'Sitzungen (letzte 7 Tage)': stats.sessions.length,
    'Profil-Aufrufe': stats.profileViews,
    'Manuell Offline': stats.manualOfflineCount,
  });

  // Tabelle 2: Kommunikation
  console.table({
    'P2P gesendet': stats.messagesSent,
    'P2P empfangen': stats.messagesReceived,
    'Kurznachrichten gesendet': stats.offlineMessagesSent,
    'Pending gesendet': stats.pendingMessagesSent,
    'Ausgehende Anrufe': stats.callsOutgoing,
    'Eingehende Anrufe': stats.callsIncoming,
    'Angenommen': stats.callsAccepted,
    'Abgelehnt/Verpasst': stats.callsDeclined + stats.callsMissed,
  });

  // Tabelle 3: Lokal-Modus & Traffic
  console.table({
    'Zeit im Lokal-Modus': formatDuration(stats.localModeTime),
    'Traffic P2P ⬆️': formatBytes(stats.p2pSent),
    'Traffic P2P ⬇️': formatBytes(stats.p2pReceived),
    'Traffic Server ⬆️': formatBytes(stats.serverSent),
    'Traffic Server ⬇️': formatBytes(stats.serverReceived),
  });

  // Tabelle 4: Spots
  console.table(stats.spotSessions);

  console.groupEnd();

  // Kurzzusammenfassung als Text
  console.log(
    `%c📱 Nutzungsprofil: %c${getUsageProfile(stats)}`,
    'font-weight:bold;', 'color:#00e5c0; font-weight:bold;'
  );
}

// Hilfsfunktionen für Anzeige
function formatDuration(ms) {
  if (ms < 60000) return '< 1 Min';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} Min`;
  const hours = Math.floor(mins / 60);
  return `${hours} Std ${mins % 60} Min`;
}

function formatBytes(b) {
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / (1024 * 1024)).toFixed(2) + ' MB';
}

function getUsageProfile(stats) {
  const recentSessions = stats.sessions.length;
  const messagesTotal = stats.messagesSent + stats.offlineMessagesSent;
  const localRatio = stats.localModeTime / (Date.now() - stats.lastReset + 1);
  
  if (recentSessions < 3 && messagesTotal < 5) return '🌱 Gelegenheitsnutzer';
  if (localRatio > 0.5) return '🧘 Fokus-Nutzer (viel Lokal)';
  if (messagesTotal > 20) return '💬 Vielschreiber';
  return '⚖️ Ausgeglichen';
}

// Globale Schnittstelle
window.Analytics = {
  recordSession: analyticsRecordSession,
  increment: analyticsIncrement,
  addLocalModeTime: analyticsAddLocalModeTime,
  recordSpotVisit: analyticsRecordSpotVisit,
  syncTraffic: analyticsSyncTraffic,
  recordAppStart: analyticsRecordAppStart,
  reset: analyticsReset,
  showConsole: analyticsShowConsole,
  getStats: getAnalytics
};
