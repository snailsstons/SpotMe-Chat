'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – USAGE STATISTICS (usage-stats.js)
// Sammelt lokale Nutzungsdaten für Achtsamkeits‑Seite
// ══════════════════════════════════════════════════════════════════════════════

const USAGE_KEY = 'sm_usage_stats';

function getUsageStats() {
  const raw = localStorage.getItem(USAGE_KEY);
  return raw ? JSON.parse(raw) : { sessions: [], messagesSent: 0, localModeTime: 0 };
}

function saveUsageStats(stats) {
  localStorage.setItem(USAGE_KEY, JSON.stringify(stats));
}

// App-Start aufzeichnen
function recordAppOpen() {
  const stats = getUsageStats();
  stats.sessions.push({ start: Date.now() });
  // Nur Sessions der letzten 7 Tage behalten
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  stats.sessions = stats.sessions.filter(s => s.start > sevenDaysAgo);
  saveUsageStats(stats);
}

// App-Ende / Dauer aufzeichnen
function recordAppClose() {
  const stats = getUsageStats();
  const last = stats.sessions[stats.sessions.length - 1];
  if (last && !last.duration) {
    last.duration = Date.now() - last.start;
  }
  saveUsageStats(stats);
}

// Gesendete Nachricht zählen
function incrementMessagesSent() {
  const stats = getUsageStats();
  stats.messagesSent = (stats.messagesSent || 0) + 1;
  saveUsageStats(stats);
}

// Zeit im Lokal‑Modus addieren (ms)
function addLocalModeTime(ms) {
  const stats = getUsageStats();
  stats.localModeTime = (stats.localModeTime || 0) + ms;
  saveUsageStats(stats);
}

// Optional: Aktuellen Score berechnen (für andere Module)
function calculateUsageScore() {
  const stats = getUsageStats();
  const recentSessions = stats.sessions.filter(s => Date.now() - s.start < 2 * 60 * 60 * 1000).length;
  return Math.min(10, recentSessions * 2);
}

// Globale Verfügbarkeit
window.Usage = {
  recordAppOpen,
  recordAppClose,
  incrementMessagesSent,
  addLocalModeTime,
  calculateUsageScore,
  getStats: getUsageStats
};
