'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – UTILITIES (utils.js)
// Hilfsfunktionen: Toast, Escaping, Zeitformatierung, Haptik, etc.
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Toast-Benachrichtigung
let tTimer = null;
function toast(msg, ms = 2400) {
  const ex = document.querySelector('.toast');
  if (ex) ex.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('show')));
  clearTimeout(tTimer);
  tTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, ms);
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML-Escaping
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function esc2(s) {
  return s.replace(/'/g, "\\'");
}

function escapeHtml(s) {
  return esc(s);
}

// ─────────────────────────────────────────────────────────────────────────────
// Code-Formatierung (123456 → "123 · 456")
function formatCode(c) {
  return c.slice(0, 3) + ' · ' + c.slice(3, 6);
}

// ─────────────────────────────────────────────────────────────────────────────
// Relative Zeit (z.B. "vor 5 Min")
function timeAgo(ts) {
  if (!ts) return '';
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 2) return 'gerade';
  if (min < 60) return `vor ${min} Min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `vor ${h} Std`;
  return `vor ${Math.floor(h / 24)} Tag${Math.floor(h / 24) > 1 ? 'en' : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Haptisches Feedback
function triggerHaptic() {
  if (navigator.vibrate) navigator.vibrate(200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat-ID aus zwei Codes generieren (sortiert)
function buildCID(a, b) {
  return 'sm_' + [a, b].sort().join('_');
}

// ─────────────────────────────────────────────────────────────────────────────
// Ziffern aus den Eingabefeldern auslesen
function getDigits() {
  return [...document.querySelectorAll('.dinp-new')].map(x => x.value).join('');
}