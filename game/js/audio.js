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
  catchChime(combo) {
    const step = SCALE[Math.min(combo, SCALE.length - 1)];
    const base = 392 * Math.pow(2, step / 12);
    this.tone(base, 0.28, { type: 'triangle', vol: 0.22 });
    this.tone(base * 2, 0.18, { type: 'sine', vol: 0.08 });
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
