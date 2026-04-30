'use strict';
// ══════════════════════════════════════════════════════════════════════════════
// SPOT DATES – FILTER & FILTER-MODAL (v1.0)
// Lokales Filtern, Filter-State, Lupe-Modal
// ══════════════════════════════════════════════════════════════════════════════

const FILTER_KEY = 'sm_filter_dates';
let filtersInitialized = false;

// ══════════════════════════════════════════════════════════════════════════════
// FILTER SPEICHERN & LADEN
// ══════════════════════════════════════════════════════════════════════════════

function saveFilterState() {
  const regionSelect = document.getElementById('f-region');
  const ageSelect = document.getElementById('f-age');
  const activeChips = document.querySelectorAll('#filter-chips .filter-chip.active');
  
  const state = {
    region: regionSelect?.value || '',
    age: ageSelect?.value || '',
    chips: [...activeChips].map(c => c.dataset.filter)
  };
  localStorage.setItem(FILTER_KEY, JSON.stringify(state));
}

function loadFilterState() {
  const saved = localStorage.getItem(FILTER_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch(e) {
    return null;
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER SEKTION RENDERN (Inline – versteckt, für Referenzen)
// ══════════════════════════════════════════════════════════════════════════════

function renderFilterSection(savedState = null) {
  const anchor = document.getElementById('filterAnchor');
  if (!anchor) return;
  
  const oldFilter = document.getElementById('filterDrawer');
  if (oldFilter) oldFilter.remove();
  
  const filterHTML = `
    <div class="filter-drawer" id="filterDrawer">
      <div class="filter-title">Community Filter</div>
      <div class="filter-select-row">
        <select class="filter-select" id="f-region" onchange="handleFilterChange()">
          <option value="">Alle Regionen</option>
        </select>
        <select class="filter-select" id="f-age" onchange="handleFilterChange()">
          <option value="">Alle Altersgruppen</option>
          <option value="18-29">18–29</option>
          <option value="30-39">30–39</option>
          <option value="40-49">40–49</option>
          <option value="50+">50+</option>
        </select>
      </div>
      <div class="filter-row" id="filter-chips">
        <div class="filter-chip" data-filter="beziehung" onclick="handleChipClick(this)">💕 Beziehung</div>
        <div class="filter-chip" data-filter="freundschaft" onclick="handleChipClick(this)">👥 Freundschaft</div>
        <div class="filter-chip" data-filter="casual" onclick="handleChipClick(this)">🍸 Casual</div>
      </div>
      <button class="reset-link" onclick="handleFilterReset()">✕ Filter zurücksetzen</button>
    </div>
  `;
  
  anchor.insertAdjacentHTML('beforeend', filterHTML);
  
  const regionSelect = document.getElementById('f-region');
  if (regionSelect && typeof REGIONS !== 'undefined') {
    while (regionSelect.options.length > 1) regionSelect.remove(1);
    REGIONS.forEach(r => {
      const option = document.createElement('option');
      option.value = r;
      option.textContent = r;
      regionSelect.appendChild(option);
    });
  }
  
  const state = savedState || loadFilterState();
  if (state) {
    if (state.region && regionSelect) {
      const optionExists = [...regionSelect.options].some(o => o.value === state.region);
      if (optionExists) {
        regionSelect.value = state.region;
      }
    }
    if (state.age) {
      const ageSelect = document.getElementById('f-age');
      if (ageSelect) ageSelect.value = state.age;
    }
    if (state.chips && state.chips.length > 0) {
      document.querySelectorAll('#filter-chips .filter-chip').forEach(chip => {
        if (state.chips.includes(chip.dataset.filter)) {
          chip.classList.add('active');
        }
      });
    }
  }
  
  filtersInitialized = true;
}

// ══════════════════════════════════════════════════════════════════════════════
// FILTER HANDLER
// ══════════════════════════════════════════════════════════════════════════════

function handleFilterChange() {
  saveFilterState();
  applyFiltersLocal();
}

function handleChipClick(chip) {
  chip.classList.toggle('active');
  saveFilterState();
  applyFiltersLocal();
}

function handleFilterReset() {
  document.querySelectorAll('#filter-chips .filter-chip').forEach(c => c.classList.remove('active'));
  const regionSelect = document.getElementById('f-region');
  const ageSelect = document.getElementById('f-age');
  if (regionSelect) regionSelect.value = '';
  if (ageSelect) ageSelect.value = '';
  localStorage.removeItem(FILTER_KEY);
  applyFiltersLocal();
}

// ══════════════════════════════════════════════════════════════════════════════
// 🆕 LOKALES FILTERN (ohne Server-Request!)
// ══════════════════════════════════════════════════════════════════════════════

function applyFiltersLocal() {
  const region = document.getElementById('f-region')?.value || '';
  const ageRange = document.getElementById('f-age')?.value || '';
  const chips = [...document.querySelectorAll('#filter-chips .filter-chip.active')].map(c => c.dataset.filter);
  
  filtered = allProfiles.filter(p => {
    if (myCode && p.code === myCode) return false;
    if (region && p.region !== region) return false;
    if (ageRange && p.age) {
      const [lo, hi] = ageRange === '50+' ? [50, 999] : ageRange.split('-').map(Number);
      if (p.age < lo || p.age > hi) return false;
    }
    const dateChips = chips.filter(f => ['beziehung', 'freundschaft', 'casual'].includes(f));
    if (dateChips.length && (!p.lookingFor || !dateChips.includes(p.lookingFor))) {
      return false;
    }
    return true;
  });
  
  if (filtered.length === 0) {
    currentIndex = 0;
  } else if (currentIndex >= filtered.length) {
    currentIndex = 0;
  }
  
  saveFilterState();
  renderList();
}

// ══════════════════════════════════════════════════════════════════════════════
// GLOBALE FILTER-FUNKTIONEN
// ══════════════════════════════════════════════════════════════════════════════

window.toggleChip = function(chip) {
  handleChipClick(chip);
};

window.resetFilters = function() {
  handleFilterReset();
};

window.applyFilters = function() {
  applyFiltersLocal();
};

// ══════════════════════════════════════════════════════════════════════════════
// 🔍 FILTER-MODAL (Lupe)
// ══════════════════════════════════════════════════════════════════════════════

window.toggleFilterModal = function() {
  const existing = document.getElementById('filterModal');
  if (existing) {
    existing.remove();
    return;
  }
  
  const currentRegion = document.getElementById('f-region')?.value || '';
  const currentAge = document.getElementById('f-age')?.value || '';
  const activeChips = [...document.querySelectorAll('#filter-chips .filter-chip.active')].map(c => c.dataset.filter);
  
  let regionOptions = '<option value="">Alle Regionen</option>';
  if (typeof REGIONS !== 'undefined') {
    REGIONS.forEach(r => {
      regionOptions += `<option value="${r}" ${r === currentRegion ? 'selected' : ''}>${r}</option>`;
    });
  }
  
  const html = `
    <div id="filterModal" onclick="this.remove()" style="
      position:fixed; top:0; left:0; width:100%; height:100%; 
      background:rgba(0,0,0,0.9); z-index:9999;
      display:flex; align-items:center; justify-content:center;
      animation: fadeIn 0.2s ease;
    ">
      <div onclick="event.stopPropagation()" style="
        background:var(--card,#1c222b); border:1px solid var(--bord);
        border-radius:20px; padding:1.5rem; width:90%; max-width:400px;
      ">
        <h3 style="color:var(--acc); margin-bottom:1rem; font-family:'Syne';">🔍 Filter & Suche</h3>
        
        <select id="modal-f-region" class="filter-select" style="width:100%; margin-bottom:0.5rem;">
          ${regionOptions}
        </select>
        
        <select id="modal-f-age" class="filter-select" style="width:100%; margin-bottom:0.5rem;">
          <option value="">Alle Altersgruppen</option>
          <option value="18-29" ${currentAge === '18-29' ? 'selected' : ''}>18–29</option>
          <option value="30-39" ${currentAge === '30-39' ? 'selected' : ''}>30–39</option>
          <option value="40-49" ${currentAge === '40-49' ? 'selected' : ''}>40–49</option>
          <option value="50+" ${currentAge === '50+' ? 'selected' : ''}>50+</option>
        </select>
        
        <div style="display:flex; gap:.4rem; flex-wrap:wrap; margin-bottom:1rem;">
          <div class="filter-chip ${activeChips.includes('beziehung') ? 'active' : ''}" data-filter="beziehung" onclick="this.classList.toggle('active')">💕 Beziehung</div>
          <div class="filter-chip ${activeChips.includes('freundschaft') ? 'active' : ''}" data-filter="freundschaft" onclick="this.classList.toggle('active')">👥 Freundschaft</div>
          <div class="filter-chip ${activeChips.includes('casual') ? 'active' : ''}" data-filter="casual" onclick="this.classList.toggle('active')">🍸 Casual</div>
        </div>
        
        <div style="display:flex; gap:.5rem;">
          <button onclick="applyModalFilters()" style="flex:1; padding:0.7rem; background:var(--acc); color:var(--bg); border:none; border-radius:12px; font-weight:700; cursor:pointer;">✅ Anwenden</button>
          <button onclick="resetModalFilters()" style="flex:1; padding:0.7rem; background:transparent; color:var(--muted2); border:1px solid var(--bord); border-radius:12px; cursor:pointer;">✕ Zurücksetzen</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', html);
};

window.applyModalFilters = function() {
  const region = document.getElementById('modal-f-region')?.value || '';
  const age = document.getElementById('modal-f-age')?.value || '';
  const chips = [...document.querySelectorAll('#filterModal .filter-chip.active')].map(c => c.dataset.filter);
  
  const realRegion = document.getElementById('f-region');
  const realAge = document.getElementById('f-age');
  if (realRegion) realRegion.value = region;
  if (realAge) realAge.value = age;
  
  document.querySelectorAll('#filter-chips .filter-chip').forEach(c => {
    c.classList.toggle('active', chips.includes(c.dataset.filter));
  });
  
  document.getElementById('filterModal')?.remove();
  applyFiltersLocal();
};

window.resetModalFilters = function() {
  document.getElementById('filterModal')?.remove();
  handleFilterReset();
};

console.log('✅ spot-dates-filter.js v1.0 geladen – Filter & Modal');
