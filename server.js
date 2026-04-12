const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');
const fs = require('fs');
const path = require('path');

const app = express();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

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

// ---------- Dateipfade ----------
const DATA_DIR = './data';
const MISSED_CALLS_FILE = path.join(DATA_DIR, 'missed_calls.json');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ---------- Verpasste Anrufe ----------
let missedCalls = [];
try {
  if (fs.existsSync(MISSED_CALLS_FILE)) {
    missedCalls = JSON.parse(fs.readFileSync(MISSED_CALLS_FILE, 'utf8'));
  }
} catch (e) { console.error('Fehler beim Laden der missed_calls.json:', e); }

function saveMissedCalls() {
  try {
    fs.writeFileSync(MISSED_CALLS_FILE, JSON.stringify(missedCalls, null, 2));
  } catch (e) { console.error('Fehler beim Speichern der missed_calls.json:', e); }
}

// ---------- Profile (mit Verifikationen & lastSeen) ----------
let profiles = new Map();

// Aus Datei laden, falls vorhanden
try {
  if (fs.existsSync(PROFILES_FILE)) {
    const data = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
    profiles = new Map(Object.entries(data));
    console.log(`📁 ${profiles.size} Profile aus Datei geladen`);
  }
} catch (e) { console.error('Fehler beim Laden der profiles.json:', e); }

function saveProfiles() {
  try {
    const obj = Object.fromEntries(profiles);
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2));
  } catch (e) { console.error('Fehler beim Speichern der profiles.json:', e); }
}

const locationCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [code, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(code);
  }
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  missedCalls = missedCalls.filter(call => new Date(call.timestamp).getTime() >= sevenDaysAgo);
  saveMissedCalls();
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
  const existing = profiles.get(code) || {};
  profiles.set(code, {
    ...existing,
    name, age, region, province, city, orientation, role,
    trans: !!trans, cross: !!cross, bio,
    updated: Date.now(),
    verifications: existing.verifications || []
  });
  saveProfiles();
  res.json({ success: true });
});

app.delete('/api/profile/:code', (req, res) => {
  const { code } = req.params;
  profiles.delete(code);
  locationCache.delete(code);
  saveProfiles();
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

// ---------- Heartbeat & Online-Status ----------
app.post('/api/heartbeat', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'Code fehlt' });
  const profile = profiles.get(code);
  if (profile) {
    profile.lastSeen = Date.now();
    profiles.set(code, profile);
    saveProfiles();
  }
  res.json({ success: true });
});

app.get('/api/online/:code', (req, res) => {
  const { code } = req.params;
  const profile = profiles.get(code);
  if (!profile || !profile.lastSeen) {
    return res.json({ online: false });
  }
  const online = (Date.now() - profile.lastSeen) < 120000; // 2 Minuten
  res.json({ online, lastSeen: profile.lastSeen });
});

// ---------- Verifikationen ----------
app.post('/api/verify', (req, res) => {
  const { fromCode, toCode, type } = req.body; // type: 'chat' oder 'personal'
  if (!fromCode || !toCode || !type) {
    return res.status(400).json({ error: 'Felder fehlen' });
  }
  if (!profiles.has(fromCode) || !profiles.has(toCode)) {
    return res.status(404).json({ error: 'Profil nicht gefunden' });
  }
  const targetProfile = profiles.get(toCode);
  if (!targetProfile.verifications) targetProfile.verifications = [];
  // Doppelte Verifikation verhindern
  const exists = targetProfile.verifications.some(v => v.from === fromCode && v.type === type);
  if (!exists) {
    targetProfile.verifications.push({ from: fromCode, type, ts: Date.now() });
    profiles.set(toCode, targetProfile);
    saveProfiles();
  }
  res.json({ success: true });
});

app.get('/api/verifications/:code', (req, res) => {
  const { code } = req.params;
  const profile = profiles.get(code);
  if (!profile) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(profile.verifications || []);
});

// ---------- Verpasste Anrufe ----------
app.post('/api/missed-call', (req, res) => {
  const { recipient, callerId, callerName } = req.body;
  if (!recipient || !callerId || !callerName) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  const entry = { recipient, callerId, callerName, timestamp: new Date().toISOString() };
  missedCalls.push(entry);
  if (missedCalls.length > 500) missedCalls.shift();
  saveMissedCalls();
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

app.get('/', (req, res) => res.send('SpotMe Community + PeerJS Server läuft'));

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server läuft auf Port ${PORT}`));
