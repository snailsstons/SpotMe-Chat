# SPOTME – Social Discovery Plattform 🃏✨

> **"SpotMe verbindet Menschen nicht durch Swipes, sondern durch echte Gespräche – mit einem öffentlichen Mini-Forum auf jedem Profil."**

SpotMe ist eine mobile, browserbasierte Social-Discovery-Plattform mit einem innovativen Tinder-Style Card-System. Das Herzstück sind die **Story-Kommentare**, die als natürliche Eisbrecher fungieren und das klassische Chat-Konzept um eine interaktive Komponente erweitern.

![Status](https://img.shields.io/badge/Status-Beta%204.1-pink?style=for-the-badge)
![Tech](https://img.shields.io/badge/Tech-Vanilla_JS_|_Node.js_|_PostgreSQL-blue?style=for-the-badge)

---

## 🎯 Was ist SpotMe?
SpotMe ist eine mobile Plattform für Social Discovery. Anstatt auf klassische, oft oberflächliche Chats zu setzen, nutzt SpotMe **öffentliche Story-Kommentare** als Gesprächsstarter. Jedes Profil fungiert als Mini-Forum, was Gespräche auf natürliche Weise einleitet.

---

## 🏗️ Technische Architektur

| Komponente | Technologie | Hosting / Plattform |
| :--- | :--- | :--- |
| **Frontend** | Vanilla JavaScript, HTML5, CSS3 | GitHub Pages |
| **Server** | Node.js mit Express | Render |
| **Datenbank** | PostgreSQL (Serverless) | Neon.tech |
| **Echtzeit** | PeerJS (WebRTC) | Voice/Video-Calls |
| **Sicherheit** | AES-256-CBC Verschlüsselung | Sensible Felder |
| **Bilder** | Base64, Client-Side Compression | Max 600px, JPEG 75% |
| **Auth** | Token-basiert | Globaler Token pro Nutzer |

---

## 🃏 Die Card-Ansicht (Kern-Feature)

### Vorderseite
* **Profilbild:** Dynamisches `object-fit` (Formaterkennung).
* **Details:** Name, Alter, Stadt, Region.
* **Badges:** Kategorien wie Beziehung, Freundschaft oder Casual.
* **Bio:** Kurzbeschreibung als Teaser.
* **Aktionen:** ✉️ Kurznachricht-Button (Direkt-Input) & ❤️ Notieren (localStorage).

### Rückseite (v4.0)
* **📖 Story:** Die Bio als Gesprächsstarter, grafisch hervorgehoben.
* **💬 Kommentare:** Öffentliches Mini-Forum.
    * Max. 140 Zeichen pro Kommentar.
    * Interaktive Mini-Avatare (klickbar).
    * Moderation: Profilinhaber kann Kommentare löschen.
* **Aktionen:** Direkter Zugriff auf Chat & Kurznachricht.

---

## 👆 Gesten-Steuerung (v4.1)

| Geste | Aktion |
| :--- | :--- |
| **Doppeltap (außerhalb Bild)** | Karte flippen (Vorder-/Rückseite) |
| **Doppeltap (auf Bild)** | Vollbild-Vorschau des Avatars |
| **Swipe links/rechts** | Nächste/Vorherige Karte |
| **Pinch (2 Finger)** | Kurznachricht-Overlay öffnen |
| **❤️ Herz-Tap** | Profil lokal speichern |
| **◀ ▶ Buttons** | Alternative Navigation |

*Hinweis: Auf der Rückseite sind Gesten deaktiviert, um natives Scrollen durch Kommentare zu ermöglichen.*

---

## 🎨 Drei Spots (Communities)

| Spot | Status | Farbe | Funktion |
| :--- | :--- | :--- | :--- |
| **💕 Dates** | ✅ Live | Pink (#ff4f7b) | Dating mit Card-Ansicht & Story-Kommentaren |
| **🏳️‍🌈 Gay** | ⏳ Vorbereitet | Lila | Orientation/Role-Filter |
| **🤝 General** | ⏳ Vorbereitet | Blau | Nachbarschaftshilfe (Biete/Suche) |

---

## 💬 Kommunikations-Features
* **Story-Kommentare:** Öffentliche Reaktionen auf die Bio (kein Match nötig).
* **Kurznachricht:** Private 280-Zeichen-Nachricht (Offline-fähig).
* **Chat:** Direkter 1:1-Echtzeit-Chat.
* **Voice/Video:** PeerJS-basierte Anrufe direkt im Browser.

---

## 🖼️ Avatar-System & Technik
* **Kompression:** Bilder werden vor dem Upload clientseitig komprimiert (max. 600px Breite).
* **Moderation:** Admin-Workflow für die Avatar-Freigabe (Pending → Approved).
* **Caching:** Schnelle Anzeige durch Avatar- und Comment-Cache (2 Min TTL).
* **Offline-Fallback:** Nutzung von `localStorage` für Profile und Avatare bei Verbindungsverlust.

---

## 📊 Datenbank (PostgreSQL)
* `profiles`: Stammdaten, Avatare, Verschlüsselungstags.
* `profile_comments`: Öffentliche Interaktionen.
* `offline_messages`: Zwischengespeicherte Privatnachrichten.
* `missed_calls`: Historie verpasster WebRTC-Anrufe.

---

## 🛡️ Sicherheit
* **Verschlüsselung:** AES-256-CBC für Namen, Bios und Orientierung.
* **Antispam:** Automatisches Filtern von Links und E-Mail-Adressen.
* **Moderation:** Token-basierte Auth für alle Schreibzugriffe und Admin-Endpoints.

---

## 🚀 Aktueller Stand (Beta 4.1)
- [x] Card-Ansicht (Flip, Swipe, Pinch, Notieren)
- [x] Story & Kommentare inklusive Mini-Avatare
- [x] Clientseitige Bildkompression & Upload
- [x] Lokales Caching & Sofort-Start-Logik
- [x] Admin-Backend für Moderation

---

## 📝 Nächste Schritte
1. Aktivierung des **Gay-Spots** mit spezifischen Filtern.
2. Rollout des **General-Spots** für Networking.
3. Implementierung der **Web Push API** für Benachrichtigungen.
4. Grafische Admin-Oberfläche (`admin.html`) zur Moderation.

---
*Erstellt für das SPOTME-Projekt.*
