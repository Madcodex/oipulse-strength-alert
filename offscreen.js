async function playAlertBeep() {
  const ctx = new AudioContext();
  try {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const now = ctx.currentTime;
    const master = ctx.createGain();
    // Louder overall level, still under clipping with soft envelopes.
    master.gain.value = 0.85;
    master.connect(ctx.destination);

    // Soft major chime (E5 → G#5 → B5), warmer than a sharp beep.
    const notes = [
      { freq: 659.25, start: 0.0, dur: 0.28, peak: 0.55 },
      { freq: 830.61, start: 0.14, dur: 0.32, peak: 0.58 },
      { freq: 987.77, start: 0.3, dur: 0.45, peak: 0.62 }
    ];

    for (const note of notes) {
      const start = now + note.start;
      const end = start + note.dur;

      // Fundamental (sine) + soft harmonic (triangle) for a pleasant bell body.
      for (const [type, level] of [
        ["sine", 1],
        ["triangle", 0.28]
      ]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(note.freq, start);

        const peak = note.peak * level;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(peak, start + 0.035);
        gain.gain.exponentialRampToValueAtTime(peak * 0.55, start + note.dur * 0.45);
        gain.gain.exponentialRampToValueAtTime(0.0001, end);

        osc.connect(gain);
        gain.connect(master);
        osc.start(start);
        osc.stop(end + 0.03);
      }
    }

    // Gentle low underscore so it feels fuller / carries better on laptop speakers.
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = "sine";
    bass.frequency.value = 196;
    bassGain.gain.setValueAtTime(0.0001, now);
    bassGain.gain.exponentialRampToValueAtTime(0.22, now + 0.05);
    bassGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    bass.connect(bassGain);
    bassGain.connect(master);
    bass.start(now);
    bass.stop(now + 0.75);

    await new Promise((resolve) => setTimeout(resolve, 900));
  } finally {
    await ctx.close().catch(() => {});
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "PLAY_ALERT_SOUND") return false;
  playAlertBeep()
    .then(() => sendResponse({ ok: true }))
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true;
});
