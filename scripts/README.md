# SpotMe Scripts

Modulare JavaScript‑Dateien für die SpotMe PWA.

## 📁 Struktur & Ladereihenfolge (exakt)

Die Module müssen in dieser Reihenfolge geladen werden – Abhängigkeiten sind von oben nach unten aufgelöst.

| # | Datei | Beschreibung |
|---|-------|--------------|
| 1 | `config.js` | Globale Konstanten & Variablen (Server, PeerJS, State) |
| 2 | `utils.js` | Hilfsfunktionen (Toast, Escaping, Zeit, Haptik) |
| 3 | `storage.js` | localStorage‑Wrapper (Kontakte, Pending, Missed) |
| 4 | `ui-core.js` | Screen‑Management, Sheets, Status‑Badge, Menüs |
| 5 | `audio.js` | Klingelton‑Generator, Cache, Fallback‑Beep |
| 6 | `p2p-core.js` | PeerJS‑Initialisierung, Heartbeat, Verbindungsaufbau |
| 7 | `p2p-call.js` | Ein-/Ausgehende Anrufe, Klingelton, Nachricht hinterlassen |
| 8 | `p2p-message.js` | Textnachrichten, Typing‑Indikator, Data‑Dispatcher |
| 9 | `p2p-file.js` | Datei‑ & Audio‑Chunking, Fortschrittsbalken |
| 10 | `p2p-location.js` | Live‑Standort, Leaflet‑Karte, Entfernungsberechnung |
| 11 | `albums.js` | IndexedDB für Alben & Fotos, Galerie, Partner‑Alben |
| 12 | `backup.js` | Verschlüsselte Profilsicherung & Wiederherstellung |
| 13 | `voice.js` | Sprachnachrichten‑Aufnahme (MediaRecorder) |
| 14 | `ui-home.js` | Home‑Screen: Code, Eingabe, Letzte Chats, Missed |
| 15 | `ui-chat.js` | Chat‑Screen: Nachrichten rendern, Audio‑Player, Verlauf |
| 16 | `main.js` | Einstiegspunkt – initialisiert alle Module |

> ⚠️ **Wichtig:** `ui-home.js` **muss vor** `p2p-call.js` geladen werden, da `connectToPeer()` die Funktion `getDigits()` aus `ui-home.js` benötigt.

---

## 🌐 Wichtige globale Variablen (`config.js`)

| Variable | Typ | Bedeutung |
|----------|-----|-----------|
| `SERVER_HOST` | `string` | PeerJS‑Server (Render) |
| `API_BASE` | `string` | REST‑API Endpunkt |
| `myCode` | `string` | Eigener 6‑stelliger Code |
| `myName` | `string` | Eigenen Anzeigename |
| `myToken` | `string` | Authentifizierungs‑Token für API |
| `peer` | `Peer` | PeerJS‑Instanz |
| `conn` | `DataConnection` | Aktive Datenverbindung zum Partner |
| `peerReady` | `boolean` | `true` wenn PeerJS vollständig verbunden |
| `isOffline` | `boolean` | `true` wenn absichtlich offline oder Server nicht erreichbar |
| `partnerCode` | `string` | Code des aktuellen Chatpartners |
| `partnerName` | `string` | Anzeigename des Partners |
| `chatId` | `string` | Eindeutige ID des aktuellen Chats (`sm_<code1>_<code2>`) |
| `pendingMessages` | `array` | Nachrichten, die im lokalen Modus zwischengespeichert werden |
| `voiceEnabled` | `boolean` | Mikrofon‑Button ein-/ausgeblendet |
| `CHUNK` | `number` | Chunk‑Größe für Dateiübertragung (16 KB) |

---

## 🧠 Local‑First Verhalten

- Wenn `peerReady === false` oder der Server nicht erreichbar ist, wechselt die App **automatisch** in den **Lokalen Modus**.
- Der Header zeigt dann **`○ LOCAL`** an.
- Nachrichten werden in `pendingMessages` gespeichert und **automatisch gesendet**, sobald die Verbindung wiederhergestellt wird.
- Profile der Spots werden lokal im `localStorage` (`spot_cache_*`) zwischengespeichert und offline angezeigt.

---

## 🔗 Einbindung in `index.html`

```html
<script src="scripts/config.js"></script>
<script src="scripts/utils.js"></script>
<script src="scripts/storage.js"></script>
<script src="scripts/ui-core.js"></script>
<script src="scripts/audio.js"></script>
<script src="scripts/p2p-core.js"></script>
<script src="scripts/p2p-call.js"></script>
<script src="scripts/p2p-message.js"></script>
<script src="scripts/p2p-file.js"></script>
<script src="scripts/p2p-location.js"></script>
<script src="scripts/albums.js"></script>
<script src="scripts/backup.js"></script>
<script src="scripts/voice.js"></script>
<script src="scripts/ui-home.js"></script>
<script src="scripts/ui-chat.js"></script>
<script src="scripts/main.js"></script>
