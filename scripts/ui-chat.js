'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – CHAT UI (ui-chat.js)
// Nachrichten anzeigen, Audio-Player, Chat-Verlauf, UI-Hilfen
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// Chat vorbereiten (leeren, History laden)
function prepChat() {
  const alias = getContacts()[partnerCode];
  if (alias) partnerName = alias;
  applyPartnerName();

  if (partnerTypingTimer) {
    clearTimeout(partnerTypingTimer);
    partnerTypingTimer = null;
  }
  if (typingStarted) {
    typingStarted = false;
    if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
  }

  refreshStatusText();
  document.getElementById('pav').className = 'pav offline';
  document.getElementById('sbtn').disabled = true;
  document.getElementById('rcbar').classList.remove('show');
  document.getElementById('messages').innerHTML = `
    <div class="empty-chat" id="ehint">
      <div class="empty-icon">💬</div>
      <div class="empty-txt">Verbindung wird aufgebaut...</div>
      <div class="empty-hint"><span class="spin"></span></div>
    </div>
  `;
  lastDate = null;
  loadHistory();
  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
}

// ─────────────────────────────────────────────────────────────────────────────
// Nachricht im Chat anzeigen
function appendMsg(m) {
  const list = document.getElementById('messages');
  const hint = document.getElementById('ehint');
  if (hint && !hint.querySelector('.spin')) hint.remove();

  const d = new Date(m.ts);
  const ds = d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });
  const ts = d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  if (ds !== lastDate) {
    lastDate = ds;
    const sep = document.createElement('div');
    sep.className = 'date-sep';
    sep.textContent = ds;
    list.appendChild(sep);
  }

  const w = document.createElement('div');
  w.className = 'msg ' + (m.own ? 'msg-o' : 'msg-i');

  if (m.t === 'text') {
    w.innerHTML = `<div class="bubble">
      <div class="btxt">${esc(m.text)}</div>
      <div class="btime">${ts}${m.own ? ' ✓✓' : ''}</div>
    </div>`;
  } else if (m.t === 'file') {
    const isImg = m.ftype && m.ftype.startsWith('image/');
    if (isImg) {
      w.innerHTML = `<div class="imgbbl" onclick="bigImg('${m.url}')">
        <img src="${m.url}" loading="lazy">
      </div>
      <div class="btime">${ts}${m.own ? ' ✓✓' : ''}</div>`;
    } else {
      const icon = m.ftype?.includes('pdf') ? '📕' :
                   m.ftype?.includes('zip') ? '🗜️' :
                   m.ftype?.includes('video') ? '🎥' : '📄';
      const sz = m.size > 1048576
        ? (m.size / 1048576).toFixed(1) + ' MB'
        : Math.round(m.size / 1024) + ' KB';
      w.innerHTML = `<a class="filbbl" href="${m.url}" download="${esc(m.name)}">
        <span style="font-size:1.4rem">${icon}</span>
        <div>
          <div class="fnam">${esc(m.name)}</div>
          <div class="fsiz">${sz} · Tippen zum Speichern</div>
        </div>
      </a>
      <div class="btime">${ts}${m.own ? ' ✓✓' : ''}</div>`;
    }
  } else if (m.t === 'image') {
    w.innerHTML = `<div class="imgbbl" onclick="bigImg('${m.url}')">
      <img src="${m.url}" loading="lazy">
    </div>
    <div class="btime">${ts}${m.own ? ' ✓✓' : ''}</div>`;
  } else if (m.t === 'audio') {
    const duration = m.duration || 0;
    const mins = Math.floor(duration / 60);
    const secs = Math.floor(duration % 60);
    const durationStr = `${mins}:${secs.toString().padStart(2, '0')}`;
    w.innerHTML = `
      <div class="audio-player" data-url="${m.url}">
        <button class="audio-play-btn" onclick="toggleAudioPlay(this)">▶</button>
        <div class="audio-wave" id="wave-${m.ts}"></div>
        <span class="audio-duration">${durationStr}</span>
      </div>
      <div class="btime">${ts}${m.own ? ' ✓✓' : ''}</div>
    `;
    setTimeout(() => initAudioPlayer(w.querySelector('.audio-player'), m.url), 10);
  }

  list.appendChild(w);
  list.scrollTop = list.scrollHeight;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audio-Player Steuerung
window.toggleAudioPlay = function(btn) {
  const player = btn.closest('.audio-player');
  const audio = player._audio;
  if (!audio) {
    const url = player.dataset.url;
    const newAudio = new Audio(url);
    player._audio = newAudio;
    newAudio.onplay = () => btn.textContent = '⏸';
    newAudio.onpause = () => btn.textContent = '▶';
    newAudio.onended = () => btn.textContent = '▶';
    newAudio.onerror = () => toast('❌ Audio konnte nicht geladen werden');
    newAudio.play();
    return;
  }
  if (audio.paused) audio.play();
  else audio.pause();
};

function initAudioPlayer(player, url) {
  if (player._audio) return;
  const audio = new Audio(url);
  player._audio = audio;
  const btn = player.querySelector('.audio-play-btn');
  audio.onplay = () => btn.textContent = '⏸';
  audio.onpause = () => btn.textContent = '▶';
  audio.onended = () => btn.textContent = '▶';
  const wave = player.querySelector('.audio-wave');
  if (wave) {
    wave.innerHTML = Array.from({ length: 12 }, () =>
      `<div class="audio-wave-bar" style="height:${Math.floor(Math.random() * 20 + 4)}px"></div>`
    ).join('');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bild in neuem Tab öffnen
function bigImg(url) {
  const w = window.open();
  w.document.write(`
    <style>
      body { margin:0; background:#000; display:flex; align-items:center; justify-content:center; min-height:100vh; }
      img { max-width:100%; max-height:100vh; }
    </style>
    <img src="${url}">
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat-Verlauf (localStorage)
function persistMsg(m) {
  if (!chatId) return;
  const k = 'smmsg_' + chatId;
  const arr = JSON.parse(localStorage.getItem(k) || '[]');
  arr.push(m);
  if (arr.length > 200) arr.splice(0, arr.length - 200);
  localStorage.setItem(k, JSON.stringify(arr));
  updateIdx(m.text ||
    (m.t === 'audio'  ? '🎤 Sprachnachricht' :
     m.t === 'image'  ? '🖼️ Bild' :
     m.t === 'file'   ? '📎 ' + (m.name || '') : ''));
}

function loadHistory() {
  if (!chatId) return;
  lastDate = null;
  const h = document.getElementById('ehint');
  if (h) h.remove();
  JSON.parse(localStorage.getItem('smmsg_' + chatId) || '[]').forEach(m => appendMsg(m));
}

// Letzte Chats (sm_idx) aktualisieren
function updateIdx(preview) {
  if (!chatId) return;
  const k = 'sm_idx';
  const arr = JSON.parse(localStorage.getItem(k) || '[]');
  const i = arr.findIndex(x => x.id === chatId);
  const e = {
    id: chatId,
    partner: partnerName,
    code: partnerCode,
    ts: Date.now(),
    preview
  };
  if (i >= 0) arr[i] = e;
  else arr.unshift(e);
  localStorage.setItem(k, JSON.stringify(arr.slice(0, 15)));
  renderPrev();
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner-Name im Chat-Header
function applyPartnerName() {
  const alias = getContacts()[partnerCode];
  const display = alias || partnerName;
  const lbl = document.getElementById('pname');
  if (!lbl) return;
  if (alias && partnerName && alias !== partnerName) {
    lbl.innerHTML = esc(alias) + `<span class="alias-badge" title="Netzwerkname: ${esc(partnerName)}">✏️</span>`;
  } else {
    lbl.textContent = display;
  }
}

// Status-Text (Verbunden / schreibt...)
function refreshStatusText() {
  const statusEl = document.getElementById('pstatus');
  if (!statusEl) return;
  if (partnerTypingTimer !== null) {
    statusEl.textContent = '✍️ schreibt...';
    statusEl.className = 'pstatus';
    return;
  }
  if (conn && conn.open) {
    statusEl.textContent = '● Verbunden';
    statusEl.className = 'pstatus';
  } else {
    if (document.getElementById('s-chat').classList.contains('active')) {
      statusEl.textContent = '○ Verbinde...';
      statusEl.className = 'pstatus dim';
    } else {
      statusEl.textContent = '○ Verbindung getrennt';
      statusEl.className = 'pstatus dim';
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Partner umbenennen (aus Chat-Optionen)
function renamePartner() {
  closeSheet();
  const current = getContacts()[partnerCode] || '';
  const input = prompt(`Spitzname für diesen Kontakt:\n(leer lassen zum Zurücksetzen)`, current);
  if (input === null) return;
  const trimmed = input.trim();
  setAlias(partnerCode, trimmed);
  if (trimmed) partnerName = trimmed;
  applyPartnerName();
  updateIdx('');
  renderPrev();
  toast(trimmed ? `✅ "${trimmed}" gespeichert` : '○ Spitzname entfernt');
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat exportieren / importieren / löschen
function exportChat() {
  closeSheet();
  if (!chatId) {
    toast('⚠️ Kein aktiver Chat');
    return;
  }
  const msgs = JSON.parse(localStorage.getItem('smmsg_' + chatId) || '[]');
  const blob = new Blob([JSON.stringify({
    partner: partnerName,
    code: partnerCode,
    chatId,
    messages: msgs
  }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `SpotMe_${partnerName}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  toast('💾 Backup exportiert');
}

function triggerImport() {
  closeSheet();
  document.getElementById('fimp').value = '';
  document.getElementById('fimp').click();
}

function importChat(inp) {
  if (!inp.files[0]) return;
  const rd = new FileReader();
  rd.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (!d.messages) {
        toast('❌ Keine Nachrichten gefunden');
        return;
      }
      if (chatId) {
        localStorage.setItem('smmsg_' + chatId, JSON.stringify(d.messages));
        document.getElementById('messages').innerHTML = '';
        lastDate = null;
        loadHistory();
        toast('📂 Backup importiert');
      }
    } catch {
      toast('❌ Ungültige Datei');
    }
  };
  rd.readAsText(inp.files[0]);
  inp.value = '';
}

function clearChat() {
  if (!confirm('Verlauf auf diesem Gerät löschen?')) return;
  if (!chatId) return;
  localStorage.removeItem('smmsg_' + chatId);
  const idx = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  localStorage.setItem('sm_idx', JSON.stringify(idx.filter(c => c.id !== chatId)));
  document.getElementById('messages').innerHTML = `
    <div class="empty-chat">
      <div class="empty-icon">🗑️</div>
      <div class="empty-txt">Verlauf gelöscht.</div>
    </div>
  `;
  lastDate = null;
  renderPrev();
  toast('🗑️ Verlauf gelöscht');
}

// ─────────────────────────────────────────────────────────────────────────────
// Eingabe-Hilfen (Auto-Resize, Enter)
function autoH(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

function hkey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg();
  }
}