// audio.js — every sound in EMBERFALL is synthesised with WebAudio.
// There are no audio files: chimes, thuds and the night ambience are all
// oscillators and filtered noise, created lazily on the first user gesture
// (browsers refuse to start an AudioContext before one).

const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24]; // minor pentatonic steps

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambienceOn = false;
  }

  // Create (or resume) the context. Safe to call on every gesture.
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
    }
  }

  // A short plucked tone. freq in Hz, dur in seconds.
  tone(freq, dur, { type = 'sine', vol = 0.2, slideTo = null, delay = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  // Catching an ember: a warm chime that climbs the scale with the combo.
  // Once the streak is long the chime opens into a quick three-note
  // arpeggio — the sound of a run going well.
  catchChime(combo) {
    const step = SCALE[Math.min(combo, SCALE.length - 1)];
    const base = 392 * Math.pow(2, step / 12);
    if (combo >= 6 && combo % 3 === 0) {
      [0, 1, 2].forEach((i) => {
        const s = SCALE[Math.min(combo + i, SCALE.length - 1)];
        this.tone(392 * Math.pow(2, s / 12), 0.3, { type: 'triangle', vol: 0.2, delay: i * 0.055 });
      });
      this.tone(base * 2, 0.22, { type: 'sine', vol: 0.07, delay: 0.11 });
      return;
    }
    this.tone(base, 0.28, { type: 'triangle', vol: 0.22 });
    this.tone(base * 2, 0.18, { type: 'sine', vol: 0.08 });
  }

  // A streak milestone: four notes sprinting up the scale.
  milestone() {
    [7, 10, 12, 15].forEach((s, i) =>
      this.tone(392 * Math.pow(2, s / 12), 0.32, { type: 'triangle', vol: 0.16, delay: i * 0.05 }));
  }

  // Catching a storm wisp: a bright zap that bends upward, then sparkles.
  wispCatch() {
    this.tone(1180, 0.22, { type: 'sawtooth', vol: 0.05, slideTo: 2360 });
    this.tone(2093, 0.3, { type: 'sine', vol: 0.1, delay: 0.05 });
    this.tone(2637, 0.34, { type: 'sine', vol: 0.07, delay: 0.11 });
  }

  // A wisp bursting on the ridge: a harsh little buzz and a noise snap.
  wispZap() {
    this.tone(210, 0.2, { type: 'square', vol: 0.14, slideTo: 55 });
    if (!this.ctx || this.muted) return;
    const dur = 0.09;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1600;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.16;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // The dying flame's heartbeat: two low thumps, the second softer.
  heartbeat() {
    this.tone(56, 0.16, { type: 'sine', vol: 0.5 });
    this.tone(50, 0.13, { type: 'sine', vol: 0.32, delay: 0.21 });
  }

  // Surviving a night: a four-note rise, then a shimmer on top.
  nightClear() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.tone(f, 0.55, { type: 'triangle', vol: 0.13, delay: i * 0.09 }));
    this.tone(1568, 0.7, { type: 'sine', vol: 0.05, delay: 0.38 });
  }

  // The gale arriving: a breath of noise swelling through a rising band.
  galeGust() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const dur = 1.4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.Q.value = 1.1;
    const t0 = ctx.currentTime;
    band.frequency.setValueAtTime(280, t0);
    band.frequency.exponentialRampToValueAtTime(950, t0 + dur * 0.7);
    band.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(0.12, t0 + dur * 0.45);
    gain.gain.linearRampToValueAtTime(0, t0 + dur);
    src.connect(band).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  // Catching ash: a dull, falling thud plus a breath of noise.
  ashThud() {
    this.tone(150, 0.3, { type: 'sine', vol: 0.4, slideTo: 45 });
    if (!this.ctx || this.muted) return;
    const dur = 0.18;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.25;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // Catching a frost shard: a quick crystalline arpeggio.
  frostShimmer() {
    [1318, 1568, 2093].forEach((f, i) =>
      this.tone(f, 0.35, { type: 'sine', vol: 0.12, delay: i * 0.06 }));
  }

  // A soft two-note motif when a new night begins.
  nightBell() {
    this.tone(523, 0.7, { type: 'sine', vol: 0.1 });
    this.tone(784, 0.9, { type: 'sine', vol: 0.08, delay: 0.18 });
  }

  // The Ash Golem announcing itself: a groan that slides down out of the
  // dark, with a breath of ash-noise under it.
  golemGroan() {
    this.tone(96, 1.5, { type: 'triangle', vol: 0.22, slideTo: 52 });
    this.tone(64, 1.5, { type: 'sine', vol: 0.2, slideTo: 40, delay: 0.08 });
  }

  // The golem's stomp: a deep thud felt more than heard, plus grit.
  golemStomp() {
    this.tone(68, 0.42, { type: 'sine', vol: 0.55, slideTo: 28 });
    if (!this.ctx || this.muted) return;
    const dur = 0.22;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 240;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.3;
    src.connect(filter).connect(gain).connect(this.master);
    src.start();
  }

  // Catching moonwater: a droplet blip that bends down, then a deep,
  // satisfied glug as the lantern drinks.
  moonSip() {
    this.tone(880, 0.16, { type: 'sine', vol: 0.14, slideTo: 520 });
    this.tone(196, 0.4, { type: 'sine', vol: 0.2, slideTo: 130, delay: 0.09 });
    this.tone(262, 0.35, { type: 'triangle', vol: 0.08, delay: 0.16 });
  }

  // Buying from the Keeper's Cache: a small bright coin-chime.
  cacheChime() {
    this.tone(1318, 0.3, { type: 'triangle', vol: 0.14 });
    this.tone(1760, 0.42, { type: 'sine', vol: 0.1, delay: 0.07 });
  }

  // Looping night air: slow filtered wind noise, faint ember crackle, and a
  // very quiet pad that cycles through a four-chord motif. Started once.
  startAmbience() {
    if (!this.ctx || this.ambienceOn) return;
    this.ambienceOn = true;
    const ctx = this.ctx;

    // Wind: looping noise through a wandering band-pass filter.
    const len = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const wind = ctx.createBufferSource();
    wind.buffer = buffer;
    wind.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 480;
    band.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.035;
    wind.connect(band).connect(windGain).connect(this.master);
    wind.start();
    const wander = ctx.createOscillator();
    wander.frequency.value = 0.07;
    const wanderGain = ctx.createGain();
    wanderGain.gain.value = 190;
    wander.connect(wanderGain).connect(band.frequency);
    wander.start();

    // Pad motif: Am — F — C — G, one chord every six seconds.
    const chords = [[110, 164.8, 261.6], [87.3, 174.6, 261.6], [98, 196, 293.7], [98, 146.8, 246.9]];
    let chordIdx = 0;
    const playChord = () => {
      if (!this.ambienceOn) return;
      const t0 = ctx.currentTime;
      for (const f of chords[chordIdx % chords.length]) {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = f;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(0.016, t0 + 1.6);
        g.gain.linearRampToValueAtTime(0, t0 + 6.2);
        osc.connect(g).connect(this.master);
        osc.start(t0);
        osc.stop(t0 + 6.4);
      }
      chordIdx++;
      this._padTimer = setTimeout(playChord, 6000);
    };
    playChord();

    // Crackle: tiny random pops, like a real flame settling.
    const crackle = () => {
      if (!this.ambienceOn) return;
      if (Math.random() < 0.75) {
        this.tone(1400 + Math.random() * 1800, 0.03, { type: 'square', vol: 0.008 });
      }
      this._crackleTimer = setTimeout(crackle, 260 + Math.random() * 700);
    };
    crackle();
  }
}
