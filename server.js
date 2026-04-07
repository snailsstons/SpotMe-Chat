const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 9000;

/* ── CORS ── */
app.use(cors({
  origin: '*',   // Für GitHub Pages / beliebige Domains
  methods: ['GET', 'POST'],
}));

/* ── SICHERHEITS-HEADER ── */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

/* ── KEEPALIVE-PING (Render.com Free Tier) ──
   GET /ping gibt 200 zurück → verhindert das Einschlafen */
app.get('/ping', (req, res) => res.json({ status:'ok', ts: Date.now() }));

/* ── STATUS-SEITE ── */
app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>SpotMe Server</title>
<style>body{font-family:sans-serif;background:#060a0f;color:#e8edf5;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column;gap:.75rem}
h1{font-size:1.5rem;margin:0}p{color:#5a6a80;font-size:.9rem;margin:0}.dot{width:10px;height:10px;border-radius:50%;background:#1ecc68;display:inline-block;margin-right:.4rem;box-shadow:0 0 10px #1ecc68}</style>
</head><body>
<h1><span class="dot"></span>SpotMe PeerJS Server</h1>
<p>Status: Online · Peers: ${getPeerCount()}</p>
<p style="font-size:.75rem;color:#3a4a5a">Signaling only · No message content stored</p>
</body></html>`);
});

/* ── SERVER STARTEN ── */
const server = app.listen(PORT, () => {
  console.log(`[SpotMe] Server läuft auf Port ${PORT}`);
});

/* ── PEERJS ── */
const peerServer = ExpressPeerServer(server, {
  path:    '/',
  proxied: true,             // Wichtig für Render.com (hinter einem Proxy)
  // allow_discovery NICHT gesetzt → Datenschutz: Peers können sich nicht auflisten
  alive_timeout:  30000,     // 30s: inaktive Peers entfernen
  key:     'spotme',         // Einfacher Schutz vor fremden Clients
});

// PeerJS unter /peerjs erreichbar (Client: path: '/peerjs')
app.use('/peerjs', peerServer);

/* ── PEER-ZÄHLER ── */
let peerCount = 0;
function getPeerCount() { return peerCount; }

peerServer.on('connection', client => {
  peerCount++;
  console.log(`[+] ${client.getId()} verbunden | Gesamt: ${peerCount}`);
});

peerServer.on('disconnect', client => {
  peerCount = Math.max(0, peerCount - 1);
  console.log(`[-] ${client.getId()} getrennt | Gesamt: ${peerCount}`);
});

/* ── GRACEFUL SHUTDOWN ── */
process.on('SIGTERM', () => {
  console.log('[SpotMe] Server wird gestoppt...');
  server.close(() => process.exit(0));
});
