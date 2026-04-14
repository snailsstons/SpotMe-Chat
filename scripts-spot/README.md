# SpotMe · Spot Scripts

Modulare JavaScript‑Dateien für die Spot‑Radar‑Seiten (Gay, Dates, General).

## 📁 Dateiübersicht & Ladereihenfolge

Die Module müssen in der angegebenen Reihenfolge geladen werden.

| # | Datei | Beschreibung |
|---|-------|--------------|
| 1 | `spot-config.js` | Globale Konstanten (API, Intervalle, Regionen) |
| 2 | `spot-state.js` | Alle globalen Variablen (Profile, Timer, Maps) |
| 3 | `spot-utils.js` | Hilfsfunktionen (Zeit, Escaping, Toast, Distanz) |
| 4 | `spot-profile.js` | Eigenes Profil laden & veröffentlichen |
| 5 | `spot-location.js` | Standortfreigabe, Karte, Check‑in |
| 6 | `spot-community.js` | Community laden, Cache, Filter |
| 7 | `spot-render.js` | Radar, Liste, Profil‑Detail rendern |
| 8 | `spot-messages.js` | Offline‑Nachrichten (Badge, Panel, Polling) |
| 9 | `spot-verify.js` | Verifikation (QR, Code‑Eingabe) |
| 10 | `spot-kurznachricht.js` | Kurznachricht‑Modal |
| 11 | `spot-keepalive.js` | Keepalive, Heartbeat, Auto‑Refresh |
| 12 | `spot-init.js` | Initialisierung & Event‑Listener |
| 13 | `spot-gay.js` | **Spot‑Konfiguration:** `SPOT = 'gay'` |
|    | `spot-dates.js` | **Spot‑Konfiguration:** `SPOT = 'dates'` |
|    | `spot-general.js` | **Spot‑Konfiguration:** `SPOT = 'general'` |

> ⚠️ **Wichtig:** Die Spot‑Konfiguration (`spot-xxx.js`) **muss als letztes** geladen werden, da sie die globalen Konstanten `SPOT` und `CACHE_KEY` definiert, die von allen anderen Modulen benötigt werden.

---

## 🔗 Einbindung in HTML

**Beispiel für `spot.html` (Gay‑Spot):**

```html
<script src="scripts-spot/spot-config.js"></script>
<script src="scripts-spot/spot-state.js"></script>
<script src="scripts-spot/spot-utils.js"></script>
<script src="scripts-spot/spot-profile.js"></script>
<script src="scripts-spot/spot-location.js"></script>
<script src="scripts-spot/spot-community.js"></script>
<script src="scripts-spot/spot-render.js"></script>
<script src="scripts-spot/spot-messages.js"></script>
<script src="scripts-spot/spot-verify.js"></script>
<script src="scripts-spot/spot-kurznachricht.js"></script>
<script src="scripts-spot/spot-keepalive.js"></script>
<script src="scripts-spot/spot-init.js"></script>
<script src="scripts-spot/spot-gay.js"></script>
