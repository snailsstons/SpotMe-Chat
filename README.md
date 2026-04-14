# SpotMe · P2P Chat & Community Radar

**Dezentral. Verschlüsselt. Offline-fähig.**  
SpotMe ist eine Progressive Web App (PWA) für direkte Peer‑to‑Peer‑Chats und ein Community‑Radar – ganz ohne zentralen Server für die Kommunikation. Alle Daten bleiben bei dir, Verbindungen laufen direkt zwischen den Geräten.

![SpotMe Screenshot](https://via.placeholder.com/800x400?text=SpotMe+Preview)

## ✨ Highlights

- **Echter P2P‑Chat** – Direktverbindung via WebRTC (PeerJS), Ende‑zu‑Ende verschlüsselt.
- **Local‑First** – Funktioniert auch ohne Internet. Nachrichten werden lokal gespeichert und bei Verbindung automatisch synchronisiert.
- **Community‑Spots** – Entdecke Profile in deiner Nähe (Radar‑Ansicht) mit konfigurierbarem Radius.
- **Offline‑Profile** – Spots zeigen gespeicherte Profile auch ohne Serververbindung an.
- **Modular & wartbar** – Über 30 sauber getrennte JavaScript‑Module für maximale Übersicht.
- **PWA‑fähig** – Installierbar auf Android, iOS und Desktop. Service Worker für Offline‑Start.
- **Verifikation & Standort** – Persönliche Treffen bestätigen, Live‑Standort teilen, Entfernungsanzeige.

## 🚀 Live Demo

Die App läuft unter:  
👉 **[snailsstons.github.io](https://snailsstons.github.io/SpotME)**  

*(Server‑Komponente auf Render gehostet – kann beim ersten Aufruf ca. 30 Sekunden zum Aufwachen brauchen.)*

## 📦 Technologie‑Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| P2P‑Verbindung | PeerJS / WebRTC |
| Karten | Leaflet + OpenStreetMap |
| Datenbank (Backend) | PostgreSQL (nur für Profil‑ & Spot‑Daten) |
| Backend | Node.js + Express (Render) |
| PWA | Service Worker, Web App Manifest |
| Verschlüsselung | Web Crypto API (AES‑GCM für Backups) |

## 🧩 Projektstruktur
```markdown
# SpotMe · P2P Chat & Community Radar

**Dezentral. Verschlüsselt. Offline-fähig.**  
SpotMe ist eine Progressive Web App (PWA) für direkte Peer‑to‑Peer‑Chats und ein Community‑Radar – ganz ohne zentralen Server für die Kommunikation. Alle Daten bleiben bei dir, Verbindungen laufen direkt zwischen den Geräten.

![SpotMe Screenshot](https://via.placeholder.com/800x400?text=SpotMe+Preview)

## ✨ Highlights

- **Echter P2P‑Chat** – Direktverbindung via WebRTC (PeerJS), Ende‑zu‑Ende verschlüsselt.
- **Local‑First** – Funktioniert auch ohne Internet. Nachrichten werden lokal gespeichert und bei Verbindung automatisch synchronisiert.
- **Community‑Spots** – Entdecke Profile in deiner Nähe (Radar‑Ansicht) mit konfigurierbarem Radius.
- **Offline‑Profile** – Spots zeigen gespeicherte Profile auch ohne Serververbindung an.
- **Modular & wartbar** – Über 30 sauber getrennte JavaScript‑Module für maximale Übersicht.
- **PWA‑fähig** – Installierbar auf Android, iOS und Desktop. Service Worker für Offline‑Start.
- **Verifikation & Standort** – Persönliche Treffen bestätigen, Live‑Standort teilen, Entfernungsanzeige.

## 🚀 Live Demo

Die App läuft unter:  
👉 **[snailsstons.github.io](https://snailsstons.github.io/)**  

*(Server‑Komponente auf Render gehostet – kann beim ersten Aufruf ca. 30 Sekunden zum Aufwachen brauchen.)*

## 📦 Technologie‑Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | Vanilla JS (ES6+), HTML5, CSS3 |
| P2P‑Verbindung | PeerJS / WebRTC |
| Karten | Leaflet + OpenStreetMap |
| Datenbank (Backend) | PostgreSQL (nur für Profil‑ & Spot‑Daten) |
| Backend | Node.js + Express (Render) |
| PWA | Service Worker, Web App Manifest |
| Verschlüsselung | Web Crypto API (AES‑GCM für Backups) |

## 🧩 Projektstruktur

```

spotme/
├── index.html              # Haupt‑App (Chat & Home)
├── spot.html               # Community‑Radar (Gay)
├── spot-dates.html         # Radar für Dates
├── spot-general.html       # Radar für General
├── profil.html             # Profilverwaltung
├── portfolio.html          # Alben & Fotos
├── styles.css              # Globale Styles
├── spot.css                # Styles für Radar
├── manifest.json           # PWA‑Manifest
├── sw.js                   # Service Worker
├── scripts/                # Kern‑Module (Chat)
│   ├── config.js
│   ├── utils.js
│   ├── storage.js
│   ├── ui-core.js
│   ├── audio.js
│   ├── p2p-core.js
│   ├── p2p-call.js
│   ├── p2p-message.js
│   ├── p2p-file.js
│   ├── p2p-location.js
│   ├── albums.js
│   ├── backup.js
│   ├── voice.js
│   ├── ui-home.js
│   ├── ui-chat.js
│   └── main.js
├── scripts-spot/           # Module für Community‑Radar
│   ├── spot-config.js
│   ├── spot-state.js
│   ├── spot-utils.js
│   ├── spot-profile.js
│   ├── spot-location.js
│   ├── spot-community.js
│   ├── spot-render.js
│   ├── spot-messages.js
│   ├── spot-verify.js
│   ├── spot-kurznachricht.js
│   ├── spot-keepalive.js
│   ├── spot-init.js
│   ├── spot-gay.js
│   ├── spot-dates.js
│   └── spot-general.js
└── server.js               # Backend‑Server (Render)

```

## 🔒 Sicherheit & Datenschutz

- **Chat‑Inhalte** werden **niemals** auf einem Server gespeichert – reine P2P‑Übertragung.
- **Profil‑Daten** (für Community‑Radar) liegen in PostgreSQL, sind aber nach 24h Inaktivität nicht mehr sichtbar.
- **Backups** können mit **AES‑GCM** verschlüsselt exportiert werden.
- **Keine Werbung, kein Tracking** – Open Source & transparent.

## 🛠 Lokale Entwicklung

1. Repository klonen:
   ```bash
   git clone https://github.com/snailsstons/spotme.git
   cd spotme
```

1. Einen lokalen HTTP‑Server starten (z. B. mit Python):
   ```bash
   python3 -m http.server 8000
   ```
2. Im Browser öffnen: http://localhost:8000

Für die vollständige Funktion wird der PeerJS‑Server und das Backend benötigt. Diese laufen bereits unter spotme-pg-test.onrender.com. Für eigene Tests kannst du die SERVER_HOST und API_BASE in config.js anpassen.

🤝 Mitwirken

SpotMe ist ein Hobby‑Projekt – Beiträge sind herzlich willkommen!

· Issues für Fehler oder Feature‑Wünsche öffnen.
· Pull Requests mit Verbesserungen oder neuen Spots einreichen.
· Diskussionen im GitHub‑Tab nutzen.

📄 Lizenz

MIT License – siehe LICENSE Datei.

---

SpotMe – Chatte frei, entdecke deine Community, und das alles ohne zentrale Kontrolle.
Made with ☕ and lots of P2P love.

```

## 🔒 Sicherheit & Datenschutz

- **Chat‑Inhalte** werden **niemals** auf einem Server gespeichert – reine P2P‑Übertragung.
- **Profil‑Daten** (für Community‑Radar) liegen in PostgreSQL, sind aber nach 24h Inaktivität nicht mehr sichtbar.
- **Backups** können mit **AES‑GCM** verschlüsselt exportiert werden.
- **Keine Werbung, kein Tracking** – Open Source & transparent.

## 🛠 Lokale Entwicklung

1. Repository klonen:
   ```bash
   git clone https://github.com/snailsstons/spotme.git
   cd spotme
