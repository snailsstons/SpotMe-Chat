'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KURZNACHRICHT (spot-kurznachricht.js)
// ══════════════════════════════════════════════════════════════════════════════

let _kurznachrichtTarget = null;

function showKurznachrichtModal(code, name) {
  _kurznachrichtTarget = { code, name };
  document.getElementById('kurznachr-name').textContent = name;
  document.getElementById('kurznachr-input').value = '';
  document.getElementById('kurznachr-chars').textContent = '280';
  document.getElementById('kurznachricht-modal').style.display = 'flex';
  setTimeout(() => document.getElementById('kurznachr-input').focus(), 100);
}

function closeKurznachrichtModal() {
  const modal = document.getElementById('kurznachricht-modal');
  if (modal) modal.style.display = 'none';
  _kurznachrichtTarget = null;
}

async function submitKurznachricht() {
  if (!_kurznachrichtTarget) return;
  const text = document.getElementById('kurznachr-input').value.trim();
  if (!text) { toast('⚠️ Bitte eine Nachricht eingeben'); return; }
  const btn = document.getElementById('kurznachr-btn');
  btn.disabled = true; btn.textContent = '⏳ Senden...';
  try {
    const res = await fetch(API + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: _kurznachrichtTarget.code,
        senderCode: myCode,
        senderName: myProfile?.name || myCode,
        message: text
      })
    });
    const data = await res.json();
    if (res.ok) {
      toast(`📨 Nachricht an ${_kurznachrichtTarget.name} gesendet`);
      closeKurznachrichtModal();
    } else if (res.status === 429) {
      toast('⏳ ' + (data.error || 'Bitte warte etwas'));
    } else {
      toast('⚠️ ' + (data.error || 'Fehler beim Senden'));
    }
  } catch (e) {
    toast('⚠️ Keine Verbindung zum Server');
  } finally {
    btn.disabled = false; btn.textContent = '📨 Senden';
  }
}
