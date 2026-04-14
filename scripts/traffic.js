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

  // Von PeerJS‑Verbindungen aufrufen
  recordP2PSent(bytes) {
    this.p2pSent += bytes;
    this.updateUI();
  },
  recordP2PReceived(bytes) {
    this.p2pReceived += bytes;
    this.updateUI();
  },

  // Von fetch‑Instrumentierung
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
      <span title="P2P gesendet">⬆️ ${this.formatBytes(this.p2pSent)}</span>
      <span title="P2P empfangen">⬇️ ${this.formatBytes(this.p2pReceived)}</span>
    `;
  },

  formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
    return (b / (1024 * 1024)).toFixed(2) + ' MB';
  }
};

// Überschreiben der globalen fetch‑Funktion, um Traffic zu messen
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const request = new Request(...args);
  let requestBodySize = 0;
  if (request.body) {
    // Grobe Schätzung – exakte Größe nur bei Blob/ArrayBuffer möglich
    const contentLength = request.headers.get('content-length');
    requestBodySize = contentLength ? parseInt(contentLength) : 0;
  }
  Traffic.recordServerSent(requestBodySize);

  const response = await originalFetch.apply(this, args);
  
  // Antwortgröße aus Content‑Length oder durch Klonen des Body (einfach)
  const contentLength = response.headers.get('content-length');
  const responseSize = contentLength ? parseInt(contentLength) : 0;
  Traffic.recordServerReceived(responseSize);

  return response;
};

// Exportiere Traffic global
window.Traffic = Traffic;
