'use strict';

console.log('✅ chat-api.js v3.0 geladen – Final');

let pollingTimer = null;
let isRequestInProgress = false;
let audioElement = null;

function initAudioElement() {
  if (audioElement) return;
  audioElement = new Audio('data:audio/wav;base64,UklGRlwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YToAAACAgICAgICAgICAgICAgICAf39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/AAAAAAAAAAAAAAAAAAAAAA==');
  audioElement.loop = true;
}

function playChatNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => playWebAudioTone(ctx)).catch(() => playHtml5Tone());
    } else {
      playWebAudioTone(ctx);
    }
  } catch (e) {
    playHtml5Tone();
  }
}

function playWebAudioTone(ctx) {
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.value = 0.2;
    osc.type = 'sine';
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + 0.5);
    osc.stop(ctx.currentTime + 0.5);
  } catch (e) {
    playHtml5Tone();
  }
}

function playHtml5Tone() {
  initAudioElement();
  audioElement.currentTime = 0;
  audioElement.play().catch(e => console.warn('HTML5 Audio blockiert:', e));
}

function stopChatNotificationSound() {
  if (audioElement) {
    audioElement.pause();
    audioElement.currentTime = 0;
  }
}

function triggerChatHaptic() {
  if (navigator.vibrate) navigator.vibrate(200);
}

function handleIncomingChatRequest(senderCode, senderName) {
  console.log('📞 handleIncomingChatRequest', senderCode, senderName);

  if (isRequestInProgress) return;
  const sIn = document.getElementById('s-in');
  if (sIn.classList.contains('active')) return;
  if (partnerCode && document.getElementById('s-chat').classList.contains('active')) {
    toast('⚠️ Bereits in einem Chat');
    return;
  }

  isRequestInProgress = true;
  window.pendingChatPartner = { code: senderCode, name: senderName };

  document.getElementById('in-name').textContent = senderName;
  document.getElementById('in-code').textContent = 'Code: ' + formatCode(senderCode);
  document.querySelector('#s-in .caller-hint').textContent = 'möchte mit dir chatten';

  sIn.style.zIndex = '10000';
  showScreen('s-in');

  playChatNotificationSound();
  triggerChatHaptic();
}

function resetIncomingRequestState() {
  isRequestInProgress = false;
  window.pendingChatPartner = null;
  document.getElementById('s-in').style.zIndex = '';
  stopChatNotificationSound();
}

function sendMsg() {
  const inp = document.getElementById('minp');
  const text = inp.value.trim();
  if (!text) return;

  if (!partnerCode || !chatId) {
    toast('⚠️ Kein aktiver Chat');
    return;
  }

  const m = { t: 'text', text, ts: Date.now(), own: true };
  
  appendMsg(m);
  persistMsg(m);
  if (typeof updateIdx === 'function') updateIdx(text);

  if (isOffline) {
    addPendingMessageSilent(text);
    toast('📴 Lokal gespeichert');
  } else if (navigator.onLine && myToken) {
    sendToServer(partnerCode, text);
  } else {
    addPendingMessageSilent(text);
    toast('📦 Wird später gesendet');
  }

  inp.value = '';
  inp.style.height = 'auto';
}

function addPendingMessageSilent(text) {
  if (typeof pendingMessages === 'undefined') window.pendingMessages = [];
  pendingMessages.push({ text, ts: Date.now() });
  if (typeof savePendingMessages === 'function') savePendingMessages();
  if (typeof updatePendingBadge === 'function') updatePendingBadge();
}

async function sendToServer(recipient, message) {
  try {
    const res = await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient, senderCode: myCode, senderName: myName, message })
    });
    if (res.ok) removePendingMessageByText(message);
  } catch (e) {}
}

function removePendingMessageByText(text) {
  if (typeof pendingMessages !== 'undefined') {
    const index = pendingMessages.findIndex(m => m.text === text);
    if (index !== -1) {
      pendingMessages.splice(index, 1);
      if (typeof savePendingMessages === 'function') savePendingMessages();
      if (typeof updatePendingBadge === 'function') updatePendingBadge();
    }
  }
}

function startGlobalPolling() {
  if (pollingTimer) clearInterval(pollingTimer);
  pollingTimer = setInterval(async () => {
    if (!myToken) return;
    try {
      const res = await fetch(`${API_BASE}/offline-messages/${myCode}?token=${myToken}`);
      if (!res.ok) return;
      const msgs = await res.json();

      msgs.filter(m => !m.read).forEach(m => {
        if (m.message === '__CHAT_REQUEST__' || m.type === 'chat_request') {
          const senderName = m.senderName || formatCode(m.senderCode);
          handleIncomingChatRequest(m.senderCode, senderName);
          markOfflineMsgRead(m.id);
          return;
        }

        if (partnerCode && m.senderCode === partnerCode) {
          const ts = new Date(m.timestamp).getTime();
          if (!isMessageAlreadyStored(ts, false)) {
            appendMsg({ t: 'text', text: m.message, ts, own: false });
            persistMsg({ t: 'text', text: m.message, ts, own: false });
            if (typeof notify === 'function') notify(m.message);
          }
          markOfflineMsgRead(m.id);
        }
      });
    } catch (e) {}
  }, 5000);
}

function isMessageAlreadyStored(ts, own) {
  if (!chatId) return false;
  const chatKey = 'smmsg_' + chatId;
  const msgs = JSON.parse(localStorage.getItem(chatKey) || '[]');
  return msgs.some(m => m.ts === ts && m.own === own);
}
function openApiChat() {
  const id = window.chatId || chatId;
  
  if (!id) {
    console.error('❌ chatId ist leer');
    toast('⚠️ Fehler: Keine Chat-ID');
    return;
  }
  
  chatId = id;
  window.chatId = id;
  
  // ⭐ isOffline NICHT überschreiben – das ist schon korrekt gesetzt!
  console.log('🔍 openApiChat – isOffline:', isOffline);
  
  prepChat();
  showScreen('s-chat');
  document.getElementById('sbtn').disabled = false;
  document.getElementById('rcbar').classList.remove('show');
  refreshStatusText();
  document.getElementById('pav').className = 'pav';
  applyPartnerName();

}
  
  const h = document.getElementById('ehint');
  if (h) {
    if (isOffline) {
      h.innerHTML = `<div class="empty-icon">📴</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Lokaler Modus</div>
        <div class="empty-hint">Nachrichten werden gespeichert und später gesendet</div>`;
    } else {
      h.innerHTML = `<div class="empty-icon">💬</div>
        <div class="empty-txt" style="font-weight:600;color:var(--text)">Chat bereit</div>
        <div class="empty-hint">Nachrichten werden über Server zugestellt</div>`;
    }
  }
  
  if (typeof updateIdx === 'function') updateIdx('');
  
  setSpill(isOffline ? 'offline' : 'online', isOffline ? '● LOCAL' : '● ONLINE');
  if (typeof updateConnectionStatus === 'function') updateConnectionStatus();
  
  if (!isOffline) {
    startGlobalPolling();
    if (typeof flushPendingMessages === 'function') {
      setTimeout(() => flushPendingMessages(), 500);
    }
  }
}

function stopChatPolling() {
  if (pollingTimer) { 
    clearInterval(pollingTimer); 
    pollingTimer = null; 
  }
}

window.openChat = openApiChat;
window.openApiChat = openApiChat;
window.resetIncomingRequestState = resetIncomingRequestState;
window.startGlobalPolling = startGlobalPolling;
window.stopChatPolling = stopChatPolling;
window.sendMsg = sendMsg;
