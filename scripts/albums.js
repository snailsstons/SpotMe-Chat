'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – ALBEN & FOTOS (albums.js)
// IndexedDB, Album-Menü, Partner-Alben, Galerie-Overlay
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// INDEXEDDB – INITIALISIERUNG
let db = null;
const DB_NAME = 'SpotMeDB';
const DB_VERSION = 3;

function initDB() {
  return new Promise((resolve, reject) => {
    if (db && !db.isClosed) return resolve();
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      db = req.result;
      resolve();
    };
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('albums')) {
        const albumStore = db.createObjectStore('albums', { autoIncrement: true });
        albumStore.createIndex('by_name', 'name');
      }
      if (!db.objectStoreNames.contains('photos')) {
        const photoStore = db.createObjectStore('photos', { autoIncrement: true });
        photoStore.createIndex('by_album', 'albumId');
      }
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ALBUM OPERATIONEN
async function getAllAlbums() {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readonly');
    const store = tx.objectStore('albums');
    const albums = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        albums.push({ id: cursor.key, ...cursor.value });
        cursor.continue();
      } else {
        resolve(albums);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function getPhotosByAlbum(albumId) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readonly');
    const store = tx.objectStore('photos');
    const index = store.index('by_album');
    const range = IDBKeyRange.only(albumId);
    const photos = [];
    const cursorReq = index.openCursor(range);
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        photos.push({ id: cursor.key, ...cursor.value });
        cursor.continue();
      } else {
        resolve(photos);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function createAlbum(name) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');
    const album = {
      name: name.trim(),
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const req = store.add(album);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteAlbum(id) {
  await initDB();
  await deletePhotosByAlbum(id);
  return new Promise((resolve, reject) => {
    const tx = db.transaction('albums', 'readwrite');
    const store = tx.objectStore('albums');
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(albumId, dataURL, name) {
  await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('photos', 'readwrite');
    const store = tx.objectStore('photos');
    const photo = {
      albumId,
      dataURL,
      name,
      timestamp: Date.now()
    };
    const req = store.add(photo);
    req.onsuccess = () => {
      updateAlbumTimestamp(albumId);
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

async function updateAlbumTimestamp(albumId) {
  const tx = db.transaction('albums', 'readwrite');
  const store = tx.objectStore('albums');
  const getReq = store.get(albumId);
  getReq.onsuccess = () => {
    const album = getReq.result;
    if (album) {
      album.updatedAt = Date.now();
      store.put(album, albumId);
    }
  };
}

async function deletePhotosByAlbum(albumId) {
  const photos = await getPhotosByAlbum(albumId);
  for (const p of photos) {
    await new Promise((resolve, reject) => {
      const tx = db.transaction('photos', 'readwrite');
      const store = tx.objectStore('photos');
      const req = store.delete(p.id);
      req.onsuccess = resolve;
      req.onerror = reject;
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ALBUM-MENÜ (Chat)
function showAlbumMenu() {
  if (!conn || !conn.open) {
    toast('⚠️ Keine aktive Verbindung');
    return;
  }
  const body = document.getElementById('album-menu-body');
  body.innerHTML = `
    <button class="sitem" onclick="window.open('portfolio.html','_blank'); closeAlbumMenu();">
      <div class="sico si-g">📁</div><div class="slab"><div>Meine Alben</div><div class="sdesc">Verwalten & neue Fotos hinzufügen</div></div>
    </button>
    <div class="ssep"></div>
    <button class="sitem" onclick="requestPartnerAlbums(); closeAlbumMenu();">
      <div class="sico si-g">👥</div><div class="slab"><div>Alben von ${partnerName}</div><div class="sdesc">Durchstöbern</div></div>
    </button>
  `;
  document.getElementById('album-menu-ovl').classList.add('open');
  document.getElementById('album-menu-sheet').classList.add('open');
}

function closeAlbumMenu() {
  document.getElementById('album-menu-ovl').classList.remove('open');
  document.getElementById('album-menu-sheet').classList.remove('open');
}

function requestPartnerAlbums() {
  if (!conn || !conn.open) return toast('Keine Verbindung');
  conn.send({ t: 'album_list_request' });
  toast('📡 Fordere Alben an...');
}

// ─────────────────────────────────────────────────────────────────────────────
// PARTNER-ALBEN ANZEIGEN
let partnerAlbumsList = [];

function showPartnerAlbumsSheet(albums) {
  partnerAlbumsList = albums;
  const title = document.getElementById('partner-albums-title');
  title.textContent = `Alben von ${partnerName}`;
  const body = document.getElementById('partner-albums-body');
  if (!albums.length) {
    body.innerHTML = '<div class="sitem" style="justify-content:center;color:var(--muted);">Keine Alben vorhanden</div>';
  } else {
    body.innerHTML = albums.map(album => `
      <button class="sitem" onclick="selectPartnerAlbum(${album.id})">
        <div class="sico si-g">🖼️</div>
        <div class="slab"><div>${escapeHtml(album.name)}</div><div class="sdesc">${album.photoCount || 0} Foto${album.photoCount !== 1 ? 's' : ''}</div></div>
      </button>
    `).join('');
  }
  document.getElementById('partner-albums-ovl').classList.add('open');
  document.getElementById('partner-albums-sheet').classList.add('open');
}

function closePartnerAlbumsSheet() {
  document.getElementById('partner-albums-ovl').classList.remove('open');
  document.getElementById('partner-albums-sheet').classList.remove('open');
}

function selectPartnerAlbum(albumId) {
  closePartnerAlbumsSheet();
  if (!conn || !conn.open) return toast('Verbindung unterbrochen');
  conn.send({ t: 'album_images_request', albumId });
  toast('📥 Lade Bilder...');
  showImageOverlayLoader();
}

function showImageOverlayLoader() {
  const old = document.getElementById('dynamic-gallery-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.className = 'gallery-overlay';
  overlay.id = 'dynamic-gallery-overlay';
  overlay.innerHTML = `<div class="loading-spinner"></div>`;
  document.body.appendChild(overlay);
}

// ─────────────────────────────────────────────────────────────────────────────
// GALERIE (Bilder anzeigen)
let currentGalleryImages = [];
let currentGalleryIndex = 0;

function buildGallery(images) {
  if (!images.length) return;
  currentGalleryImages = images;
  currentGalleryIndex = 0;
  const overlay = document.getElementById('dynamic-gallery-overlay');
  if (!overlay) return;

  const updateImage = () => {
    const img = currentGalleryImages[currentGalleryIndex];
    overlay.innerHTML = `
      <div class="close-gallery" onclick="closeGallery()">✕</div>
      <div class="gallery-counter">${currentGalleryIndex + 1} / ${currentGalleryImages.length}</div>
      <div class="gallery-image-container"><img src="${img.dataURL}" alt="${escapeHtml(img.name)}" id="gallery-main-image"></div>
      <div class="gallery-controls">
        ${currentGalleryImages.length > 1 ? `<button class="gallery-btn" onclick="prevGalleryImage()">◀</button>` : '<div style="width:52px"></div>'}
        <div class="gallery-dots" id="gallery-dots"></div>
        ${currentGalleryImages.length > 1 ? `<button class="gallery-btn" onclick="nextGalleryImage()">▶</button>` : '<div style="width:52px"></div>'}
      </div>
    `;
    const imgEl = document.getElementById('gallery-main-image');
    if (imgEl) {
      let touchStartX = 0;
      imgEl.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
      }, { passive: true });
      imgEl.addEventListener('touchend', (e) => {
        if (!touchStartX) return;
        const diff = e.changedTouches[0].clientX - touchStartX;
        if (Math.abs(diff) > 50) {
          if (diff > 0) prevGalleryImage();
          else nextGalleryImage();
        }
        touchStartX = 0;
      });
    }
    updateDots();
  };

  window.prevGalleryImage = () => {
    if (currentGalleryIndex > 0) {
      currentGalleryIndex--;
      updateImage();
    }
  };
  window.nextGalleryImage = () => {
    if (currentGalleryIndex < currentGalleryImages.length - 1) {
      currentGalleryIndex++;
      updateImage();
    }
  };
  window.updateDots = () => {
    const dots = document.getElementById('gallery-dots');
    if (dots) {
      dots.innerHTML = currentGalleryImages.map((_, i) =>
        `<span class="gallery-dot ${i === currentGalleryIndex ? 'active' : ''}" onclick="setGalleryIndex(${i})"></span>`
      ).join('');
    }
  };
  window.setGalleryIndex = (idx) => {
    currentGalleryIndex = idx;
    updateImage();
  };
  window.closeGallery = () => {
    overlay.remove();
    currentGalleryImages = [];
  };

  updateImage();
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNKING FÜR ALBUM-BILDER (Empfang)
let pendingAlbumChunks = new Map();
let pendingAlbumMeta = new Map();

function handleAlbumImageChunk(d) {
  const key = `${d.albumId}_${d.photoId}`;
  let entry = pendingAlbumChunks.get(key);
  if (!entry) {
    entry = {
      chunks: new Array(d.total),
      total: d.total,
      name: d.name,
      albumId: d.albumId,
      photoId: d.photoId
    };
    pendingAlbumChunks.set(key, entry);
  }
  entry.chunks[d.idx] = new Uint8Array(d.chunk);

  if (entry.chunks.every(c => c !== undefined)) {
    const totalLength = entry.chunks.reduce((s, arr) => s + arr.length, 0);
    const merged = new Uint8Array(totalLength);
    let off = 0;
    for (const arr of entry.chunks) {
      merged.set(arr, off);
      off += arr.length;
    }
    const dataURL = new TextDecoder().decode(merged);
    pendingAlbumChunks.delete(key);

    let meta = pendingAlbumMeta.get(d.albumId);
    if (!meta) {
      meta = {
        expectedCount: 0,
        receivedCount: 0,
        images: [],
        timeout: null
      };
      pendingAlbumMeta.set(d.albumId, meta);
    }
    meta.images.push({ dataURL, name: entry.name });
    meta.receivedCount++;
  }
}

function handleAlbumImagesEnd(albumId) {
  const meta = pendingAlbumMeta.get(albumId);
  if (meta) {
    clearTimeout(meta.timeout);
    if (meta.images.length) {
      buildGallery(meta.images);
    } else {
      document.getElementById('dynamic-gallery-overlay')?.remove();
      toast('ℹ️ Album enthält keine Bilder');
    }
    pendingAlbumMeta.delete(albumId);
  }
}