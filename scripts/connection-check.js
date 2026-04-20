'use strict';

console.log('✅ connection-check.js geladen – Heartbeat für Render');

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VERBINDUNGS-CHECK (Render-optimiert)
// Heartbeat alle 5 Sekunden gegen /ping Endpunkt
// ══════════════════════════════════════════════════════════════════════════════

let heartbeatTimer = null;
let serverOnline = false;
let lastPing = 0;

// 🆕 Heartbeat: Alle 5 Sekunden prüfen
function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  
  heartbeatTimer = setInterval(async () => {
    await checkServerConnection();
  }, 5000); // Alle 5 Sekunden
  
  console.log('💓 Heartbeat gestartet (5s Intervall)');
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    console.log('💓 Heartbeat gestoppt');
  }
}

// 🆕 Echte Verbindung prüfen (Render /ping)
async function checkServerConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s Timeout
    
    const res = await fetch(`${API_BASE}/ping`, {
      method: 'HEAD',
      signal: controller.signal,
      cache: 'no-cache',
      mode: 'cors'
    });
    
    clearTimeout(timeoutId);
    
    const wasOnline = serverOnline;
    serverOnline = res.ok;
    lastPing = Date.now();
    
    // Status nur bei Änderung aktualisieren
    if (wasOnline !== serverOnline) {
      updateConnectionUI();
      
      if (serverOnline) {
        console.log('🟢 Server erreichbar');
        toast('🟢 Server verbunden', 1000);
        
        // Pending-Nachrichten senden
        if (typeof manualFlushAll === 'function') {
          setTimeout(() => manualFlushAll(), 500);
        }
      } else {
        console.log('🔴 Server nicht erreichbar');
      }
    }
    
    return serverOnline;
  } catch (e) {
    if (serverOnline !== false) {
      serverOnline = false;
      updateConnectionUI();
      console.log('🔴 Server offline:', e.message);
    }
    return false;
  }
}

// 🆕 UI aktualisieren
function updateConnectionUI() {
  const statusBadge = document.getElementById('header-status');
  if (statusBadge) {
    if (serverOnline) {
      statusBadge.textContent = '● ONLINE';
      statusBadge.style.color = '#00e5c0';
    } else {
      statusBadge.textContent = '○ OFFLINE';
      statusBadge.style.color = '#ff6b9d';
    }
  }
  
  // Globale Variable synchronisieren
  window.isServerOnline = serverOnline;
  
  // Auch isOffline anpassen
  if (!serverOnline) {
    window.isOffline = true;
    if (typeof setSpill === 'function') {
      setSpill('offline', '○ LOCAL');
    }
  }
}

// 🆕 Vor wichtigen Aktionen prüfen
async function ensureConnection() {
  // Browser sagt offline → sofort false
  if (!navigator.onLine) return false;
  
  // Letzter Ping < 2 Sekunden → vertrauen
  if (Date.now() - lastPing < 2000) return serverOnline;
  
  // Sonst: Echtzeit-Check
  return await checkServerConnection();
}

// 🆕 Status für andere Module
function isServerOnline() {
  return serverOnline;
}

// Exports
window.startHeartbeat = startHeartbeat;
window.stopHeartbeat = stopHeartbeat;
window.checkServerConnection = checkServerConnection;
window.ensureConnection = ensureConnection;
window.isServerOnline = isServerOnline;
