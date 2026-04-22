'use strict';
console.log('--- loading supabase-config.js');

// ═══════════════════════════════════════════════════════════════════════════
// SUPABASE KONFIGURATION (MIT WARTESCHLEIFE)
// ═══════════════════════════════════════════════════════════════════════════

(function() {
    const SUPABASE_URL = 'https://SpotME-Projekt.supabase.co';
    const SUPABASE_ANON_KEY = 'sb_secret_i-RGqpry6MynZvpZ563NBQ_KwELnowF';
    
    let attempts = 0;
    const maxAttempts = 20; // 10 Sekunden warten
    
    function tryInit() {
        attempts++;
        
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            console.log('✅ Supabase Client bereit nach', attempts, 'Versuchen');
            return true;
        }
        
        if (attempts < maxAttempts) {
            setTimeout(tryInit, 500);
        } else {
            console.error('❌ Supabase CDN nicht geladen nach', maxAttempts, 'Versuchen');
        }
        return false;
    }
    
    // Starte die Prüfung
    tryInit();
})();
