'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – NACHRICHTEN EMPFANG (spot-messages.js)
// Zeigt eingehende Kurznachrichten beim Spot-Start + Polling alle 60s
// ══════════════════════════════════════════════════════════════════════════════

let _lastUnreadCount = 0;

// ── Nachrichten vom Server holen ──────────────────────────────────────────
async function fetchAndRenderOfflineMsgs() {
  if (!myToken || !myCode) return;
  try {
    const res = await fetch(
      `${API}/offline-messages/${myCode}?token=${encodeURIComponent(myToken)}&spot=${SPOT}`
    );
    if (!res.ok) return;
    const msgs = await res.json();
    const unread = msgs.filter(m => !m.read);
    _lastUnreadCount = unread.length;
    renderOfflineMsgBadge(unread);
  } catch (e) {}
}

// ── Stilles Polling — nur benachrichtigen wenn neue Nachrichten ────────────
async function fetchAndRenderOfflineMsgsSilent() {
  if (!myToken || !myCode) return;
  try {
    const res = await fetch(
      `${API}/offline-messages/${myCode}?token=${encodeURIComponent(myToken)}&spot=${SPOT}`
    );
    if (!res.ok) return;
    const msgs = await res.json();
    const unread = msgs.filter(m => !m.read);
    if (unread.length > _lastUnreadCount) {
      toast(`✉️ ${unread.length} neue Nachricht${unread.length > 1 ? 'en' : ''}`);
      renderOfflineMsgBadge(unread);
    }
    _lastUnreadCount = unread.length;
  } catch (e) {}
}

// ── Badge auf Auge-Button ─────────────────────────────────────────────────
function renderOfflineMsgBadge(unread) {
  let badge = document.getElementById('offmsg-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'offmsg-badge';
    badge.style.cssText =
      'position:absolute;top:-4px;right:-4px;background:#ff4f7b;color:#fff;' +
      'font-size:.65rem;font-weight:700;width:16px;height:16px;border-radius:50%;' +
      'display:flex;align-items:center;justify-content:center;pointer-events:none;';
    const btn = document.getElementById('publish-toggle-small');
    if (btn) { btn.style.position = 'relative'; btn.appendChild(badge); }
  }
  if (!unread.length) { badge.style.display = 'none'; return; }
  badge.textContent = unread.length > 9 ? '9+' : unread.length;
  badge.style.display = 'flex';
  showOfflineMsgPanel(unread);
}

// ── Nachrichten-Panel (horizontal, pro Absender eine Karte) ───────────────
function showOfflineMsgPanel(msgs) {
  let panel = document.getElementById('offmsg-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'offmsg-panel';
    panel.style.cssText =
      'margin:0.5rem 0;background:var(--card2);' +
      'border-top:1px solid rgba(255,79,123,.25);' +
      'border-bottom:1px solid rgba(255,79,123,.25);' +
      'padding:0.75rem 0;flex-shrink:0;';
    const bar = document.getElementById('profile-bar');
    if (bar && bar.parentNode) bar.parentNode.insertBefore(panel, bar.nextSibling);
  }

  // Nach Absender gruppieren
  const grouped = {};
  msgs.forEach(m => {
    if (!grouped[m.senderCode]) {
      grouped[m.senderCode] = { name: m.senderName, code: m.senderCode, msgs: [] };
    }
    grouped[m.senderCode].msgs.push(m);
  });
  const senders = Object.values(grouped);

  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:0 1rem;margin-bottom:0.6rem;">
      <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:0.85rem;color:#ff4f7b;">
        ✉️ Nachrichten · ${senders.length} ${senders.length === 1 ? 'Absender' : 'Absender'}
      </div>
      <button onclick="dismissAllOfflineMsgs()" style="background:none;border:none;color:var(--muted2);font-size:0.8rem;cursor:pointer;">✓ Alle gelesen</button>
    </div>
    <div style="display:flex;gap:0.75rem;overflow-x:auto;padding:0 1rem 0.5rem;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
      ${senders.map(s => {
        const d = new Date(s.msgs[s.msgs.length - 1].timestamp);
        const time = d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit' })
                   + ' ' + d.toLocaleTimeString('de-DE', { hour:'2-digit', minute:'2-digit' });
        const initial = s.name ? s.name[0].toUpperCase() : '?';
        const allIds = s.msgs.map(m => m.id);
        const msgList = s.msgs.map(m =>
          `<div style="background:var(--bg);border-radius:10px;padding:0.5rem 0.65rem;margin-bottom:0.4rem;font-size:0.85rem;color:var(--text);line-height:1.4;">${esc(m.message)}</div>`
        ).join('');
        return `<div style="flex:0 0 260px;background:var(--sur);border:1px solid rgba(255,79,123,.2);border-radius:14px;padding:0.85rem;display:flex;flex-direction:column;">
          <div style="display:flex;align-items:center;gap:0.6rem;margin-bottom:0.6rem;">
            <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--p2),var(--p3));display:flex;align-items:center;justify-content:center;font-size:0.9rem;font-weight:700;flex-shrink:0;">${esc(initial)}</div>
            <div style="flex:1;min-width:0;">
              <div style="font-weight:700;font-size:0.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(s.name)}</div>
              <div style="font-size:0.7rem;color:var(--muted2);">${time}</div>
            </div>
            <button onclick="dismissSenderOfflineMsgs('${s.code}',[${allIds.join(',')}])" style="background:none;border:none;color:var(--muted2);font-size:1rem;cursor:pointer;" title="Gelesen">✓</button>
          </div>
          <div style="flex:1;max-height:140px;overflow-y:auto;scrollbar-width:none;margin-bottom:0.6rem;">${msgList}</div>
          <div style="display:flex;gap:0.4rem;">
            <button onclick="startChat('${s.code}','${esc(s.name)}')" style="flex:1;padding:0.45rem;background:var(--acc);color:var(--bg);border:none;border-radius:8px;font-size:0.8rem;font-weight:700;cursor:pointer;">💬 Chat</button>
            <button onclick="showKurznachrichtModal('${s.code}','${esc(s.name)}')" style="flex:1;padding:0.45rem;background:rgba(123,92,250,.15);color:var(--p2);border:1px solid rgba(123,92,250,.3);border-radius:8px;font-size:0.8rem;font-weight:600;cursor:pointer;">↩️ Antworten</button>
          </div>
        </div>`;
      }).join('')}
    </div>
  `;
  panel.style.display = 'block';
}

// ── Einzelnen Absender als gelesen markieren ──────────────────────────────
async function dismissSenderOfflineMsgs(senderCode, ids) {
  for (const id of ids) {
    try {
      await fetch(`${API}/offline-message/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: myCode, token: myToken, spot: SPOT })
      });
    } catch (e) {}
  }
  fetchAndRenderOfflineMsgs();
}

// ── Alle als gelesen markieren ────────────────────────────────────────────
async function dismissAllOfflineMsgs() {
  try {
    await fetch(`${API}/offline-messages/${myCode}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: myCode, token: myToken, spot: SPOT })
    });
  } catch (e) {}
  const panel = document.getElementById('offmsg-panel');
  if (panel) panel.style.display = 'none';
  const badge = document.getElementById('offmsg-badge');
  if (badge) badge.style.display = 'none';
  _lastUnreadCount = 0;
}

console.log('✅ spot-messages.js geladen');
