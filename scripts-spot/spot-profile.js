async function togglePublish() {
  if (!myProfile || !myCode) { toast('⚠️ Profil unvollständig'); return; }
  if (!myProfile.name || !myProfile.region) { toast('⚠️ Profilname und Region sind Pflicht'); return; }
  const btn = document.getElementById('publish-toggle-small');
  btn.style.opacity = '.5'; btn.style.pointerEvents = 'none';
  try {
    if (isPublished) {
      if (!myToken) {
        const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
        const r = await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: myCode, name: myProfile.name, age,
            region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
            orientation: myProfile.orientation || null, role: myProfile.role || null,
            trans: myProfile.trans || false, crossdresser: myProfile.crossdresser || false, bio: myProfile.bio || null,
            spot: SPOT
          })
        });
        if (r.ok) { const d = await r.json(); if (d.token) { myToken = d.token; localStorage.setItem(TOKEN_KEY, myToken); } }
      }
      const delRes = await fetch(API + '/profile/' + myCode, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: myToken, spot: SPOT })
      });
      if (!delRes.ok) throw new Error('HTTP ' + delRes.status);
      isPublished = false;
      localStorage.setItem('sm_spot_published_' + SPOT, '0');
      toast('○ Profil aus Community entfernt');
    } else {
      const age = myProfile.year ? (new Date().getFullYear() - myProfile.year) : null;
      const payload = {
        code: myCode, name: myProfile.name, age,
        region: myProfile.region, province: myProfile.province || null, city: myProfile.city || null,
        orientation: myProfile.orientation || null, role: myProfile.role || null,
        trans: myProfile.trans || false, crossdresser: myProfile.crossdresser || false, bio: myProfile.bio || null,
        token: myToken || undefined, spot: SPOT
      };
      let res = await fetch(API + '/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.status === 403) {
        myToken = '';
        localStorage.removeItem(TOKEN_KEY);
        payload.token = undefined;
        res = await fetch(API + '/profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data.token) {
        myToken = data.token;
        localStorage.setItem(TOKEN_KEY, myToken);  // 🆕 GLOBAL speichern!
      }
      isPublished = true;
      localStorage.setItem('sm_spot_published_' + SPOT, '1');
      toast('✅ Profil veröffentlicht');
    }
    updatePublishUI();
    await loadCommunity();
    renderAll();
  } catch(e) { toast('⚠️ Fehler: ' + e.message); }
  finally { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
          }
