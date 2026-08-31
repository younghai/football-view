// Synthesised crowd ambience — filtered noise with slow swells.
// No audio assets; built entirely with WebAudio on first user toggle.

export function createCrowdAudio() {
  let ctx = null;
  let master = null;
  let running = false;
  let swellTimer = null;

  function start() {
    if (running) return;
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();

      // two seconds of pink-ish noise, looped
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + w * 0.03;
        b1 = 0.985 * b1 + w * 0.06;
        b2 = 0.95 * b2 + w * 0.12;
        data[i] = (b0 + b1 + b2) * 0.6;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;

      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 520;
      band.Q.value = 0.45;

      master = ctx.createGain();
      master.gain.value = 0;

      src.connect(band).connect(master).connect(ctx.destination);
      src.start();

      // constant slow undulation
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.11;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.035;
      lfo.connect(lfoGain).connect(master.gain);
      lfo.start();
    }
    ctx.resume();
    master.gain.setTargetAtTime(0.12, ctx.currentTime, 0.8);
    running = true;

    const swell = () => {
      if (!running) return;
      const t = ctx.currentTime;
      master.gain.setTargetAtTime(0.2 + Math.random() * 0.12, t, 1.2);
      master.gain.setTargetAtTime(0.12, t + 2.4, 1.8);
      swellTimer = setTimeout(swell, 6000 + Math.random() * 9000);
    };
    swellTimer = setTimeout(swell, 3500);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearTimeout(swellTimer);
    master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
  }

  return {
    toggle() {
      running ? stop() : start();
      return running;
    },
  };
}
