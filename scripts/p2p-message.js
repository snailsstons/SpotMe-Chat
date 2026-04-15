'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – NACHRICHTEN & DATA-HANDLER (p2p-message.js)
// Textnachrichten senden/empfangen, Typing-Indikator, Pending-Queue
// + Traffic‑Messung + Usage‑Zähler
// ══════════════════════════════════════════════════════════════════════════════

function sendMsg() {
  const inp = document.getElementById('minp');
  const text = inp.value.trim();
  if (!text) return;

  if (!conn || !conn.open) {
    if (!chatId) {
      toast('⚠️ Bitte zuerst eine Verbindung aufbauen');
      return;
    }
    addPendingMessage(text);
    toast(`📦 Nachricht gespeichert (${pendingMessages.length} in Warteschlange)`);
    inp.value = '';
    inp.style.height = 'auto';
    return;
  }

  if (typingStarted) {
    conn.send({ t: 'typing', state: 'end' });
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    typingStarted = false;
  }

  const m = { t: 'text', text, ts: Date.now() };
  const payload = JSON.stringify(m);
  if (typeof Traffic !== 'undefined' && Traffic) {
    Traffic.recordP2PSent(new Blob([payload]).size);
  }
  conn.send(m);
  appendMsg({ ...m, own: true });
  persistMsg({ ...m, own: true });

  // 📊 ANALYTICS: Gesendete P2P‑Nachricht zählen
  if (typeof Analytics !== 'undefined') {
    Analytics.increment('messagesSent');
  }

   // 📊 Nachrichtenzähler erhöhen – mit deutlichem Log
  console.log('📊 [Usage] Verfügbar?', typeof Usage !== 'undefined' ? '✅ Ja' : '❌ Nein');
  if (typeof Usage !== 'undefined') {
    Usage.incrementMessagesSent();
    const stats = Usage.getStats();
    console.log(`📊 Nachricht gesendet! Gesamt: ${stats.messagesSent}`);
  } else {
    console.warn('❌ Usage-Objekt fehlt! Nachricht nicht gezählt.');
  }

  inp.value = '';
  inp.style.height = 'auto';
}

function handleData(d) {
  if (typeof Traffic !== 'undefined' && Traffic) {
    Traffic.recordP2PReceived(new Blob([JSON.stringify(d)]).size);
  }

  if (d.t === 'text') {
    const m = { ...d, own: false };
    appendMsg(m);
    persistMsg(m);
    notify(d.text);
    playNotificationSound();
    triggerHaptic();

    // 📊 ANALYTICS: Empfangene P2P‑Nachricht zählen
    if (typeof Analytics !== 'undefined') {
      Analytics.increment('messagesReceived');
    }
  }
  } else if (d.t === 'typing') {
    if (d.state === 'start') {
      if (partnerTypingTimer) clearTimeout(partnerTypingTimer);
      partnerTypingTimer = setTimeout(() => {
        partnerTypingTimer = null;
        refreshStatusText();
      }, 5000);
      refreshStatusText();
    } else if (d.state === 'end') {
      if (partnerTypingTimer) clearTimeout(partnerTypingTimer);
      partnerTypingTimer = null;
      refreshStatusText();
    }
  } else if (d.t === 'f-start') {
    handleFileStart(d);
  } else if (d.t === 'f-chunk') {
    handleFileChunk(d);
  } else if (d.t === 'f-end') {
    handleFileEnd(d);
  } else if (d.t === 'audio-start') {
    handleAudioStart(d);
  } else if (d.t === 'audio-chunk') {
    handleAudioChunk(d);
  } else if (d.t === 'audio-end') {
    handleAudioEnd(d);
  } else if (d.t === 'location_update') {
    partnerPosition = { lat: d.lat, lng: d.lng, accuracy: d.accuracy };
    updatePartnerMarker(d.lat, d.lng);
    document.getElementById('location-status-text').textContent = '📍 Partner online';
    updateDistanceDisplay();
  } else if (d.t === 'album_list_request') {
    getAllAlbums().then(async albums => {
      const list = [];
      for (const album of albums) {
        const photos = await getPhotosByAlbum(album.id);
        list.push({ id: album.id, name: album.name, photoCount: photos.length });
      }
      if (conn && conn.open) conn.send({ t: 'album_list_response', list });
    }).catch(e => console.warn(e));
  } else if (d.t === 'album_list_response') {
    const albums = d.list || [];
    if (albums.length) showPartnerAlbumsSheet(albums);
    else toast('ℹ️ Partner hat keine Alben');
  } else if (d.t === 'album_images_request') {
    const albumId = d.albumId;
    getPhotosByAlbum(albumId).then(photos => {
      conn.send({ t: 'album_images_meta', albumId, total: photos.length });
      for (const photo of photos) {
        const bytes = new TextEncoder().encode(photo.dataURL);
        const totalChunks = Math.ceil(bytes.length / CHUNK);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = bytes.slice(i * CHUNK, Math.min((i + 1) * CHUNK, bytes.length)).buffer;
          conn.send({
            t: 'album_image_chunk',
            albumId,
            photoId: photo.id,
            idx: i,
            total: totalChunks,
            chunk,
            name: photo.name
          });
        }
      }
      conn.send({ t: 'album_images_end', albumId });
    }).catch(e => console.warn(e));
  } else if (d.t === 'album_images_meta') {
    let meta = pendingAlbumMeta.get(d.albumId);
    if (!meta) {
      meta = { expectedCount: d.total, receivedCount: 0, images: [], timeout: null };
      pendingAlbumMeta.set(d.albumId, meta);
    } else {
      meta.expectedCount = d.total;
    }
    if (meta.timeout) clearTimeout(meta.timeout);
    meta.timeout = setTimeout(() => {
      if (meta.images.length) buildGallery(meta.images);
      else {
        document.getElementById('dynamic-gallery-overlay')?.remove();
        toast('⚠️ Übertragung unvollständig');
      }
      pendingAlbumMeta.delete(d.albumId);
    }, 20000);
  } else if (d.t === 'album_image_chunk') {
    handleAlbumImageChunk(d);
  } else if (d.t === 'album_images_end') {
    handleAlbumImagesEnd(d.albumId);
  }
}

function notify(text) {
  const onChat = document.getElementById('s-chat').classList.contains('active');
  if (!onChat || document.hidden) {
    inAppNotif(partnerName, text);
    pushNotif(partnerName, text);
  }
}

function pushNotif(from, text) {
  if (Notification.permission !== 'granted') return;
  try {
    const n = new Notification('💬 ' + from, {
      body: text.length > 80 ? text.slice(0, 80) + '…' : text,
      tag: 'spotme',
      renotify: true
    });
    n.onclick = () => {
      window.focus();
      switchToChat();
      n.close();
    };
    setTimeout(() => n.close(), 6000);
  } catch (e) {}
}

let inTimer = null;
function inAppNotif(from, text) {
  document.getElementById('in-from').textContent = '💬 ' + from;
  document.getElementById('in-msg').textContent = text.length > 60 ? text.slice(0, 60) + '…' : text;
  const el = document.getElementById('in-notif');
  el.classList.add('show');
  clearTimeout(inTimer);
  inTimer = setTimeout(() => el.classList.remove('show'), 5000);
}

function switchToChat() {
  document.getElementById('in-notif').classList.remove('show');
  showScreen('s-chat');
             }
