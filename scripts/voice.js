'use strict';

// ══════════════════════════════════════════════════════════════════════════════
// SPOTME – VOICE MESSAGES (voice.js)
// Sprachnachrichten aufnehmen und senden (MediaRecorder)
// ══════════════════════════════════════════════════════════════════════════════

let mediaRecorder = null;
let audioChunks = [];
let recordingStartTime = 0;

// ─────────────────────────────────────────────────────────────────────────────
// Mikrofon-Button im Chat ein-/ausschalten (Einstellung)
function toggleVoiceButton() {
  voiceEnabled = !voiceEnabled;
  localStorage.setItem('sm_voice_enabled', voiceEnabled);
  const btn = document.getElementById('voice-btn');
  if (btn) btn.style.display = voiceEnabled ? 'flex' : 'none';
  const icon = document.getElementById('voice-toggle-icon');
  const desc = document.getElementById('voice-toggle-desc');
  if (voiceEnabled) {
    icon.textContent = '🎤';
    desc.textContent = 'Aktiviert · Button in Chatleiste';
  } else {
    icon.textContent = '🔇';
    desc.textContent = 'Deaktiviert · Button ausgeblendet';
  }
  closeSheet();
}

// ─────────────────────────────────────────────────────────────────────────────
// Aufnahme starten / stoppen (wird vom Button im Chat aufgerufen)
async function toggleVoiceRecording() {
  if (!conn || !conn.open) {
    toast('⚠️ Keine aktive Verbindung');
    return;
  }
  const btn = document.getElementById('voice-btn');
  if (!mediaRecorder || mediaRecorder.state === 'inactive') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
      audioChunks = [];
      mediaRecorder.ondataavailable = e => {
        if (e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        btn.classList.remove('recording');
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        if (blob.size === 0) return;
        const id = Math.random().toString(36).slice(2, 10);
        const total = Math.ceil(blob.size / CHUNK);
        conn.send({
          t: 'audio-start',
          id,
          size: blob.size,
          total,
          duration: (Date.now() - recordingStartTime) / 1000
        });
        const reader = new FileReader();
        let off = 0, idx = 0;
        reader.onload = e => {
          conn.send({ t: 'audio-chunk', id, idx, data: e.target.result });
          off += CHUNK;
          idx++;
          if (off < blob.size) {
            reader.readAsArrayBuffer(blob.slice(off, off + CHUNK));
          } else {
            conn.send({ t: 'audio-end', id });
            toast('🎤 Sprachnachricht gesendet');
            const url = URL.createObjectURL(blob);
            const msg = {
              t: 'audio',
              url,
              duration: (Date.now() - recordingStartTime) / 1000,
              ts: Date.now(),
              own: true
            };
            appendMsg(msg);
            persistMsg(msg);
          }
        };
        reader.readAsArrayBuffer(blob.slice(0, CHUNK));
        stream.getTracks().forEach(t => t.stop());
        mediaRecorder = null;
      };
      mediaRecorder.start();
      recordingStartTime = Date.now();
      btn.classList.add('recording');
      toast('🎤 Aufnahme läuft...');
    } catch (e) {
      toast('❌ Mikrofon nicht verfügbar');
    }
  } else {
    mediaRecorder.stop();
  }
}