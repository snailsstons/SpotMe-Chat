function openChatUnified(code, name, chatId, isCallback = false) {
  console.log('💬 openChatUnified →', code, name, chatId, 'isCallback:', isCallback);
  
  if (code === myCode) {
    toast('⚠️ Du kannst nicht mit dir selbst chatten');
    return;
  }
  
  // LIVE-Modus setzen
  isOffline = false;
  window.isOffline = false;
  
  partnerCode = code;
  partnerName = name;
  chatId = chatId || buildCID(myCode, code);
  window.chatId = chatId;
  
  console.log('✅ isOffline vor openApiChat:', isOffline);
  
  loadPendingMessages();
  migratePendingMessages(chatId);
  
  // Modal anzeigen
  if (typeof showCallModal === 'function') {
    showCallModal('📞 Verbinde...', `${name} (${formatCode(code)})`);
  }
  
  // Chat-UI öffnen
  if (typeof openApiChat === 'function') {
    openApiChat();
  } else {
    toast('⚠️ Fehler beim Öffnen des Chats');
    return;
  }
  
  // Status nach dem Öffnen nochmal sicherstellen
  setTimeout(() => {
    isOffline = false;
    window.isOffline = false;
    setSpill('online', '● ONLINE');
    updateConnectionStatus();
    console.log('✅ isOffline nach Korrektur:', isOffline);
  }, 100);
  
  // Chat-Request senden
  if (myToken) {
    sendChatRequest(code);
  }
  
  toast(`📞 Rufe ${name} an...`);
  
  // Timer für vorherigen Fallback löschen
  if (window.chatFallbackTimer) {
    clearTimeout(window.chatFallbackTimer);
    window.chatFallbackTimer = null;
  }
  
  // 🆕 Intelligenter Fallback – nur schalten wenn wirklich keine Verbindung
  window.chatFallbackTimer = setTimeout(() => {
    // Prüfen ob wir noch im gleichen Chat sind
    if (partnerCode === code) {
      // Prüfe ob bereits Nachrichten ausgetauscht wurden
      const chatKey = 'smmsg_' + chatId;
      const msgs = JSON.parse(localStorage.getItem(chatKey) || '[]');
      const hasMessages = msgs.length > 0;
      
      // Prüfe ob der Partner geantwortet hat (Nachricht vom Partner)
      const hasPartnerMessage = msgs.some(m => m.own === false);
      
      // Prüfe ob der Chat-Screen noch aktiv ist
      const chatActive = document.getElementById('s-chat').classList.contains('active');
      
      console.log('🔍 Fallback-Check:', { hasMessages, hasPartnerMessage, chatActive, isOffline });
      
      // NUR auf Lokal schalten wenn:
      // - Chat noch aktiv
      // - KEINE Nachrichten vom Partner
      // - Wir noch im Live-Modus sind
      if (chatActive && !hasPartnerMessage && !isOffline) {
        console.log('⏰ Keine Antwort vom Partner – schalte auf Lokal-Modus');
        isOffline = true;
        window.isOffline = true;
        setSpill('offline', '● LOCAL');
        updateConnectionStatus();
        
        const h = document.getElementById('ehint');
        if (h) {
          h.innerHTML = `<div class="empty-icon">📴</div>
            <div class="empty-txt" style="font-weight:600;color:var(--text)">Lokaler Modus</div>
            <div class="empty-hint">Partner nicht erreichbar – Nachrichten werden später zugestellt</div>`;
        }
        
        toast('📴 Partner nicht erreichbar – Lokaler Modus aktiv');
      } else if (hasPartnerMessage) {
        console.log('✅ Partner hat geantwortet – bleibe im Live-Modus');
      } else if (!chatActive) {
        console.log('🚪 Chat wurde verlassen – kein Fallback nötig');
      } else {
        console.log('✅ Bleibe im aktuellen Modus');
      }
    }
    window.chatFallbackTimer = null;
  }, 10000); // 10 Sekunden warten
}

async function sendChatRequest(recipient) {
  try {
    await fetch(API_BASE + '/offline-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient,
        senderCode: myCode,
        senderName: myName,
        message: '__CHAT_REQUEST__',
        type: 'chat_request'
      })
    });
    console.log('✅ Chat-Request gesendet an', recipient);
  } catch (e) {
    console.warn('⚠️ Chat-Request fehlgeschlagen:', e);
  }
}
