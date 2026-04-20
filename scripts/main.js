'use strict';

console.log('✅ main.js v2.6 geladen – Hub-Final');

window.addEventListener('load', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppOpen();

  document.getElementById('mycode').textContent = myCode.slice(0, 3) + ' · ' + myCode.slice(3, 6);

  initDigits();
  // 🆕 NICHT hier rendern – erst nach Daten-Load!
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
    if (typeof checkServerConnection === 'function') {
      checkServerConnection().then(isOnline => {
        if (isOnline) {
          setSpill('online', '● ONLINE');
          updateConnectionStatus();
          toast('🌐 Online – Nachrichten werden gesendet');
          if (typeof flushPendingMessages === 'function') {
            flushPendingMessages(true);
          }
        }
      });
    }
  });

  window.addEventListener('offline', () => {
    isOffline = true;
    window.isOffline = true;
    window.isServerOnline = false;
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

  // 🆕 ERST Server-Daten laden, DANN rendern
  setTimeout(async () => {
    if (myToken) {
      await fetchOfflineMessages();
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

    // 🆕 JETZT rendern – nachdem ALLE Daten geladen sind!
    if (typeof renderUnifiedHub === 'function') {
      renderUnifiedHub();
    } else {
      renderPrev();
    }
  }, 300);

  if (typeof Traffic !== 'undefined') Traffic.updateUI();

  setTimeout(() => {
    if (typeof checkBackupOnStart === 'function') checkBackupOnStart();
  }, 2500);

  setTimeout(() => {
    if (typeof startPendingAutoFlush === 'function') {
      startPendingAutoFlush();
    }
  }, 5000);

  setTimeout(() => {
    if (typeof startHeartbeat === 'function') {
      startHeartbeat();
    }
    setTimeout(() => {
      const reallyOnline = window.isServerOnline !== false && navigator.onLine;
      isOffline = !reallyOnline;
      window.isOffline = !reallyOnline;
      setSpill(reallyOnline ? 'online' : 'offline', reallyOnline ? '● ONLINE' : '○ LOCAL');
      updateConnectionStatus();
      console.log('🌐 Initialer Status:', reallyOnline ? 'ONLINE' : 'OFFLINE');
    }, 1500);
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
