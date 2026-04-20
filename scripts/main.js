'use strict';

console.log('✅ main.js v2.3 geladen – Online-Event + AutoFlush + Heartbeat');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – EINSTIEGSPUNKT (main.js)
// API‑Version – keine PeerJS‑Abhängigkeiten mehr
// + Heartbeat für Render.com
// ══════════════════════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppOpen();

  document.getElementById('mycode').textContent = myCode.slice(0, 3) + ' · ' + myCode.slice(3, 6);

  initDigits();
  renderPrev();
  renderMissed();

  initDB();

  if (typeof ensureRingingToneCached === 'function') ensureRingingToneCached();

  document.getElementById('voice-btn').style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon'),
    desc = document.getElementById('voice-toggle-desc');
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
    isOffline = false;
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
    toast('🌐 Online – Nachrichten werden gesendet');

    if (typeof flushPendingMessages === 'function') {
      flushPendingMessages(true);
    }

    // 🆕 Heartbeat sofort prüfen
    if (typeof checkServerConnection === 'function') {
      checkServerConnection();
    }
  });

  window.addEventListener('offline', () => {
    isOffline = true;
    setSpill('offline', '○ LOCAL');
    updateConnectionStatus();
    toast('📴 Offline – Nachrichten werden gespeichert');
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
      else
        registration.addEventListener('updatefound', () => {
          const w = registration.installing;
          w.addEventListener('statechange', () => {
            if (w.state === 'activated') sendToken();
          });
        });
    });
  }

  const textarea = document.getElementById('minp');
  if (textarea) {
    textarea.addEventListener('input', () => {
      // Typing-Indikator entfällt
    });
  }

  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if (autoConnect && autoConnect.length === 6) {
    sessionStorage.removeItem('sm_connect_to');
    setTimeout(() => {
      const inps = document.querySelectorAll('.dinp-new');
      autoConnect.split('').forEach((ch, i) => {
        if (inps[i]) {
          inps[i].value = ch;
          inps[i].classList.add('filled');
        }
      });
      document.getElementById('cbtn').disabled = false;
      connectToPeer();
    }, 500);
  }

  // 🆕 SOFORT rendern mit lokalen Daten
  renderPrev();

  // 🆕 Dann Server-Daten laden und erneut rendern
  setTimeout(async () => {
    if (myToken) {
      const offlineMsgs = await fetchOfflineMessages();
      if (offlineMsgs.length) renderOfflineMessages(offlineMsgs);
      if (typeof startGlobalPolling === 'function') startGlobalPolling();
    }
    const remoteMissed = await fetchRemoteMissedCalls();
    const localMissed = getMissed();
    for (const call of remoteMissed) {
      if (
        !localMissed.some(
          m => m.code === call.callerId && Math.abs(m.ts - new Date(call.timestamp).getTime()) < 300000
        )
      ) {
        addMissed(call.callerId, call.callerName);
      }
    }

    // 🆕 Nach Server-Daten erneut rendern
    renderPrev();
  }, 500);

  if (typeof Traffic !== 'undefined') Traffic.updateUI();

  setTimeout(() => {
    if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
  }, 2500);

  // 🆕 AutoFlush für Pending-Nachrichten starten
  setTimeout(() => {
    if (typeof startPendingAutoFlush === 'function') {
      startPendingAutoFlush();
    }
  }, 5000);

  // 🆕 Heartbeat für Render starten
  setTimeout(() => {
    if (typeof startHeartbeat === 'function') {
      startHeartbeat();
    }
  }, 1000);
});

window.addEventListener('beforeunload', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppClose();
  if (typeof stopChatPolling === 'function') stopChatPolling();
  if (typeof stopPendingAutoFlush === 'function') stopPendingAutoFlush();
  if (typeof stopHeartbeat === 'function') stopHeartbeat();
});

document.addEventListener('visibilitychange', () => {
  if (typeof Usage === 'undefined') return;
  document.hidden ? Usage.recordAppClose() : Usage.recordAppOpen();
});
