// ══════════════════════════════════════════════════════════════════════════════
// SPOTME SERVER – PostgreSQL Version
//
// Neu in dieser Version:
//   • 24h Offline-Sichtbarkeit  → visible_until Timestamp pro Profil
//   • Offline-Nachrichten       → Nachricht hinterlassen wenn Nutzer offline
//
// Setup:
//   npm install pg
//   Render: DATABASE_URL wird automatisch gesetzt wenn du eine Postgres-DB
//           verlinkst. Lokal: DATABASE_URL=postgres://user:pass@localhost/spotme
// ══════════════════════════════════════════════════════════════════════════════

'use strict';

const express  = require('express');
const cors     = require('cors');
const crypto   = require('crypto');
const { ExpressPeerServer } = require('peer');
const { Pool } = require('pg');

const app = express();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} from ${req.ip}`);
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ---------- PeerJS ----------
const server = require('http').createServer(app);
const peerServer = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: true,
  proxied: true
});
app.use('/peerjs', peerServer);

// ---------- PostgreSQL Pool ----------
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('render.com')
    ? { rejectUnauthorized: false }
    : false
});

// ---------- Konstanten ----------
const OFFLINE_VISIBLE_MS  = 24 * 60 * 60 * 1000; // 24h Offline-Sichtbarkeit
const OFFLINE_MSG_MAX     = 280;                   // Max. Zeichen pro Nachricht
const OFFLINE_MSG_RATE_MS = 60 * 60 * 1000;        // 1 Nachricht/Sender/Empfänger/Stunde

// ---------- Tabellen anlegen (beim Start) ----------
async function initDB() {

  // Profiles — composite PK (code, spot) + visible_until
  await pool.query(`
    CREATE TABLE IF NOT EXISTS profiles (
      code          TEXT NOT NULL,
      spot          TEXT NOT NULL DEFAULT 'gay',
      name          TEXT NOT NULL,
      age           INTEGER,
      region        TEXT NOT NULL,
      province      TEXT,
      city          TEXT,
      orientation   TEXT,
      role          TEXT,
      trans         BOOLEAN DEFAULT FALSE,
      crossdresser         BOOLEAN DEFAULT FALSE,
      category      TEXT,
      bio           TEXT,
      token         TEXT NOT NULL,
      last_seen     BIGINT,
      updated_at    BIGINT NOT NULL,
      visible_until BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (code, spot)
    );
  `);

  // Verifikationen
  await pool.query(`
    CREATE TABLE IF NOT EXISTS verifications (
      id          SERIAL PRIMARY KEY,
      to_code     TEXT NOT NULL,
      to_spot     TEXT NOT NULL DEFAULT 'gay',
      from_code   TEXT NOT NULL,
      type        TEXT NOT NULL CHECK (type IN ('personal','chat')),
      created_at  BIGINT NOT NULL,
      UNIQUE(to_code, to_spot, from_code, type)
    );
  `);

  // Verpasste Anrufe
  await pool.query(`
    CREATE TABLE IF NOT EXISTS missed_calls (
      id          SERIAL PRIMARY KEY,
      recipient   TEXT NOT NULL,
      caller_id   TEXT NOT NULL,
      caller_name TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_missed_recipient ON missed_calls(recipient);
    CREATE INDEX IF NOT EXISTS idx_missed_created   ON missed_calls(created_at);
  `);

  // Offline-Nachrichten
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offline_messages (
      id          SERIAL PRIMARY KEY,
      recipient   TEXT NOT NULL,
      sender_code TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message     TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read        BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_offmsg_recipient ON offline_messages(recipient);
    CREATE INDEX IF NOT EXISTS idx_offmsg_created   ON offline_messages(created_at);
  `);

  console.log('✅ Datenbank-Tabellen bereit');
}

// ---------- Standort-Cache (RAM, 2-Min TTL) ----------
const locationCache = new Map();

// ---------- Cleanup (alle 2 Minuten) ----------
setInterval(async () => {
  const now = Date.now();

  // Standort-Cache
  for (const [key, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(key);
  }

  // Missed Calls älter als 7 Tage
  try {
    const r = await pool.query(`DELETE FROM missed_calls WHERE created_at < NOW() - INTERVAL '7 days'`);
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} alte Missed Calls gelöscht`);
  } catch (e) { console.error('Cleanup missed_calls:', e.message); }

  // Offline-Nachrichten älter als 7 Tage
  try {
    const r = await pool.query(`DELETE FROM offline_messages WHERE created_at < NOW() - INTERVAL '7 days'`);
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} alte Offline-Nachrichten gelöscht`);
  } catch (e) { console.error('Cleanup offline_messages:', e.message); }

  // Profile: visible_until abgelaufen UND last_seen > 30 Tage → löschen
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  try {
    const r = await pool.query(
      `DELETE FROM profiles WHERE visible_until < $1 AND COALESCE(last_seen, updated_at) < $2`,
      [now, thirtyDaysAgo]
    );
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} inaktive Profile gelöscht`);
  } catch (e) { console.error('Cleanup profiles:', e.message); }

}, 120000);

// ---------- Antispam: Links + E-Mails aus Nachrichten entfernen ----------
function sanitizeMessage(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/https?:\/\/\S+/gi, '[Link entfernt]')
    .replace(/\S+@\S+\.\S+/gi, '[E-Mail entfernt]')
    .slice(0, OFFLINE_MSG_MAX)
    .trim();
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMUNITY PROFILE
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/profiles?spot=gay
// Nur Profile mit visible_until > jetzt werden zurückgegeben
app.get('/api/profiles', async (req, res) => {
  const spot = req.query.spot || 'gay';
  const now  = Date.now();
  try {
    const { rows } = await pool.query(
      `SELECT code, name, age, region, province, city,
              orientation, role, trans, crossdresser, category, bio,
              last_seen, updated_at AS ts, visible_until,
              (COALESCE(last_seen, 0) > $2) AS is_online
       FROM profiles
       WHERE spot = $1 AND visible_until > $2
       ORDER BY is_online DESC, updated_at DESC`,
      [spot, now]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/profiles:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// POST /api/profile → anlegen oder updaten, setzt visible_until auf +24h
app.post('/api/profile', async (req, res) => {
  const {
    code, name, age, region, province, city,
    orientation, role, trans, crossdresser, category, bio,
    token, spot = 'gay'
  } = req.body;

  if (!code || !name || !region) {
    return res.status(400).json({ error: 'Pflichtfelder: code, name, region' });
  }

  const now          = Date.now();
  const visibleUntil = now + OFFLINE_VISIBLE_MS;

  try {
    const existing = await pool.query(
      'SELECT token FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );

    let profileToken;

    if (existing.rows.length > 0) {
      if (!token || existing.rows[0].token !== token) {
        return res.status(403).json({ error: 'Ungültiger Token' });
      }
      profileToken = token;
      await pool.query(
        `UPDATE profiles SET
          name=$1, age=$2, region=$3, province=$4, city=$5,
          orientation=$6, role=$7, trans=$8, crossdresser=$9,
          category=$10, bio=$11, updated_at=$12, visible_until=$13
         WHERE code=$14 AND spot=$15`,
        [
          name, age || null, region, province || null, city || null,
          orientation || null, role || null, !!trans, !!crossdresser,
          category || null, bio || null, now, visibleUntil, code, spot
        ]
      );
    } else {
      profileToken = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO profiles
          (code, spot, name, age, region, province, city,
           orientation, role, trans, crossdresser, category, bio,
           token, updated_at, visible_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
        [
          code, spot, name, age || null, region,
          province || null, city || null,
          orientation || null, role || null, !!trans, !!crossdresser,
          category || null, bio || null,
          profileToken, now, visibleUntil
        ]
      );
    }

    res.json({ success: true, token: profileToken, visibleUntil });
  } catch (e) {
    console.error('POST /api/profile:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// DELETE /api/profile/:code → sofort unsichtbar (visible_until = 0)
// Datensatz bleibt für Verifikationen erhalten
app.delete('/api/profile/:code', async (req, res) => {
  const { code } = req.params;
  const token = req.body?.token || req.headers['x-spotme-token'];
  const spot  = req.body?.spot  || req.query.spot || 'gay';

  try {
    const existing = await pool.query(
      'SELECT token FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    if (!token || existing.rows[0].token !== token) return res.status(403).json({ error: 'Ungültiger Token' });

    await pool.query(
      'UPDATE profiles SET visible_until = 0 WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    locationCache.delete(code + ':' + spot);
    res.json({ success: true });
  } catch (e) {
    console.error('DELETE /api/profile:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// GET /api/profile/:code
app.get('/api/profile/:code', async (req, res) => {
  const { code } = req.params;
  const spot = req.query.spot || 'gay';
  try {
    const { rows } = await pool.query(
      `SELECT code, name, age, region, province, city,
              orientation, role, trans, crossdresser, category, bio,
              updated_at AS ts, visible_until
       FROM profiles WHERE code = $1 AND spot = $2`,
      [code, spot]
    );
    if (!rows.length) return res.status(404).json({ error: 'Nicht gefunden' });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// LIVE-STANDORT (RAM, 2-Min TTL)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/location', (req, res) => {
  const { code, lat, lng, spot = 'gay' } = req.body;
  if (!code || lat == null || lng == null) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  locationCache.set(code + ':' + spot, { lat, lng, ts: Date.now() });
  res.json({ success: true });
});

app.get('/api/location/:code', (req, res) => {
  const { code } = req.params;
  const spot = req.query.spot || 'gay';
  const data = locationCache.get(code + ':' + spot);
  if (!data || Date.now() - data.ts > 120000) {
    return res.status(404).json({ error: 'Standort nicht verfügbar' });
  }
  res.json({ lat: data.lat, lng: data.lng });
});

// ══════════════════════════════════════════════════════════════════════════════
// HEARTBEAT & ONLINE-STATUS
// Heartbeat verlängert visible_until automatisch (GREATEST = nie verkürzen)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/heartbeat', async (req, res) => {
  const { code, spot = 'gay' } = req.body;
  if (!code) return res.status(400).json({ error: 'Code fehlt' });
  const now          = Date.now();
  const visibleUntil = now + OFFLINE_VISIBLE_MS;
  try {
    await pool.query(
      `UPDATE profiles
       SET last_seen = $1,
           visible_until = GREATEST(visible_until, $2)
       WHERE code = $3 AND spot = $4`,
      [now, visibleUntil, code, spot]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// Online = last_seen < 2 Minuten; visible = visible_until > jetzt
app.get('/api/online/:code', async (req, res) => {
  const { code } = req.params;
  const spot = req.query.spot || 'gay';
  try {
    const { rows } = await pool.query(
      'SELECT last_seen, visible_until FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    if (!rows.length) return res.json({ online: false, visible: false });
    const now     = Date.now();
    const online  = rows[0].last_seen && (now - Number(rows[0].last_seen)) < 120000;
    const visible = Number(rows[0].visible_until) > now;
    res.json({ online: !!online, visible, lastSeen: Number(rows[0].last_seen) });
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VERIFIKATIONEN
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/verify', async (req, res) => {
  const { fromCode, toCode, type, spot = 'gay' } = req.body;
  if (!fromCode || !toCode || !type) {
    return res.status(400).json({ error: 'Felder fehlen' });
  }
  try {
    await pool.query(
      `INSERT INTO verifications (to_code, to_spot, from_code, type, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (to_code, to_spot, from_code, type) DO NOTHING`,
      [toCode, spot, fromCode, type, Date.now()]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/verify:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.get('/api/verifications/:code', async (req, res) => {
  const { code } = req.params;
  const spot = req.query.spot || 'gay';
  try {
    const { rows } = await pool.query(
      `SELECT from_code AS "from", type, created_at AS ts
       FROM verifications
       WHERE to_code = $1 AND to_spot = $2
       ORDER BY created_at DESC`,
      [code, spot]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VERPASSTE ANRUFE
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/missed-call', async (req, res) => {
  const { recipient, callerId, callerName } = req.body;
  if (!recipient || !callerId || !callerName) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  try {
    await pool.query(
      `INSERT INTO missed_calls (recipient, caller_id, caller_name) VALUES ($1, $2, $3)`,
      [recipient, callerId, callerName]
    );
    await pool.query(
      `DELETE FROM missed_calls WHERE id IN (
         SELECT id FROM missed_calls WHERE recipient = $1
         ORDER BY created_at DESC OFFSET 500
       )`,
      [recipient]
    );
    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/missed-call:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

app.get('/api/missed-calls/:code', async (req, res) => {
  const { code } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT caller_id AS "callerId", caller_name AS "callerName",
              created_at AS timestamp
       FROM missed_calls WHERE recipient = $1
       ORDER BY created_at DESC LIMIT 50`,
      [code]
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// OFFLINE-NACHRICHTEN
//
// Ablauf:
//   1. Anruf läuft ins Leere (Nutzer offline)
//   2. Client zeigt "Nachricht hinterlassen?" Dialog
//   3. POST /api/offline-message speichert die Nachricht
//   4. Empfänger sieht beim nächsten Login ein Badge + Liste
//   5. GET /api/offline-messages/:code (mit Token) gibt die Nachrichten zurück
//   6. Als gelesen markieren via DELETE
//
// Antispam:
//   • Max 280 Zeichen, Links/E-Mails werden gefiltert
//   • Max 1 Nachricht pro Sender/Empfänger/Stunde
//   • Max 50 ungelesene Nachrichten pro Empfänger
//   • 7-Tage TTL (Cleanup-Intervall)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/offline-message
app.post('/api/offline-message', async (req, res) => {
  const { recipient, senderCode, senderName, message } = req.body;

  if (!recipient || !senderCode || !senderName || !message) {
    return res.status(400).json({ error: 'Fehlende Felder' });
  }
  if (recipient === senderCode) {
    return res.status(400).json({ error: 'Keine Nachricht an sich selbst' });
  }

  const clean = sanitizeMessage(message);
  if (!clean.length) {
    return res.status(400).json({ error: 'Nachricht ist leer nach Bereinigung' });
  }

  try {
    // Rate-Limit: 1 Nachricht pro Sender+Empfänger pro Stunde
    const rateCheck = await pool.query(
      `SELECT id FROM offline_messages
       WHERE sender_code = $1 AND recipient = $2
         AND created_at > NOW() - INTERVAL '1 hour'
       LIMIT 1`,
      [senderCode, recipient]
    );
    if (rateCheck.rows.length > 0) {
      return res.status(429).json({ error: 'Maximal 1 Nachricht pro Stunde pro Person' });
    }

    // Max 50 ungelesene pro Empfänger
    const countCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM offline_messages WHERE recipient = $1 AND read = FALSE`,
      [recipient]
    );
    if (Number(countCheck.rows[0].cnt) >= 50) {
      return res.status(429).json({ error: 'Postfach des Empfängers voll' });
    }

    await pool.query(
      `INSERT INTO offline_messages (recipient, sender_code, sender_name, message)
       VALUES ($1, $2, $3, $4)`,
      [recipient, senderCode, senderName.slice(0, 50), clean]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/offline-message:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// GET /api/offline-messages/:code?token=...&spot=...
app.get('/api/offline-messages/:code', async (req, res) => {
  const { code } = req.params;
  const token = req.query.token || req.headers['x-spotme-token'];
  const spot  = req.query.spot || 'gay';

  if (!token) return res.status(401).json({ error: 'Token fehlt' });

  try {
    const auth = await pool.query(
      'SELECT token FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    if (!auth.rows.length || auth.rows[0].token !== token) {
      return res.status(403).json({ error: 'Ungültiger Token' });
    }

    const { rows } = await pool.query(
      `SELECT id, sender_code AS "senderCode", sender_name AS "senderName",
              message, created_at AS timestamp, read
       FROM offline_messages
       WHERE recipient = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [code]
    );
    res.json(rows);
  } catch (e) {
    console.error('GET /api/offline-messages:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// DELETE /api/offline-message/:id → einzelne Nachricht als gelesen markieren
app.delete('/api/offline-message/:id', async (req, res) => {
  const { id } = req.params;
  const { code, token, spot = 'gay' } = req.body;

  if (!code || !token) return res.status(401).json({ error: 'Token fehlt' });

  try {
    const auth = await pool.query(
      'SELECT token FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    if (!auth.rows.length || auth.rows[0].token !== token) {
      return res.status(403).json({ error: 'Ungültiger Token' });
    }
    await pool.query(
      'UPDATE offline_messages SET read = TRUE WHERE id = $1 AND recipient = $2',
      [id, code]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// DELETE /api/offline-messages/:code → alle als gelesen markieren
app.delete('/api/offline-messages/:code', async (req, res) => {
  const { code } = req.params;
  const token = req.body?.token || req.headers['x-spotme-token'];
  const spot  = req.body?.spot  || 'gay';

  if (!token) return res.status(401).json({ error: 'Token fehlt' });

  try {
    const auth = await pool.query(
      'SELECT token FROM profiles WHERE code = $1 AND spot = $2',
      [code, spot]
    );
    if (!auth.rows.length || auth.rows[0].token !== token) {
      return res.status(403).json({ error: 'Ungültiger Token' });
    }
    await pool.query(
      'UPDATE offline_messages SET read = TRUE WHERE recipient = $1',
      [code]
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// START
// ══════════════════════════════════════════════════════════════════════════════

app.get('/', (req, res) => res.send('SpotMe PG-Server läuft ✅'));

const PORT = process.env.PORT || 3000;

initDB()
  .then(() => {
    server.listen(PORT, () => console.log(`🚀 Server läuft auf Port ${PORT}`));
  })
  .catch(e => {
    console.error('❌ DB-Initialisierung fehlgeschlagen:', e.message);
    process.exit(1);
  });
