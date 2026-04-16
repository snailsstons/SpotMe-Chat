'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – EINSTIEGSPUNKT (main.js)
// Lädt als letztes, initialisiert alle Komponenten
// + Usage‑Statistiken + Service Worker mit Periodic Sync
// ══════════════════════════════════════════════════════════════════════════════

window.addEventListener('load', () => {
  // 📊 App-Start aufzeichnen
  if (typeof Usage !== 'undefined') Usage.recordAppOpen();
  setTimeout(() => {
  if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
}, 2500);

  document.getElementById('mycode').textContent = myCode.slice(0,3) + ' · ' + myCode.slice(3,6);
  
  initDigits();
  renderPrev();
  renderMissed();
  
  initPeer();
  initDB();
  ensureRingingToneCached();
  
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
    if (!peer || peer.destroyed) initPeer();
  });
  window.addEventListener('offline', () => {
    isOffline = true;
    updateConnectionStatus();
  });
  
  document.addEventListener('click', e => {
    if (!e.target.closest('.home-drop') && !e.target.closest('.home-menu-btn')) {
      closeHomeMenu();
    }
  });
  
  // ═══════════════════════════════════════════════════════════════════════════
  // Service Worker mit Periodic Sync (erweiterte Registrierung)
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(registration => {
      console.log('✅ SW registriert');
      
      const sendToken = () => {
        if (myToken && myCode && registration.active) {
          registration.active.postMessage({
            type: 'SET_TOKEN',
            token: myToken,
            code: myCode
          });
        }
      };
      
      if (registration.active) {
        sendToken();
      } else {
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'activated') sendToken();
          });
        });
      }
      
      const syncEnabled = localStorage.getItem('sm_sync_enabled') !== 'false';
      const syncInterval = localStorage.getItem('sm_sync_interval') || 'hourly';
      const sendSettings = () => {
        if (registration.active) {
          registration.active.postMessage({
            type: 'SET_SYNC_SETTINGS',
            settings: { enabled: syncEnabled, interval: syncInterval }
          });
        }
      };
      if (registration.active) sendSettings();
      else registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') sendSettings();
        });
      });
    });
  }
  
  const textarea = document.getElementById('minp');
  if (textarea) {
    textarea.addEventListener('input', () => {
      if (!conn || !conn.open) return;
      if (typingDebounceTimer) clearTimeout(typingDebounceTimer);
      if (!typingStarted) {
        conn.send({ t: 'typing', state: 'start' });
        typingStarted = true;
      }
      typingDebounceTimer = setTimeout(() => {
        if (conn && conn.open && typingStarted) {
          conn.send({ t: 'typing', state: 'end' });
          typingStarted = false;
        }
        typingDebounceTimer = null;
      }, 2000);
    });
  }
  
  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if (autoConnect && peer) {
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
    }, 1500);
  }

  setTimeout(async () => {
    if (myToken) {
      const offlineMsgs = await fetchOfflineMessages();
      if (offlineMsgs.length) renderOfflineMessages(offlineMsgs);
    }
    const remoteMissed = await fetchRemoteMissedCalls();
    const localMissed = getMissed();
    for (const call of remoteMissed) {
      const exists = localMissed.some(m =>
        m.code === call.callerId &&
        Math.abs(m.ts - new Date(call.timestamp).getTime()) < 300000
      );
      if (!exists) {
        addMissed(call.callerId, call.callerName);
      }
    }
  }, 2000);
  
  Traffic.updateUI();
});

// App wird geschlossen oder Tab verlassen
window.addEventListener('beforeunload', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppClose();
});

// Sichtbarkeitswechsel (App in Hintergrund / Vordergrund)
document.addEventListener('visibilitychange', () => {
  if (typeof Usage === 'undefined') return;
  if (document.hidden) {
    Usage.recordAppClose();
  } else {
    Usage.recordAppOpen();
  }
});
