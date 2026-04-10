const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();

// CORS für API und PeerJS
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------- PeerJS Server ----------
const server = require('http').createServer(app);
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: true,
  proxied: true
});

app.use('/peerjs', peerServer);

// ---------- In-Memory Speicher ----------
const profiles = new Map();           // code -> Profil
const locationCache = new Map();      // code -> { lat, lng, ts }

// ---------- Alte Einträge alle 2 Minuten löschen ----------
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(code);
  }
}, 120000);

// ---------- Community Profile ----------
app.get('/api/profiles', (req, res) => {
  const list = [];
  for (const [code, profile] of profiles.entries()) {
    list.push({
      code,
      ...profile,
      ts: profile.updated || Date.now()
    });
  }
  res.json(list);
});

app.post('/api/profile', (req, res) => {
  const { code, name, age, region, province, city, orientation, role, trans, cross, bio } = req.body;
  if (!code || !name || !region) {
    return res.status(400).json({ error: 'Pflichtfelder: code, name, region' });
  }
  profiles.set(code, {
    name, age, region, province, city, orientation, role,
    trans: !!trans, cross: !!cross, bio,
    updated: Date.now()
  });
  res.json({ success: true });
});

app.delete('/api/profile/:code', (req, res) => {
  const { code } = req.params;
  profiles.delete(code);
  locationCache.delete(code);
  res.json({ success: true });
});

app.get('/api/profile/:code', (req, res) => {
  const { code } = req.params;
  if (profiles.has(code)) {
    res.json({ code, ...profiles.get(code) });
  } else {
    res.status(404).json({ error: 'Nicht gefunden' });
  }
});

// ---------- Live-Standort ----------
app.post('/api/location', (req, res) => {
  const { code, lat, lng } = req.body;
  if (!code || lat == null || lng == null) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  locationCache.set(code, { lat, lng, ts: Date.now() });
  res.json({ success: true });
});

app.get('/api/location/:code', (req, res) => {
  const { code } = req.params;
  const data = locationCache.get(code);
  if (!data || Date.now() - data.ts > 120000) {
    return res.status(404).json({ error: 'Standort nicht verfügbar' });
  }
  res.json({ lat: data.lat, lng: data.lng });
});

// ---------- Health Check ----------
app.get('/', (req, res) => res.send('SpotMe Community + PeerJS Server läuft'));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
