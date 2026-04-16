'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – HOME SCREEN (ui-home.js)
// Code-Anzeige, Zifferneingabe, Letzte Chats, Verpasste Anrufe, Offline-Msgs
// + Gruppierte Offline-Nachrichten + Teilen mit Link + Willkommensnachricht
// ══════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// 6‑stellige Code‑Eingabe
function initDigits() {
  const inps = document.querySelectorAll('.dinp-new');
  inps.forEach((p, i) => {
    p.addEventListener('input', () => {
      const v = p.value.replace(/\D/g, '');
      p.value = v ? v.slice(-1) : '';
      p.classList.toggle('filled', !!p.value);
      if (p.value && i < 5) inps[i + 1].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
    p.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !p.value && i > 0) {
        inps[i - 1].value = '';
        inps[i - 1].classList.remove('filled');
        inps[i - 1].focus();
        document.getElementById('cbtn').disabled = true;
      }
    });
    p.addEventListener('paste', e => {
      e.preventDefault();
      const txt = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
      txt.split('').forEach((ch, j) => {
        if (inps[i + j]) {
          inps[i + j].value = ch;
          inps[i + j].classList.add('filled');
        }
      });
      inps[Math.min(i + txt.length, 5)].focus();
      document.getElementById('cbtn').disabled = getDigits().length !== 6;
    });
  });
}

function getDigits() {
  return [...document.querySelectorAll('.dinp-new')].map(x => x.value).join('');
}

// ─────────────────────────────────────────────────────────────────────────────
// Code kopieren / teilen (erweitert mit Link)
function copyCode() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?code=${myCode}`;
  const fullText = `Mein SpotMe-Code: ${formatCode(myCode)}\n${shareUrl}`;
  navigator.clipboard.writeText(fullText)
    .then(() => toast('✅ Link & Code kopiert'))
    .catch(() => toast('Code: ' + myCode));
  showPostShareMessageModal();
}

async function shareCode() {
  const shareUrl = `${window.location.origin}${window.location.pathname}?code=${myCode}`;
  const shareText = `Mein SpotMe-Code: ${formatCode(myCode)} – chatte mit mir!`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: 'SpotMe',
        text: shareText,
        url: shareUrl
      });
      showPostShareMessageModal();
    } catch (e) {
      // Nutzer hat abgebrochen – trotzdem Backup prüfen
      if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
    }
  } else {
    copyCode(); // Fallback: kopieren + Modal
  }
}

// 🆕 Modal für optionale Willkommensnachricht nach dem Teilen
function showPostShareMessageModal() {
  const existing = document.getElementById('post-share-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'post-share-modal';
  modal.className = 'modal';
  modal.style.display = 'flex';
  modal.innerHTML = `
    <div class="modal-content">
      <h3>📨 Möchtest du eine erste Nachricht hinterlassen?</h3>
      <p>Der Empfänger sieht deinen Code und kann dir antworten. Eine freundliche erste Nachricht erleichtert den Kontakt.</p>
      <textarea id="post-share-message" maxlength="280" placeholder="z.B. Hallo, lass uns chatten!" style="width:100%; padding:0.75rem; background:var(--bg2); border:1px solid var(--bord); border-radius:12px; color:var(--text); margin:1rem 0;"></textarea>
      <div style="display:flex; gap:0.8rem;">
        <button class="btn-primary" id="send-post-share-msg">Nachricht senden</button>
        <button class="btn-secondary" id="skip-post-share-msg">Überspringen</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('send-post-share-msg').addEventListener('click', () => {
    const text = document.getElementById('post-share-message').value.trim();
    if (text) {
      localStorage.setItem('sm_welcome_message', text);
      toast('📨 Nachricht wird beim ersten Kontakt gesendet.');
    }
    modal.remove();
    if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
  });

  document.getElementById('skip-post-share-msg').addEventListener('click', () => {
    modal.remove();
    if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Letzte Chats anzeigen (renderPrev) – unverändert
function renderPrev() {
  const arr = JSON.parse(localStorage.getItem('sm_idx') || '[]');
  const sec = document.getElementById('psec');
  const lst = document.getElementById('plist');
  if (!arr.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  lst.innerHTML = arr.map(c => {
    const alias = getContacts()[c.code] || c.partner;
    const preview = c.preview || '—';
    return `<div class="chat-card" onclick="reconnectTo('${c.code}','${esc2(alias)}','${c.id}')">
      <div class="card-row"><div class="card-avatar">🧑</div><div class="card-details"><div class="card-name">${esc(alias)}</div><div class="card-preview">${esc(preview)}</div></div></div>
      <div class="card-meta"><span class="card-time">${timeAgo(c.ts)}</span><span class="card-code">${formatCode(c.code)}</span></div>
    </div>`;
  }).join('');
}

function reconnectTo(code, name, cid) {
  partnerCode = code; partnerName = name; chatId = cid;
  loadPendingMessages(); migratePendingMessages(chatId);
  if (!peerReady) { toast('📴 Lokaler Modus – Nachrichten werden gespeichert'); openChat(null); setSpill('offline', '○ LOCAL'); markAutoReconnect(); return; }
  toast('↺ Verbinde...'); openChat(peer.connect(code, { reliable: true, metadata: { name: myName } }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Verpasste Anrufe – unverändert
function renderMissed() { /* ... */ }
function clearMissed() { /* ... */ }
function callBack(code) { /* ... */ }

// ─────────────────────────────────────────────────────────────────────────────
// Offline-Nachrichten – gruppiert (unverändert)
function renderOfflineMessages(msgs) { /* ... */ }
function toggleSenderMessages(code) { /* ... */ }
async function dismissSenderOfflineMsgs(senderCode, ids) { /* ... */ }
async function dismissOfflineMsg(id) { /* ... */ }
function startChatDirect(code, name) { /* ... */ }

// ─────────────────────────────────────────────────────────────────────────────
// Kontakte umbenennen – unverändert
function renameContact(code, networkName) { /* ... */ }
