const express = require('express');
const { ExpressPeerServer } = require('peer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 9000;

// --- Middleware ---
app.use(cors({ origin: '*', methods: ['GET','POST','DELETE','OPTIONS'] }));
app.use(express.json({ limit: '50kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// --- Profil-Store (In-Memory, 24h TTL) ---
const profileStore = new Map();
const PROFILE_TTL = 24 * 60 * 60 * 1000;

function cleanExpired() {
  const now = Date.now();
  for (const [code, p] of profileStore) {
    if (now - p.ts > PROFILE_TTL) {
      profileStore.delete(code);
      console.log(`[spot] Profil ${code} abgelaufen`);
    }
  }
}
setInterval(cleanExpired, 30 * 60 * 1000);

// --- API: Profil veröffentlichen / aktualisieren ---
app.post('/api/profile', (req, res) => {
  const p = req.body;
  if (!p.code || !/^\d{6}$/.test(p.code))         return res.status(400).json({ error: 'Ungültiger Code' });
  if (!p.name || !p.name.trim())                   return res.status(400).json({ error: 'Name fehlt' });
  if (!p.region)                                   return res.status(400).json({ error: 'Region fehlt' });
  const age = parseInt(p.age);
  if (p.age !== undefined && (isNaN(age) || age < 18 || age > 100))
                                                   return res.status(400).json({ error: 'Alter ungültig (min. 18)' });

  let bio = (p.bio || '').slice(0, 512)
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/www\.\S+/gi, '')
    .replace(/@[^\s]+\.[a-z]{2,}/gi, '')
    .trim();

  const profile = {
    code:        p.code,
    name:        p.name.trim().slice(0, 30),
    age:         isNaN(age) ? null : age,
    region:      String(p.region).slice(0, 50),
    province:    (p.province || '').slice(0, 50) || null,
    city:        (p.city     || '').slice(0, 50) || null,
    orientation: ['hetero','homo','bi'].includes(p.orientation) ? p.orientation : null,
    role:        ['bottom','top','versatile'].includes(p.role)  ? p.role        : null,
    trans:       Boolean(p.trans),
    cross:       Boolean(p.cross),
    bio:         bio || null,
    ts:          Date.now()
  };

  profileStore.set(profile.code, profile);
  console.log(`[spot] +${profile.name} (${profile.code}) · ${profile.region}`);
  res.json({ ok: true });
});

// GET /api/profiles — alle Profile (optional ?region=xxx)
app.get('/api/profiles', (req, res) => {
  cleanExpired();
  let list = [...profileStore.values()];
  if (req.query.region) list = list.filter(p => p.region === req.query.region);
  list.sort((a, b) => b.ts - a.ts);
  res.json(list);
});

// GET /api/profile/:code — einzelnes Profil
app.get('/api/profile/:code', (req, res) => {
  const p = profileStore.get(req.params.code);
  if (!p) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(p);
});

// DELETE /api/profile/:code — Profil entfernen
app.delete('/api/profile/:code', (req, res) => {
  if (!/^\d{6}$/.test(req.params.code)) return res.status(400).json({ error: 'Ungültiger Code' });
  profileStore.delete(req.params.code);
  console.log(`[spot] -${req.params.code}`);
  res.json({ ok: true });
});

// --- Health & Status ---
app.get('/ping', (req, res) => res.json({ status:'ok', ts:Date.now(), profiles:profileStore.size }));

// --- Startseite (Status) ---
app.get('/', (req, res) => {
  const n = profileStore.size;
  res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpotMe</title>
<style>body{font-family:sans-serif;background:#060a0f;color:#dde4f0;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;gap:.6rem;text-align:center}
h1{font-size:1.4rem;margin:0}.dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#1ecc68;box-shadow:0 0 9px #1ecc68;margin-right:.4rem}
p{color:#5a6a80;font-size:.85rem;margin:0}.b{display:inline-block;background:#101820;border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:.35rem .85rem;font-size:.82rem;color:#7a8fa8;margin-top:.25rem}</style>
</head><body>
<h1><span class="dot"></span>SpotMe Server</h1>
<p>PeerJS Signaling · Community API</p>
<div class="b">👥 ${n} ${n===1?'Profil':'Profile'} aktiv</div>
<p style="font-size:.73rem;color:#3a4a5a;margin-top:.4rem">No message content stored</p>
</body></html>`);
});

// --- PeerJS: Server erstellen und integrieren ---
const server = app.listen(PORT, () => {
  console.log(`[SpotMe] Server läuft auf Port ${PORT}`);
});

// PeerJS initialisieren (genau wie in der funktionierenden server.js)
const peerServer = ExpressPeerServer(server, {
  path: '/',
  proxied: true,
  alive_timeout: 30000,
  key: 'spotme'
});
app.use('/peerjs', peerServer);

// Optional: Logs für Peer-Verbindungen
let peerCount = 0;
peerServer.on('connection', (client) => {
  peerCount++;
  const p = profileStore.get(client.getId());
  if (p) p.ts = Date.now(); // Profil als frisch markieren wenn Peer aktiv
  console.log(`[peer] +${client.getId()} | gesamt: ${peerCount}`);
});
peerServer.on('disconnect', (client) => {
  peerCount = Math.max(0, peerCount - 1);
  console.log(`[peer] -${client.getId()} | gesamt: ${peerCount}`);
});

// Sauberes Herunterfahren
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
