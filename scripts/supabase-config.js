'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE KONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://SpotME-Projekt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_secret_i-RGqpry6MynZvpZ563NBQ_KwELnowF';

// Client erstellen, wenn Supabase CDN geladen ist
if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = client;
  
  // Event auslösen, damit andere Scripts es nutzen können
  document.dispatchEvent(new CustomEvent('supabase-ready', { detail: { client } }));
  
  console.log('✅ Supabase Client initialisiert');
} else {
  console.error('❌ Supabase CDN nicht geladen!');
}
