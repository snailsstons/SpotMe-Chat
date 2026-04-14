'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – VERIFIKATION (spot-verify.js)
// ══════════════════════════════════════════════════════════════════════════════

let pendingVerifyCode = null;

function showVerifyOptions(code) {
  pendingVerifyCode = code;
  const modal = document.getElementById('qr-verify-modal');
  document.getElementById('verify-code-input').value = '';
  const container = document.getElementById('qr-code-container');
  container.innerHTML = '';
  new QRCode(container, {
    text: `spotme:verify:${myCode}`,
    width: 180,
    height: 180,
    colorDark: '#00e5c0',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });
  modal.style.display = 'flex';
}

function closeQrVerifyModal() {
  document.getElementById('qr-verify-modal').style.display = 'none';
  pendingVerifyCode = null;
}

async function verifyByCode() {
  const input = document.getElementById('verify-code-input');
  const code = input.value.trim();
  if (code.length !== 6 || !pendingVerifyCode) {
    toast('⚠️ Bitte gültigen 6‑stelligen Code eingeben');
    return;
  }
  await submitVerification(pendingVerifyCode, 'chat');
  closeQrVerifyModal();
}

async function submitVerification(targetCode, type) {
  try {
    const res = await fetch(API + '/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fromCode: myCode, toCode: targetCode, type })
    });
    if (!res.ok) throw new Error('Fehler');
    toast(type === 'personal' ? '✅ Persönliche Verifikation gespeichert' : '✅ Chat‑Verifikation gespeichert');
    await loadCommunity();
    renderAll();
  } catch (e) {
    toast('❌ Verifikation fehlgeschlagen');
  }
}

function checkDeepLink() {
  const hash = window.location.hash;
  if (hash.startsWith('#spotme:verify:')) {
    const targetCode = hash.replace('#spotme:verify:', '');
    if (targetCode.length === 6) {
      submitVerification(targetCode, 'personal');
      window.location.hash = '';
    }
  }
}
