# SpotMe Scripts

Modulare JavaScript-Dateien für die SpotMe PWA.

## Struktur & Ladereihenfolge

| Datei | Beschreibung |
|-------|--------------|
| `config.js` | Globale Konstanten & Variablen (Server, PeerJS, State) |
| `utils.js` | Hilfsfunktionen (Toast, Escaping, Zeit, Haptik) |
| `storage.js` | localStorage‑Wrapper (Kontakte, Pending, Missed) |
| `ui-core.js` | Screen‑Management, Sheets, Status‑Badge, Menüs |
| `audio.js` | Klingelton‑Generator, Cache, Fallback‑Beep |
| `p2p-core.js` | PeerJS‑Initialisierung, Heartbeat, Verbindungsaufbau |
| `p2p-call.js` | Ein-/Ausgehende Anrufe, Klingelton, Nachricht hinterlassen |
| `p2p-message.js` | Textnachrichten, Typing‑Indikator, Data‑Dispatcher |
| `p2p-file.js` | Datei‑ & Audio‑Chunking, Fortschrittsbalken |
| `p2p-location.js` | Live‑Standort, Leaflet‑Karte, Entfernungsberechnung |
| `albums.js` | IndexedDB für Alben & Fotos, Galerie, Partner‑Alben |
| `backup.js` | Verschlüsselte Profilsicherung & Wiederherstellung |
| `voice.js` | Sprachnachrichten‑Aufnahme (MediaRecorder) |
| `ui-home.js` | Home‑Screen: Code, Eingabe, Letzte Chats, Missed |
| `ui-chat.js` | Chat‑Screen: Nachrichten rendern, Audio‑Player, Verlauf |
| `main.js` | Einstiegspunkt – initialisiert alle Module |

## Einbindung

Die Dateien müssen in der oben angegebenen Reihenfolge in `index.html` geladen werden.
