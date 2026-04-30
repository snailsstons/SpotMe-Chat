# SpotMe – Card & Filter Scripts (v4.3)

## 📂 Datei-Struktur

| Datei | Inhalt | Zeilen |
|-------|--------|--------|
| `spot-dates-card.js` | Card-Rendering, Gesten, Avatar, Kommentare, Notieren, CSS | ~700 |
| `spot-dates-filter.js` | Filter-Logik, Filter-Modal, lokales Filtern | ~250 |

---

## 🃏 `spot-dates-card.js` – Card-Ansicht

### State & Konstanten
| Variable | Typ | Beschreibung |
|----------|-----|-------------|
| `API_BASE` | `const` | Server-URL |
| `NOTED_KEY` | `const` | localStorage-Key für notierte Profile |
| `notedProfiles` | `let` | Array der notierten Profil-Codes |
| `currentIndex` | `let` | Aktuelle Card-Position |
| `avatarCache` | `Map` | Avatar-Base64-Cache |
| `COMMENTS_CACHE` | `Map` | Kommentar-Cache (2 Min TTL) |

### Funktionen
| Funktion | Typ | Beschreibung |
|----------|-----|-------------|
| `preloadMyProfile()` | IIFE | Eigenes Profil aus localStorage vorab laden |
| `loadCardAvatar(code)` | `async` | Avatar vom Server laden & cachen |
| `preloadAvatar(code)` | `void` | Avatar im Hintergrund laden |
| `preloadNextProfiles()` | `void` | Nächste 20 Profile + Avatare preloaden |
| `renderList()` | `window` | Card-Container + Navigation rendern |
| `renderCurrentCard()` | `void` | Einzelne Card (Vorder-/Rückseite) rendern |
| `toggleNotedModal()` | `window` | 🔖 Modal mit notierten Profilen |
| `toggleNote(code)` | `void` | ❤️ Profil notieren/entfernen |
| `renderNotedSection()` | `void` | Wird jetzt via Modal angezeigt |
| `showNotedProfile(code)` | `void` | Zu notiertem Profil springen |
| `showMyProfile()` | `window` | 👤 Eigenes Profil als erste Karte |
| `initCardSwipe()` | `void` | Touch-Gesten (Swipe, Doppeltap, Pinch) |
| `handlePinch()` | `void` | Pinch → Kurznachricht |
| `showFullscreenAvatar()` | `void` | Bild-Vollbild via Doppeltap |
| `loadComments(code)` | `async` | Kommentare vom Server laden |
| `submitComment()` | `async` | Kommentar senden |
| `deleteComment()` | `async` | Kommentar löschen (nur Owner) |
| `renderCommentsSection()` | `string` | Kommentar-HTML generieren |
| `renderAndLoadCommentAvatars()` | `void` | Kommentare + Mini-Avatare rendern |
| `showCommenterProfile()` | `window` | Zum Profil eines Kommentators springen |
| `submitCommentHandler()` | `window` | Kommentar-Formular-Handler |
| `handleDeleteComment()` | `window` | Kommentar-Löschen-Handler |
| `escHtml(str)` | `string` | HTML-Escaping |
| `getTouchDistance(e)` | `number` | Pinch-Distanz berechnen |

### Globale Handler (window)
- `window.renderList`
- `window.toggleNotedModal`
- `window.showCommenterProfile`
- `window.submitCommentHandler`
- `window.handleDeleteComment`
- `window.showMyProfile`

### Gesten
| Geste | Aktion |
|-------|--------|
| **Doppeltap** (außerhalb Bild) | Card flipsen |
| **Doppeltap** (auf Bild) | Vollbild-Vorschau |
| **Swipe** (>80px) | Nächste/Vorherige Karte |
| **Pinch** (2 Finger) | Kurznachricht schreiben |
| **❤️ Herz-Tap** | Profil notieren |
| **🔍 Lupe-Tap** | Filter-Modal öffnen |
| **🔖 Lesezeichen-Tap** | Notierte-Modal öffnen |

### CSS-Klassen (Auszug)
- `.card-swipe-container` – Card-Container (550px Höhe)
- `.card-inner` – 3D-Flip-Container
- `.card-front`, `.card-back` – Vorder-/Rückseite
- `.card-image-container` – Bildbereich (60% Höhe)
- `.card-heart` – ❤️ Button (80×80px)
- `.card-search` – 🔍 Button (80×80px)
- `.card-noted` – 🔖 Button (80×80px)
- `.online-badge` – 🟢 Online-Indikator
- `.comment-avatar-mini` – 30×30px Mini-Avatar
- `.card-chat-btn` – ✉️ Kurznachricht (grün)
- `.close-back-btn` – ✕ Schließen (grün-transparent)

---

## 🔍 `spot-dates-filter.js` – Filter & Modal

### State & Konstanten
| Variable | Typ | Beschreibung |
|----------|-----|-------------|
| `FILTER_KEY` | `const` | localStorage-Key für Filter-State |
| `filtersInitialized` | `let` | Ob Filter bereits initialisiert |

### Funktionen
| Funktion | Typ | Beschreibung |
|----------|-----|-------------|
| `saveFilterState()` | `void` | Filter in localStorage speichern |
| `loadFilterState()` | `object\|null` | Filter aus localStorage laden |
| `renderFilterSection()` | `void` | Inline-Filter (versteckt) rendern |
| `handleFilterChange()` | `void` | Bei Select-Änderung |
| `handleChipClick(chip)` | `void` | Chip toggeln |
| `handleFilterReset()` | `void` | Alle Filter zurücksetzen |
| `applyFiltersLocal()` | `void` | **Kern-Funktion**: Profile lokal filtern |
| `toggleFilterModal()` | `window` | 🔍 Lupe-Modal öffnen/schließen |
| `applyModalFilters()` | `window` | Filter aus Modal übernehmen |
| `resetModalFilters()` | `window` | Modal-Filter zurücksetzen |

### Globale Handler (window)
- `window.toggleChip`
- `window.resetFilters`
- `window.applyFilters`
- `window.toggleFilterModal`
- `window.applyModalFilters`
- `window.resetModalFilters`

### Filter-Logik (`applyFiltersLocal`)
Die Funktion filtert `allProfiles` nach:
1. Eigenes Profil ausschließen (`myCode`)
2. **Region** – exakte Übereinstimmung
3. **Altersgruppe** – 18-29, 30-39, 40-49, 50+
4. **Date-Chips** – beziehung, freundschaft, casual

Setzt `filtered[]` und ruft `renderList()` auf.

### Abhängigkeiten
- `allProfiles` (aus `spot-dates-card.js`)
- `myCode` (aus `spot-config.js`)
- `filtered` (wird hier gesetzt)
- `currentIndex` (wird hier zurückgesetzt)
- `REGIONS` (aus `spot-config.js`)
- `renderList()` (aus `spot-dates-card.js`)

---

## 🔗 Einbindung in HTML

```html
<!-- Filter-Logik ZUERST laden -->
<script src="scripts-spot/spot-dates-filter.js"></script>
<!-- Card-Logik DANACH laden -->
<script src="scripts-spot/spot-dates-card.js"></script>
