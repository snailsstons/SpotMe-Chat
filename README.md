# SpotMe – Die komplette Projektdokumentation

**P2P‑Chat & Community‑Radar · Dezentral, verschlüsselt, offline‑fähig**

---

## 📖 Inhaltsverzeichnis

1. [Über SpotMe](#über-spotme)
2. [Live Demo & Technologie‑Stack](#live-demo--technologie-stack)
3. [Projektstruktur](#projektstruktur)
4. [Kern‑Module (`/scripts`)](#kern-module-scripts)
   - [Ladereihenfolge & Beschreibung](#ladereihenfolge--beschreibung)
   - [Wichtige globale Variablen](#wichtige-globale-variablen)
5. [Spot‑Module (`/scripts-spot`)](#spot-module-scripts-spot)
   - [Ladereihenfolge & Beschreibung](#ladereihenfolge--beschreibung-1)
   - [Wichtige globale Variablen (Spots)](#wichtige-globale-variablen-spots)
6. [Local‑First Prinzip](#local-first-prinzip)
7. [Sicherheit & Datenschutz](#sicherheit--datenschutz)
8. [Lokale Entwicklung](#lokale-entwicklung)
9. [Mitwirken & Lizenz](#mitwirken--lizenz)

---

## Über SpotMe

SpotMe ist eine **Progressive Web App (PWA)** für direkte Peer‑to‑Peer‑Chats und ein Community‑Radar – ganz ohne zentralen Server für die Kommunikation. Alle Daten bleiben beim Nutzer, Verbindungen laufen direkt zwischen den Geräten via **WebRTC / PeerJS**.

### ✨ Highlights

- **Echter P2P‑Chat** – Ende‑zu‑Ende verschlüsselt, keine Chat‑Inhalte auf Servern.
- **Local‑First** – Funktioniert auch ohne Internet. Nachrichten werden gespeichert und später automatisch synchronisiert.
- **Community‑Spots** – Profile in der Nähe entdecken (Radar‑Ansicht), konfigurierbarer Radius.
- **Offline‑Profile** – Spots zeigen gespeicherte Profile auch ohne Serververbindung.
- **Modular & wartbar** – Über 30 sauber getrennte JavaScript‑Module.
- **PWA‑fähig** – Installierbar auf Android, iOS und Desktop. Service Worker für Offline‑Start.
- **Verifikation & Standort** – Persönliche Treffen bestätigen, Live‑Standort teilen, Entfernungsanzeige.

---

## Live Demo & Technologie‑Stack

**Demo:** [snailsstons.github.io](https://snailsstons.github.io/)  
*(Backend auf Render – kann beim ersten Aufruf ca. 30 Sekunden zum Aufwachen brauchen.)*

| Bereich | Technologie |
|---------|-------------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| P2P‑Verbindung | PeerJS / WebRTC |
| Karten | Leaflet + OpenStreetMap |
| Datenbank (Backend) | PostgreSQL (nur für Profil‑ & Spot‑Daten) |
| Backend | Node.js + Express (Render) |
| PWA | Service Worker, Web App Manifest |
| Verschlüsselung | Web Crypto API (AES‑GCM für Backups) |

---


---

## Kern‑Module (`/scripts`)

Die Module der Haupt‑App steuern den P2P‑Chat, die Benutzeroberfläche und die lokale Datenspeicherung.

### Ladereihenfolge & Beschreibung

| # | Datei | Beschreibung |
|---|-------|--------------|
| 1 | `config.js` | Globale Konstanten & Variablen (Server, PeerJS, State) |
| 2 | `utils.js` | Hilfsfunktionen (Toast, Escaping, Zeit, Haptik) |
| 3 | `storage.js` | localStorage‑Wrapper (Kontakte, Pending, Missed) |
| 4 | `ui-core.js` | Screen‑Management, Sheets, Status‑Badge, Menüs |
| 5 | `audio.js` | Klingelton‑Generator, Cache, Fallback‑Beep |
| 6 | `p2p-core.js` | PeerJS‑Initialisierung, Heartbeat, Verbindungsaufbau |
| 7 | `p2p-call.js` | Ein‑/Ausgehende Anrufe, Klingelton, Nachricht hinterlassen |
| 8 | `p2p-message.js` | Textnachrichten, Typing‑Indikator, Data‑Dispatcher |
| 9 | `p2p-file.js` | Datei‑ & Audio‑Chunking, Fortschrittsbalken |
| 10 | `p2p-location.js` | Live‑Standort, Leaflet‑Karte, Entfernungsberechnung |
| 11 | `albums.js` | IndexedDB für Alben & Fotos, Galerie, Partner‑Alben |
| 12 | `backup.js` | Verschlüsselte Profilsicherung & Wiederherstellung |
| 13 | `voice.js` | Sprachnachrichten‑Aufnahme (MediaRecorder) |
| 14 | `ui-home.js` | Home‑Screen: Code, Eingabe, Letzte Chats, Missed |
| 15 | `ui-chat.js` | Chat‑Screen: Nachrichten rendern, Audio‑Player, Verlauf |
| 16 | `main.js` | Einstiegspunkt – initialisiert alle Module |

> ⚠️ **Wichtig:** `ui-home.js` muss **vor** `p2p-call.js` geladen werden, da `connectToPeer()` die Funktion `getDigits()` aus `ui-home.js` benötigt.

### Einbindung in `index.html`

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

SERVER_HOST    string   PeerJS‑Server (Render)
API_BASE       string   REST‑API Endpunkt
myCode         string   Eigener 6‑stelliger Code
myName         string   Eigener Anzeigename
myToken        string   Authentifizierungs‑Token für API
peer           Peer     PeerJS‑Instanz
conn           DataConnection  Aktive Datenverbindung zum Partner
peerReady      boolean  true wenn PeerJS vollständig verbunden
isOffline      boolean  true wenn absichtlich offline oder Server nicht erreichbar
partnerCode    string   Code des aktuellen Chatpartners
partnerName    string   Anzeigename des Partners
chatId         string   Eindeutige ID des aktuellen Chats (sm_<code1>_<code2>)
pendingMessages array   Nachrichten, die im lokalen Modus zwischengespeichert werden
voiceEnabled   boolean  Mikrofon‑Button ein-/ausgeblendet
CHUNK          number   Chunk‑Größe für Dateiübertragung (16 KB)
