'use strict';

console.log('✅ main.js v2.8 geladen – Globaler Token + Hub');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – EINSTIEGSPUNKT (main.js)
// + Globaler Token für alle Module
// + Heartbeat für Render.com
// + Communication Hub Integration
// ══════════════════════════════════════════════════════════════════════════════

// 🆕 Globalen Token sicherstellen
async function ensureGlobalToken() {
  const GLOBAL_TOKEN_KEY = 'sm_token';
  
  if (localStorage.getItem(GLOBAL_TOKEN_KEY)) {
    console.log('✅ Globaler Token vorhanden');
    return;
  }
  
  console.log('🆕 Erstelle globalen Token...');
  
  const name = localStorage.getItem('sm_name') || 'Nutzer_' + myCode.slice(0, 4);
  
  try {
    const res = await fetch(API_BASE + '/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: myCode,
        name: name,
        region: 'Valencia (Region)',
        spot: 'gay'
      })
    });
    
    if (res.ok) {
      const data = await res.json();
      if (data.token) {
        localStorage.setItem(GLOBAL_TOKEN_KEY, data.token);
        myToken = data.token;
        console.log('✅ Globaler Token erstellt');
      }
    }
  } catch(e) {
    console.warn('Token-Erstellung fehlgeschlagen:', e);
  }
}

window.addEventListener('load', () => {
  if (typeof Usage !== 'undefined') Usage.recordAppOpen();

  document.getElementById('mycode').textContent = myCode.slice(0, 3) + ' · ' + myCode.slice(3, 6);

  initDigits();
  
  // 🆕 SOFORT rendern mit lokalen Daten (Hub)
  if (typeof renderUnifiedHub === 'function') {
    renderUnifiedHub();
  } else {
    renderPrev();
  }
  
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

  // 🆕 Dann Server-Daten laden und Hub NOCHMAL rendern
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

    // 🆕 Nach Server-Daten Hub erneut rendern
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

  // 🆕 AutoFlush für Pending-Nachrichten starten
  setTimeout(() => {
    if (typeof startPendingAutoFlush === 'function') {
      startPendingAutoFlush();
    }
  }, 5000);

  // 🆕 Heartbeat für Render starten UND initialen Status setzen
  setTimeout(() => {
    if (typeof startHeartbeat === 'function') {
      startHeartbeat();
    }

    // 🆕 Initialen Status vom Heartbeat übernehmen (nach erstem Ping)
    setTimeout(() => {
      const reallyOnline = window.isServerOnline !== false && navigator.onLine;
      isOffline = !reallyOnline;
      window.isOffline = !reallyOnline;
      setSpill(reallyOnline ? 'online' : 'offline', reallyOnline ? '● ONLINE' : '○ LOCAL');
      updateConnectionStatus();
      console.log('🌐 Initialer Status:', reallyOnline ? 'ONLINE' : 'OFFLINE');
    }, 1500);
  }, 1000);

  // 🆕 Globalen Token sicherstellen (nach 1 Sekunde)
  setTimeout(() => ensureGlobalToken(), 1000);
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
