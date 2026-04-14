'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – KEEPALIVE & HEARTBEAT (spot-keepalive.js)
// ══════════════════════════════════════════════════════════════════════════════

function startKeepalive() {
  if (keepaliveTimer) clearInterval(keepaliveTimer);
  keepaliveTimer = setInterval(async () => {
    if (!isPublished || !myProfile) return;
    if (isPublished && myProfile) {
      try { 
        const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
        await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: myCode, name: myProfile.name, age,
            region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
            orientation: myProfile.orientation || null, role: myProfile.role || null,
            trans: myProfile.trans || false, crossdresser: myProfile.crossdresser || false, bio: myProfile.bio || null,
            token: myToken, spot: SPOT
          })
        });
      } catch(e) {}
    }
    await loadCommunity();
  }, KEEPALIVE_INTERVAL);
}

async function verifyAndRepublish() {
  try {
    const res = await fetch(API + '/profile/' + myCode);
    if (res.status === 404) await togglePublish();
  } catch(e) {}
}

function startHeartbeat() {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  const sendHeartbeat = () => {
    if (!myCode || !isPublished) return;
    fetch(API + '/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: myCode, spot: SPOT })
    }).catch(() => {});
  };
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

function startAutoRefresh() {
  if (autoRefreshTimer) clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => {
    loadCommunity().then(() => renderAll()).catch(e => console.warn('Auto-refresh fehlgeschlagen', e));
  }, AUTO_REFRESH_INTERVAL);
}
