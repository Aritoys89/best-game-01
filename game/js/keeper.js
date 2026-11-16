// keeper.js — the lantern keeper: the player character. She slides along
// the ridge at the bottom of the valley carrying the last lantern. This
// module owns her position, the lantern's light level (the game's health),
// the size of the basket that catches falling things, and her drawing —
// including the glow whose radius is the light level made visible. She
// leans into her movement, the glow breathes, a dying flame pulses with
// the heartbeat the game sounds, and a kindled flame (a caught wisp,
// see main.js) burns visibly hotter with sparks in orbit.

export class Keeper {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    this.reset();
  }

  reset() {
    this.x = this.W / 2;          // centre of the lantern
    this.y = this.H - 64;         // lantern height above the ridge
    this.basketHalf = 34;         // half-width of the catching basket
    this.light = 80;              // 0..100 — the flame's strength
    this.maxLight = 100;
    this.drainPerSec = 1.55;      // how fast the night eats the flame
    this.speed = 620;             // keyboard glide speed, px/s
    this.shield = false;          // ash shield upgrade: blocks one ash hit
    this.flicker = 0;             // flame animation phase
    this.vx = 0;                  // smoothed horizontal velocity, px/s
    this.tilt = 0;                // lean into movement, radians
    this.heartPulse = 0;          // 1 at each heartbeat, decays away
    this.kindled = false;         // a wisp's fire is in the flame
  }

  // The rim of the basket, where catches register.
  get catchY() { return this.y - 16; }

  // Glow radius in px: the heart of the game's look. Full light lights up
  // most of the valley; a dying flame leaves only a small halo. The radius
  // breathes slowly, flares while kindled, and throbs with each heartbeat
  // when the light runs low.
  glowRadius() {
    let r = 90 + (this.light / this.maxLight) * 300;
    r *= 1 + Math.sin(this.flicker * 0.33) * 0.03;
    if (this.kindled) r *= 1.16;
    if (this.light < 30) r *= 1 + this.heartPulse * 0.13;
    return r;
  }

  update(dt, input) {
    this.flicker += dt * 9;
    this.heartPulse = Math.max(0, this.heartPulse - dt * 2.4);
    const prevX = this.x;
    const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (dir !== 0) {
      this.x += dir * this.speed * dt;
    } else if (input.mouseX !== null && input.mouseActive) {
      // Glide toward the pointer with a little weight, so fast flicks of
      // the mouse still feel like carrying something fragile.
      const dx = input.mouseX - this.x;
      this.x += dx * Math.min(1, dt * 14);
    }
    const margin = this.basketHalf + 6;
    this.x = Math.max(margin, Math.min(this.W - margin, this.x));
    // Smoothed velocity drives the lean and the spark trail in main.js.
    const instV = dt > 0 ? (this.x - prevX) / dt : 0;
    this.vx += (instV - this.vx) * Math.min(1, dt * 10);
    const targetTilt = Math.max(-0.17, Math.min(0.17, this.vx * 0.00028));
    this.tilt += (targetTilt - this.tilt) * Math.min(1, dt * 8);
    this.light -= this.drainPerSec * dt;
    if (this.light > this.maxLight) this.light = this.maxLight;
  }

  addLight(amount) {
    this.light = Math.min(this.maxLight, this.light + amount);
  }

  draw(ctx) {
    const { x, y } = this;
    const kindleBoost = this.kindled ? 1.22 : 1;
    const flame = (1 + Math.sin(this.flicker) * 0.08 + Math.sin(this.flicker * 2.7) * 0.04) * kindleBoost;
    const lit = this.light / this.maxLight;

    // Halo on the ridge beneath her.
    const halo = ctx.createRadialGradient(x, y, 4, x, y, 90 * flame);
    halo.addColorStop(0, `rgba(255, 170, 60, ${0.20 * lit + 0.04})`);
    halo.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 95, y - 95, 190, 190);

    // Everything she carries leans with her stride.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(this.tilt);

    // The keeper herself: a small cloaked figure, mostly silhouette.
    ctx.save();
    ctx.translate(0, 22);
    ctx.fillStyle = '#131a2e';
    ctx.beginPath(); // cloak
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(13, -18, 15, 8);
    ctx.lineTo(-15, 8);
    ctx.quadraticCurveTo(-13, -18, 0, -34);
    ctx.fill();
    ctx.fillStyle = '#1d2742';
    ctx.beginPath(); // hood
    ctx.arc(0, -32, 8.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 205, 130, 0.85)';
    ctx.beginPath(); // a sliver of face in the lantern light
    ctx.arc(1.5, -31, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Arm reaching up to the lantern pole.
    ctx.strokeStyle = '#131a2e';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(8, -2);
    ctx.quadraticCurveTo(14, -18, 2, -26);
    ctx.stroke();

    // Lantern frame.
    ctx.strokeStyle = '#2a2118';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -46);
    ctx.lineTo(0, -34);
    ctx.stroke();
    ctx.fillStyle = '#241b12';
    ctx.fillRect(-13, -36, 26, 5);   // cap
    ctx.fillRect(-15, -6, 30, 5);    // base / basket rim

    // The basket: a shallow arc the width of the catch zone.
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-this.basketHalf, -4);
    ctx.quadraticCurveTo(0, 8, this.basketHalf, -4);
    ctx.stroke();

    // Glass and flame. A kindled flame burns whiter at the heart.
    const glassGrad = ctx.createRadialGradient(0, -18, 1, 0, -18, 15 * flame);
    glassGrad.addColorStop(0, `rgba(255, 236, 170, ${0.55 + 0.4 * lit})`);
    glassGrad.addColorStop(0.55, `rgba(255, 176, 64, ${0.30 + 0.3 * lit})`);
    glassGrad.addColorStop(1, 'rgba(255, 140, 30, 0.02)');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(0, -18, 12.5 * flame, 15 * flame, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.kindled
      ? `rgba(255, 252, 240, ${0.65 + 0.35 * lit})`
      : `rgba(255, 250, 220, ${0.5 + 0.5 * lit})`;
    ctx.beginPath(); // flame core
    ctx.ellipse(0, -16, 3.6 * flame, 6.5 * flame, 0, 0, Math.PI * 2);
    ctx.fill();

    // Kindled sparks: three embers caught in orbit around the flame.
    if (this.kindled) {
      ctx.fillStyle = 'rgba(255, 214, 130, 0.9)';
      for (let i = 0; i < 3; i++) {
        const a = this.flicker * 1.9 + (i / 3) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 21, -18 + Math.sin(a) * 9, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Ash shield: a faint ring while the shield is charged.
    if (this.shield) {
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(0, -16, 24 + Math.sin(this.flicker * 0.6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}
