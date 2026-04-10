const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();

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
const missedCalls = [];               // Array von { recipient, callerId, callerName, timestamp }

// ---------- Alte Einträge löschen ----------
setInterval(() => {
  const now = Date.now();
  // Locations nach 2 Minuten löschen
  for (const [code, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(code);
  }
  // Verpasste Anrufe nach 7 Tagen löschen
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  while (missedCalls.length && new Date(missedCalls[0].timestamp).getTime() < sevenDaysAgo) {
    missedCalls.shift();
  }
}, 120000);

// ---------- Community Profile ----------
app.get('/api/profiles', (req, res) => {
  const list = [];
  for (const [code, profile] of profiles.entries()) {
    list.push({ code, ...profile, ts: profile.updated || Date.now() });
  }
  res.json(list);
});

app.post('/api/profile', (req, res) => {
  const { code, name, age, region, province, city, orientation, role, trans, cross, bio } = req.body;
  if (!code || !name || !region) {
    return res.status(400).json({ error: 'Pflichtfelder: code, name, region' });
  }
  profiles.set(code, { name, age, region, province, city, orientation, role, trans: !!trans, cross: !!cross, bio, updated: Date.now() });
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

// ---------- Verpasste Anrufe (NEU) ----------
app.post('/api/missed-call', (req, res) => {
  const { recipient, callerId, callerName } = req.body;
  if (!recipient || !callerId || !callerName) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  const entry = {
    recipient,
    callerId,
    callerName,
    timestamp: new Date().toISOString()
  };
  missedCalls.push(entry);
  // Maximal 500 Einträge behalten
  if (missedCalls.length > 500) missedCalls.shift();
  res.json({ success: true });
});

app.get('/api/missed-calls/:code', (req, res) => {
  const { code } = req.params;
  const userCalls = missedCalls
    .filter(call => call.recipient === code)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50); // max. 50 Einträge zurückgeben
  res.json(userCalls);
});

// ---------- Health Check ----------
app.get('/', (req, res) => res.send('SpotMe Community + PeerJS Server läuft'));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
