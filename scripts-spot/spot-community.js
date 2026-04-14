'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT – COMMUNITY & FILTER (spot-community.js)
// ══════════════════════════════════════════════════════════════════════════════

function buildRegionFilter() {
  const sel = document.getElementById('f-region');
  REGIONS.forEach(r => { const o = document.createElement('option'); o.value = o.textContent = r; sel.appendChild(o); });
}

async function loadCommunity() {
  locationCache.clear();
  onlineStatusCache.clear();
  verificationCache.clear();

  try {
    const res = await fetch(API + '/profiles?spot=' + SPOT);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    allProfiles = data;

    await Promise.all(allProfiles.map(p => Promise.all([
      fetchLocationForProfile(p.code),
      fetchOnlineStatus(p.code),
      fetchVerifications(p.code)
    ])));

    applyFilters();
  } catch (e) {
    console.warn('Server nicht erreichbar, nutze Cache:', e);
    if (allProfiles.length === 0) {
      allProfiles = [];
      applyFilters();
    }
    toast('📴 Offline – zeige gespeicherte Profile');
  }
}

async function fetchLocationForProfile(code) {
  if (locationCache.has(code)) return locationCache.get(code);
  try {
    const res = await fetch(API + '/location/' + code);
    if (res.ok) {
      const data = await res.json();
      locationCache.set(code, data);
      return data;
    }
  } catch(e) {}
  locationCache.set(code, null);
  return null;
}

async function fetchOnlineStatus(code) {
  if (onlineStatusCache.has(code)) return onlineStatusCache.get(code);
  try {
    const res = await fetch(API + '/online/' + code);
    if (res.ok) {
      const data = await res.json();
      onlineStatusCache.set(code, data);
      return data;
    }
  } catch(e) {}
  onlineStatusCache.set(code, { online: false });
  return { online: false };
}

async function fetchVerifications(code) {
  if (verificationCache.has(code)) return verificationCache.get(code);
  try {
    const res = await fetch(API + '/verifications/' + code);
    if (res.ok) {
      const data = await res.json();
      verificationCache.set(code, data);
      return data;
    }
  } catch(e) {}
  verificationCache.set(code, []);
  return [];
}

function toggleChip(el) {
  el.classList.toggle('active');
  applyFilters();
}

function applyFilters() {
  const region = document.getElementById('f-region').value;
  const ageRange = document.getElementById('f-age').value;
  const chips = [...document.querySelectorAll('.filter-chip.active')].map(c => c.dataset.filter);
  
  filtered = allProfiles.filter(p => {
    if (myCode && p.code === myCode) return false;
    if (region && p.region !== region) return false;
    if (ageRange && p.age) {
      const [lo, hi] = ageRange === '50+' ? [50,999] : ageRange.split('-').map(Number);
      if (p.age < lo || p.age > hi) return false;
    }
    const oCh = chips.filter(f => ['homo','bi','hetero'].includes(f));
    if (oCh.length && (!p.orientation || !oCh.includes(p.orientation))) return false;
    const rCh = chips.filter(f => ['bottom','top','versatile'].includes(f));
    if (rCh.length && (!p.role || !rCh.includes(p.role))) return false;
    if (chips.includes('trans') && !p.trans) return false;
    if (chips.includes('crossdresser') && !p.crossdresser) return false;
    return true;
  });
  renderAll();
}

function resetFilters() {
  document.getElementById('f-region').value = '';
  document.getElementById('f-age').value = '';
  document.querySelectorAll('.filter-chip.active').forEach(c => c.classList.remove('active'));
  applyFilters();
  }
