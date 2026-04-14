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
