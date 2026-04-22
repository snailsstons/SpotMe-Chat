'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SUPABASE KONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = 'https://SpotME-Projekt.supabase.co';
const SUPABASE_ANON_KEY = 'sb_secret_i-RGqpry6MynZvpZ563NBQ_KwELnowF';

// Supabase Client initialisieren
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('✅ Supabase Client geladen');

// Optional: Test-Funktion
async function testSupabase() {
  const { data, error } = await supabase
    .from('profiles')
    .select('count', { count: 'exact' });
  
  if (error) {
    console.error('❌ Supabase Fehler:', error.message);
  } else {
    console.log('✅ Supabase verbunden!');
  }
}

// Test beim Laden
setTimeout(() => testSupabase(), 1000);
