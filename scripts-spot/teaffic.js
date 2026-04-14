'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – TRAFFIC MONITOR (traffic.js)
// Misst gesendete/empfangene Bytes (P2P & Server)
// ══════════════════════════════════════════════════════════════════════════════

const Traffic = {
  p2pSent: 0,
  p2pReceived: 0,
  serverSent: 0,
  serverReceived: 0,

  recordP2PSent(bytes) {
    this.p2pSent += bytes;
    this.updateUI();
  },
  recordP2PReceived(bytes) {
    this.p2pReceived += bytes;
    this.updateUI();
  },
  recordServerSent(bytes) {
    this.serverSent += bytes;
    this.updateUI();
  },
  recordServerReceived(bytes) {
    this.serverReceived += bytes;
    this.updateUI();
  },

  updateUI() {
    const el = document.getElementById('traffic-display');
    if (!el) return;
    const total = this.p2pSent + this.p2pReceived + this.serverSent + this.serverReceived;
    el.innerHTML = `
      <span title="Gesamter Datenverkehr">📊 ${this.formatBytes(total)}</span>
      <span title="Server gesendet">⬆️ ${this.formatBytes(this.serverSent)}</span>
      <span title="Server empfangen">⬇️ ${this.formatBytes(this.serverReceived)}</span>
    `;
  },

  formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  },

  reset() {
    this.p2pSent = 0;
    this.p2pReceived = 0;
    this.serverSent = 0;
    this.serverReceived = 0;
    this.updateUI();
  }
};

const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const request = new Request(...args);
  let requestBodySize = 0;
  if (request.body) {
    const contentLength = request.headers.get('content-length');
    requestBodySize = contentLength ? parseInt(contentLength) : 0;
  }
  Traffic.recordServerSent(requestBodySize);

  const response = await originalFetch.apply(this, args);

  const contentLength = response.headers.get('content-length');
  const responseSize = contentLength ? parseInt(contentLength) : 0;
  Traffic.recordServerReceived(responseSize);

  return response;
};

window.Traffic = Traffic;
