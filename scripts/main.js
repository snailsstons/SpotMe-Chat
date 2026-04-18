'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – EINSTIEGSPUNKT (main.js)
// API‑Version – keine PeerJS‑Abhängigkeiten mehr
// ══════════════════════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppOpen();

  document.getElementById('mycode').textContent = myCode.slice(0,3) + ' · ' + myCode.slice(3,6);
  
  initDigits();
  renderPrev();
  renderMissed();
  
  initDB();
  
  // Dummy – wird nicht mehr benötigt, aber Aufruf bleibt zur Sicherheit
  if (typeof ensureRingingToneCached === 'function') ensureRingingToneCached();
  
  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon'), desc = document.getElementById('voice-toggle-desc');
  if (voiceEnabled) {
    icon.textContent = '🎤';
    desc.textContent = 'Aktiviert · Button in Chatleiste';
  } else {
    icon.textContent = '🔇';
    desc.textContent = 'Deaktiviert · Button ausgeblendet';
  }
  
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  
  window.addEventListener('online', () => {
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
  });
  window.addEventListener('offline', () => {
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
  });
  
  document.addEventListener('click', e => {
    if (!e.target.closest('.home-drop') && !e.target.closest('.home-menu-btn')) {
      closeHomeMenu();
    }
  });
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('✅ SW registriert');
      const sendToken = () => {
        if (myToken && myCode && registration.active) {
          registration.active.postMessage({ type: 'SET_TOKEN', token: myToken, code: myCode });
        }
      };
      if (registration.active) sendToken();
      else registration.addEventListener('updatefound', () => {
        const w = registration.installing;
        w.addEventListener('statechange', () => { if (w.state === 'activated') sendToken(); });
      });
    });
  }
  
  const textarea = document.getElementById('minp');
  if (textarea) {
    textarea.addEventListener('input', () => {
      // Typing-Indikator kann entfallen oder per API simuliert werden
    });
  }
  
  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if (autoConnect && autoConnect.length === 6) {
    sessionStorage.removeItem('sm_connect_to');
    setTimeout(() => {
      const inps = document.querySelectorAll('.dinp-new');
      autoConnect.split('').forEach((ch, i) => {
        if (inps[i]) { inps[i].value = ch; inps[i].classList.add('filled'); }
      });
      document.getElementById('cbtn').disabled = false;
      connectToPeer();
    }, 500);
  }

  setTimeout(async () => {
    if (myToken) {
      const offlineMsgs = await fetchOfflineMessages();
      if (offlineMsgs.length) renderOfflineMessages(offlineMsgs);
    }
    const remoteMissed = await fetchRemoteMissedCalls();
    const localMissed = getMissed();
    for (const call of remoteMissed) {
      if (!localMissed.some(m => m.code === call.callerId && Math.abs(m.ts - new Date(call.timestamp).getTime()) < 300000)) {
        addMissed(call.callerId, call.callerName);
      }
    }
  }, 2000);
  
  if (typeof Traffic !== 'undefined') Traffic.updateUI();

  setTimeout(() => {
    if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
  }, 2500);
});

window.addEventListener('beforeunload', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppClose();
  if (typeof stopChatPolling === 'function') stopChatPolling();
});

document.addEventListener('visibilitychange', () => {
  if (typeof Usage === 'undefined') return;
  document.hidden ? Usage.recordAppClose() : Usage.recordAppOpen();
});
