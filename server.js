// ══════════════════════════════════════════════════════════════════════════════
// SPOTME SERVER – PostgreSQL Version
//
// Features:
//   • 24h Offline-Sichtbarkeit  → visible_until Timestamp pro Profil
//   • Offline-Nachrichten       → Nachricht hinterlassen wenn Nutzer offline
//   • Dialog-Erkennung          → Sobald Antwort erfolgt, kein Stundenlimit mehr
//   • Ping-Endpunkt             → Für Heartbeat (Render Free Tier)
//   • Spot-Nachrichten          → type, source, spot_type Felder
//   • Dates-Spot                → looking_for Feld
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
  ssl: (process.env.DATABASE_URL?.includes('neon.tech') || 
        process.env.DATABASE_URL?.includes('render.com'))
    ? { rejectUnauthorized: false }
    : false,
  // 🆕 Neon-optimierte Pool-Einstellungen
  max: 3,                           // max 3 Verbindungen
  idleTimeoutMillis: 30000,         // Verbindung nach 30s schließen
  connectionTimeoutMillis: 5000     // 5s Timeout
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
      crossdresser  BOOLEAN DEFAULT FALSE,
      looking_for   TEXT,
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

  // Offline-Nachrichten – MIT type, source, spot_type
  await pool.query(`
    CREATE TABLE IF NOT EXISTS offline_messages (
      id          SERIAL PRIMARY KEY,
      recipient   TEXT NOT NULL,
      sender_code TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      message     TEXT NOT NULL,
      type        TEXT,
      source      TEXT,
      spot_type   TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      read        BOOLEAN NOT NULL DEFAULT FALSE
    );
    CREATE INDEX IF NOT EXISTS idx_offmsg_recipient ON offline_messages(recipient);
    CREATE INDEX IF NOT EXISTS idx_offmsg_created   ON offline_messages(created_at);
  `);

  // Falls Tabelle schon existiert, Spalten nachträglich hinzufügen
  try {
    await pool.query(`ALTER TABLE offline_messages ADD COLUMN IF NOT EXISTS type TEXT`);
    await pool.query(`ALTER TABLE offline_messages ADD COLUMN IF NOT EXISTS source TEXT`);
    await pool.query(`ALTER TABLE offline_messages ADD COLUMN IF NOT EXISTS spot_type TEXT`);
    await pool.query(`ALTER TABLE profiles ADD COLUMN IF NOT EXISTS looking_for TEXT`);
    console.log('✅ Spalten type, source, spot_type, looking_for bereit');
  } catch (e) {
    console.log('ℹ️ Spalten existieren bereits oder konnten nicht angelegt werden');
  }

  console.log('✅ Datenbank-Tabellen bereit');
}

// ---------- Standort-Cache (RAM, 2-Min TTL) ----------
const locationCache = new Map();

// ---------- Cleanup (alle 2 Minuten) ----------
setInterval(async () => {
  const now = Date.now();

  for (const [key, data] of locationCache.entries()) {
    if (now - data.ts > 120000) locationCache.delete(key);
  }

  try {
    const r = await pool.query(`DELETE FROM missed_calls WHERE created_at < NOW() - INTERVAL '7 days'`);
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} alte Missed Calls gelöscht`);
  } catch (e) { console.error('Cleanup missed_calls:', e.message); }

  try {
    const r = await pool.query(`DELETE FROM offline_messages WHERE created_at < NOW() - INTERVAL '7 days'`);
    if (r.rowCount > 0) console.log(`🧹 ${r.rowCount} alte Offline-Nachrichten gelöscht`);
  } catch (e) { console.error('Cleanup offline_messages:', e.message); }

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

app.get('/api/profiles', async (req, res) => {
  const spot = req.query.spot || 'gay';
  const now  = Date.now();
  try {
    const { rows } = await pool.query(
      `SELECT code, spot, name, age, region, province, city,
              orientation, role, trans, crossdresser,
              looking_for AS "lookingFor",
              category, bio,
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

app.post('/api/profile', async (req, res) => {
  const {
    code, name, age, region, province, city,
    orientation, role, trans, crossdresser, category, bio,
    lookingFor,
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
      if (!token) {
        await pool.query('DELETE FROM profiles WHERE code = $1 AND spot = $2', [code, spot]);
        existing.rows = [];
      } else if (existing.rows[0].token !== token) {
        return res.status(403).json({ error: 'Ungültiger Token' });
      } else {
        profileToken = token;
      }
    }
    if (existing.rows.length > 0) {
      await pool.query(
        `UPDATE profiles SET
          name=$1, age=$2, region=$3, province=$4, city=$5,
          orientation=$6, role=$7, trans=$8, crossdresser=$9,
          looking_for=$10,
          category=$11, bio=$12, updated_at=$13, visible_until=$14
         WHERE code=$15 AND spot=$16`,
        [
          name, age || null, region, province || null, city || null,
          orientation || null, role || null, !!trans, !!crossdresser,
          lookingFor || null,
          category || null, bio || null, now, visibleUntil, code, spot
        ]
      );
    } else {
      // Mitgeschickten Token übernehmen (globaler Account-Token),
      // sonst neuen generieren
      profileToken = token || crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO profiles
          (code, spot, name, age, region, province, city,
           orientation, role, trans, crossdresser, looking_for, category, bio,
           token, updated_at, visible_until)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
        [
          code, spot, name, age || null, region,
          province || null, city || null,
          orientation || null, role || null, !!trans, !!crossdresser,
          lookingFor || null,
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

app.get('/api/profile/:code', async (req, res) => {
  const { code } = req.params;
  const spot = req.query.spot || 'gay';
  try {
    const { rows } = await pool.query(
      `SELECT code, name, age, region, province, city,
              orientation, role, trans, crossdresser,
              looking_for AS "lookingFor",
              category, bio,
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
// OFFLINE-NACHRICHTEN (MIT SPOT-FELDERN)
// ══════════════════════════════════════════════════════════════════════════════

app.post('/api/offline-message', async (req, res) => {
  const { recipient, senderCode, senderName, message, type, source, spotType } = req.body;

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
    const dialogCheck = await pool.query(
      `SELECT id FROM offline_messages 
       WHERE sender_code = $1 AND recipient = $2
       LIMIT 1`,
      [recipient, senderCode]
    );

    if (dialogCheck.rows.length === 0) {
      const rateMinutes = Math.ceil(OFFLINE_MSG_RATE_MS / 60000);
      const rateCheck = await pool.query(
        `SELECT id FROM offline_messages
         WHERE sender_code = $1 AND recipient = $2
           AND created_at > NOW() - INTERVAL '${rateMinutes} minutes'
         LIMIT 1`,
        [senderCode, recipient]
      );
      if (rateCheck.rows.length > 0) {
        return res.status(429).json({ error: `Maximal 1 Nachricht pro ${rateMinutes > 1 ? rateMinutes + ' Minuten' : 'Minute'} für die erste Kontaktaufnahme` });
      }
    }

    const countCheck = await pool.query(
      `SELECT COUNT(*) AS cnt FROM offline_messages WHERE recipient = $1 AND read = FALSE`,
      [recipient]
    );
    if (Number(countCheck.rows[0].cnt) >= 50) {
      return res.status(429).json({ error: 'Postfach des Empfängers voll' });
    }

    await pool.query(
      `INSERT INTO offline_messages (recipient, sender_code, sender_name, message, type, source, spot_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [recipient, senderCode, senderName.slice(0, 50), clean, type || null, source || null, spotType || null]
    );

    res.json({ success: true });
  } catch (e) {
    console.error('POST /api/offline-message:', e.message);
    res.status(500).json({ error: 'Datenbankfehler' });
  }
});

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
              message, type, source, spot_type AS "spotType",
              created_at AS timestamp, read
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
// PING ENDPUNKTE (für Heartbeat – Render Free Tier)
// ══════════════════════════════════════════════════════════════════════════════

app.all('/ping', (req, res) => {
  res.status(204).end();
});

app.all('/api/ping', (req, res) => {
  res.status(204).end();
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
