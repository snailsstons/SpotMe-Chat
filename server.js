const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
const fs = require('fs');
const path = require('path');

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

// ---------- Dateipfad für verpasste Anrufe ----------
const DATA_DIR = '/data';
const MISSED_CALLS_FILE = path.join(DATA_DIR, 'missed_calls.json');

// Verzeichnis anlegen, falls nicht vorhanden
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Verpasste Anrufe laden ----------
let missedCalls = [];
try {
  if (fs.existsSync(MISSED_CALLS_FILE)) {
    const raw = fs.readFileSync(MISSED_CALLS_FILE, 'utf8');
    missedCalls = JSON.parse(raw);
    console.log(`📞 ${missedCalls.length} verpasste Anrufe geladen`);
  }
} catch (e) {
  console.error('Fehler beim Laden der missed_calls.json:', e);
}

// ---------- Speichern ----------
function saveMissedCalls() {
  try {
    fs.writeFileSync(MISSED_CALLS_FILE, JSON.stringify(missedCalls, null, 2));
  } catch (e) {
    console.error('Fehler beim Speichern der missed_calls.json:', e);
  }
}

// ---------- In-Memory Speicher ----------
const profiles = new Map();
const locationCache = new Map();

// ---------- Alte Einträge löschen ----------
setInterval(() => {
  const now = Date.now();
  for (const [code, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(code);
  }
  // Verpasste Anrufe nach 7 Tagen löschen
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const oldLength = missedCalls.length;
  missedCalls = missedCalls.filter(call => new Date(call.timestamp).getTime() >= sevenDaysAgo);
  if (missedCalls.length !== oldLength) saveMissedCalls();
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

// ---------- Verpasste Anrufe (persistent) ----------
app.post('/api/missed-call', (req, res) => {
  const { recipient, callerId, callerName } = req.body;
  if (!recipient || !callerId || !callerName) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  const entry = { recipient, callerId, callerName, timestamp: new Date().toISOString() };
  missedCalls.push(entry);
  if (missedCalls.length > 500) missedCalls.shift();
  saveMissedCalls(); // ⭐ Persistieren
  res.json({ success: true });
});

app.get('/api/missed-calls/:code', (req, res) => {
  const { code } = req.params;
  const userCalls = missedCalls
    .filter(call => call.recipient === code)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 50);
  res.json(userCalls);
});

// ---------- Health Check ----------
app.get('/', (req, res) => res.send('SpotMe Community + PeerJS Server läuft'));

// ---------- Start ----------
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
