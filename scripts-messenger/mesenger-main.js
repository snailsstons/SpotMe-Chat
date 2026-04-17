'use strict';

window.addEventListener('load', () => {
  document.getElementById('mycode').textContent = myCode.slice(0,3) + ' · ' + myCode.slice(3,6);
  initDigits();
  renderPrev();
  renderMissed();
  initPeer();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  window.addEventListener('online', () => { if (!peer || peer.destroyed) initPeer(); });
  window.addEventListener('offline', () => { isOffline = true; updateConnectionStatus(); });

  const autoConnect = sessionStorage.getItem('sm_connect_to');
  if (autoConnect && peer) {
    sessionStorage.removeItem('sm_connect_to');
    setTimeout(() => {
      const inps = document.querySelectorAll('.dinp-new');
      autoConnect.split('').forEach((ch, i) => { if (inps[i]) { inps[i].value = ch; inps[i].classList.add('filled'); } });
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
      if (!localMissed.some(m => m.code === call.callerId && Math.abs(m.ts - new Date(call.timestamp).getTime()) < 300000)) {
        addMissed(call.callerId, call.callerName);
      }
    }
  }, 2000);
});

function goHome() {
  if (conn) { try { conn.close(); } catch(e) {} conn = null; }
  pendingConn = null;
  document.querySelectorAll('.dinp-new').forEach(d => { d.value = ''; d.classList.remove('filled'); });
  document.getElementById('cbtn').disabled = true;
  renderPrev();
  renderMissed();
  showScreen('s-home');
}
