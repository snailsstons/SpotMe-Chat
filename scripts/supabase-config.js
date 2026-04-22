'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE KONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://SpotME-Projekt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_secret_i-RGqpry6MynZvpZ563NBQ_KwELnowF';

// 🆕 Prüfen, ob supabase schon existiert
if (typeof window.supabase === 'undefined') {
  console.error('❌ Supabase CDN nicht geladen!');
} else {
  // Client NUR erstellen, wenn nicht schon da
  if (typeof supabase === 'undefined') {
    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    window.supabaseClient = supabase; // Global verfügbar machen
    console.log('✅ Supabase Client geladen');
  } else {
    console.log('ℹ️ Supabase Client existiert bereits');
  }
}
