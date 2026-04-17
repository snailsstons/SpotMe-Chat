'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – AUDIO (audio.js)
// Klingelton (WAV), Caching, Fallback-Beep, Benachrichtigungston
// ══════════════════════════════════════════════════════════════════════════════

const CACHE_NAME = 'spotme-sounds';
const TONE_URL = '/sounds/ringing.wav';

let fallbackInterval = null;
let fallbackCtx = null;

// ─────────────────────────────────────────────────────────────────────────────
// Klingelton-Cache vorbereiten
async function ensureRingingToneCached() {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(TONE_URL);
  if (cached) return true;
  try {
    const blob = await generateRingingToneBlob();
    const response = new Response(blob, { headers: { 'Content-Type': 'audio/wav' } });
    await cache.put(TONE_URL, response);
    return true;
  } catch (e) {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Klingelton als WAV generieren (OfflineAudioContext)
function generateRingingToneBlob() {
  return new Promise((resolve) => {
    const sampleRate = 44100;
    const duration = 1.2;
    const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);
    const now = offlineCtx.currentTime;

    const osc1 = offlineCtx.createOscillator();
    const gain1 = offlineCtx.createGain();
    osc1.connect(gain1);
    gain1.connect(offlineCtx.destination);
    osc1.type = 'sine';
    osc1.frequency.value = 800;
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    osc1.start(now);
    osc1.stop(now + 0.5);

    const osc2 = offlineCtx.createOscillator();
    const gain2 = offlineCtx.createGain();
    osc2.connect(gain2);
    gain2.connect(offlineCtx.destination);
    osc2.type = 'sine';
    osc2.frequency.value = 800;
    gain2.gain.setValueAtTime(0.3, now + 0.7);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    osc2.start(now + 0.7);
    osc2.stop(now + 1.2);

    offlineCtx.startRendering().then(renderedBuffer => resolve(bufferToWav(renderedBuffer)));
  });
}

// AudioBuffer → WAV Blob
function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  let samples = buffer.getChannelData(0);
  let dataLength = samples.length * (bitDepth / 8);
  let bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}

// ─────────────────────────────────────────────────────────────────────────────
// Klingelton abspielen / stoppen
async function playRingingTone() {
  stopRingingTone();
  try {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(TONE_URL);
    if (cached) {
      const blob = await cached.blob();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.loop = true;
      audio.play();
      currentRingingAudio = audio;
      return;
    }
  } catch (e) {}
  startFallbackRinging();
}

function stopRingingTone() {
  if (currentRingingAudio) {
    currentRingingAudio.pause();
    currentRingingAudio.src = '';
    currentRingingAudio = null;
  }
  stopFallbackRinging();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback-Beep (wenn Cache nicht verfügbar)
function startFallbackRinging() {
  stopFallbackRinging();
  function beep() {
    try {
      if (!fallbackCtx || fallbackCtx.state === 'closed') {
        fallbackCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = fallbackCtx;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 800;
      gain.gain.value = 0.3;
      osc.type = 'sine';
      osc.start();
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.stop(now + 0.5);
      if (ctx.state === 'suspended') ctx.resume();
    } catch (e) {}
  }
  beep();
  fallbackInterval = setInterval(beep, 800);
}

function stopFallbackRinging() {
  if (fallbackInterval) {
    clearInterval(fallbackInterval);
    fallbackInterval = null;
  }
  if (fallbackCtx) {
    try { fallbackCtx.close(); } catch (e) {}
    fallbackCtx = null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Benachrichtigungston (kurzer Beep)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.type = 'sine';
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) {}
}