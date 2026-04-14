'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – FILE & AUDIO TRANSFER (p2p-file.js)
// Chunking für Dateien und Sprachnachrichten, Fortschrittsbalken
// + Traffic‑Messung
// ══════════════════════════════════════════════════════════════════════════════

async function sendFile(inp) {
  const f = inp.files[0];
  inp.value = '';
  if (!f) return;
  if (!conn || !conn.open) {
    toast('⚠️ Dateiübertragung nur bei aktiver Verbindung möglich');
    return;
  }
  if (f.size > 100 * 1024 * 1024) {
    toast('⚠️ Max. 100 MB');
    return;
  }
  if (typingStarted) {
    conn.send({ t: 'typing', state: 'end' });
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
    typingStarted = false;
  }
  const id = Math.random().toString(36).slice(2, 10);
  const total = Math.ceil(f.size / CHUNK);
  const metaMsg = { t: 'f-start', id, name: f.name, type: f.type, size: f.size, total };
  Traffic.recordP2PSent(new Blob([JSON.stringify(metaMsg)]).size);
  conn.send(metaMsg);
  showUP(true);
  toast(`📤 Sende "${f.name}"...`);
  const reader = new FileReader();
  let off = 0, idx = 0;
  reader.onload = async e => {
    const chunkData = e.target.result;
    const chunkMsg = { t: 'f-chunk', id, idx, data: chunkData };
    // Größe des Chunks (Daten + Overhead) schätzen
    Traffic.recordP2PSent(new Blob([JSON.stringify({ t: 'f-chunk', id, idx, data: '' })]).size + chunkData.byteLength);
    conn.send(chunkMsg);
    off += CHUNK;
    idx++;
    document.getElementById('upb').style.width = Math.floor((idx / total) * 100) + '%';
    if (off < f.size) {
      if (idx % 10 === 0) await new Promise(r => setTimeout(r, 20));
      reader.readAsArrayBuffer(f.slice(off, off + CHUNK));
    } else {
      const endMsg = { t: 'f-end', id };
      Traffic.recordP2PSent(new Blob([JSON.stringify(endMsg)]).size);
      conn.send(endMsg);
      showUP(false);
      toast(`✅ "${f.name}" gesendet!`);
      const url = await fileToB64(f);
      const msg = {
        t: 'file',
        url,
        name: f.name,
        ftype: f.type,
        size: f.size,
        ts: Date.now(),
        own: true
      };
      appendMsg(msg);
      persistMsg(msg);
    }
  };
  reader.readAsArrayBuffer(f.slice(0, CHUNK));
}

function showUP(v) {
  document.getElementById('upw').style.opacity = v ? '1' : '0';
  if (!v) {
    setTimeout(() => {
      document.getElementById('upb').style.width = '0%';
    }, 400);
  }
}

function fileToB64(f) {
  return new Promise(r => {
    const rd = new FileReader();
    rd.onload = () => r(rd.result);
    rd.readAsDataURL(f);
  });
}

function handleFileStart(d) {
  Traffic.recordP2PReceived(new Blob([JSON.stringify(d)]).size);
  fileBufs[d.id] = {
    meta: d,
    chunks: new Array(d.total).fill(null)
  };
  toast(`📥 Empfange "${d.name}"...`);
}

function handleFileChunk(d) {
  // Größe des Chunks (Daten) schätzen – d.data ist ein ArrayBuffer
  Traffic.recordP2PReceived(new Blob([JSON.stringify({ t: 'f-chunk', id: d.id, idx: d.idx })]).size + (d.data?.byteLength || 0));
  const b = fileBufs[d.id];
  if (b) b.chunks[d.idx] = d.data;
}

function handleFileEnd(d) {
  Traffic.recordP2PReceived(new Blob([JSON.stringify(d)]).size);
  const b = fileBufs[d.id];
  if (!b) return;
  const valid = b.chunks.filter(c => c !== null);
  if (valid.length !== b.meta.total) {
    toast('❌ Übertragungsfehler');
    return;
  }
  const blob = new Blob(valid, { type: b.meta.type });
  const rd = new FileReader();
  rd.onload = e => {
    const msg = {
      t: 'file',
      url: e.target.result,
      name: b.meta.name,
      ftype: b.meta.type,
      size: b.meta.size,
      ts: Date.now(),
      own: false
    };
    appendMsg(msg);
    persistMsg(msg);
    notify('📎 Datei: ' + b.meta.name);
    playNotificationSound();
    triggerHaptic();
    delete fileBufs[d.id];
  };
  rd.readAsDataURL(blob);
}

function handleAudioStart(d) {
  Traffic.recordP2PReceived(new Blob([JSON.stringify(d)]).size);
  fileBufs[d.id] = {
    meta: d,
    chunks: new Array(d.total).fill(null)
  };
  toast(`🎤 Empfange Sprachnachricht (${d.duration.toFixed(1)}s)...`);
}

function handleAudioChunk(d) {
  Traffic.recordP2PReceived(new Blob([JSON.stringify({ t: 'audio-chunk', id: d.id, idx: d.idx })]).size + (d.data?.byteLength || 0));
  const b = fileBufs[d.id];
  if (b) b.chunks[d.idx] = d.data;
}

function handleAudioEnd(d) {
  Traffic.recordP2PReceived(new Blob([JSON.stringify(d)]).size);
  const b = fileBufs[d.id];
  if (!b) return;
  const valid = b.chunks.filter(c => c !== null);
  if (valid.length !== b.meta.total) {
    toast('❌ Übertragungsfehler');
    return;
  }
  const blob = new Blob(valid, { type: 'audio/webm' });
  const url = URL.createObjectURL(blob);
  const msg = {
    t: 'audio',
    url,
    duration: b.meta.duration,
    ts: Date.now(),
    own: false
  };
  appendMsg(msg);
  persistMsg(msg);
  notify('🎤 Sprachnachricht');
  playNotificationSound();
  triggerHaptic();
  delete fileBufs[d.id];
                                  }
