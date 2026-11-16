// keeper.js — the lantern keeper: the player character. She slides along
// the ridge at the bottom of the valley carrying the last lantern. This
// module owns her position, the lantern's light level (the game's health),
// the size of the basket that catches falling things, and her drawing —
// including the glow whose radius is the light level made visible.

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
  }

  // The rim of the basket, where catches register.
  get catchY() { return this.y - 16; }

  // Glow radius in px: the heart of the game's look. Full light lights up
  // most of the valley; a dying flame leaves only a small halo.
  glowRadius() {
    return 90 + (this.light / this.maxLight) * 300;
  }

  update(dt, input) {
    this.flicker += dt * 9;
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
    this.light -= this.drainPerSec * dt;
    if (this.light > this.maxLight) this.light = this.maxLight;
  }

  addLight(amount) {
    this.light = Math.min(this.maxLight, this.light + amount);
  }

  draw(ctx) {
    const { x, y } = this;
    const flame = 1 + Math.sin(this.flicker) * 0.08 + Math.sin(this.flicker * 2.7) * 0.04;
    const lit = this.light / this.maxLight;

    // Halo on the ridge beneath her.
    const halo = ctx.createRadialGradient(x, y, 4, x, y, 90 * flame);
    halo.addColorStop(0, `rgba(255, 170, 60, ${0.20 * lit + 0.04})`);
    halo.addColorStop(1, 'rgba(255, 150, 40, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 95, y - 95, 190, 190);

    // The keeper herself: a small cloaked figure, mostly silhouette.
    ctx.save();
    ctx.translate(x, y + 22);
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
    ctx.moveTo(x + 8, y - 2);
    ctx.quadraticCurveTo(x + 14, y - 18, x + 2, y - 26);
    ctx.stroke();

    // Lantern frame.
    ctx.strokeStyle = '#2a2118';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y - 46);
    ctx.lineTo(x, y - 34);
    ctx.stroke();
    ctx.fillStyle = '#241b12';
    ctx.fillRect(x - 13, y - 36, 26, 5);   // cap
    ctx.fillRect(x - 15, y - 6, 30, 5);    // base / basket rim

    // The basket: a shallow arc the width of the catch zone.
    ctx.strokeStyle = '#3a2a16';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - this.basketHalf, y - 4);
    ctx.quadraticCurveTo(x, y + 8, x + this.basketHalf, y - 4);
    ctx.stroke();

    // Glass and flame.
    const glassGrad = ctx.createRadialGradient(x, y - 18, 1, x, y - 18, 15 * flame);
    glassGrad.addColorStop(0, `rgba(255, 236, 170, ${0.55 + 0.4 * lit})`);
    glassGrad.addColorStop(0.55, `rgba(255, 176, 64, ${0.30 + 0.3 * lit})`);
    glassGrad.addColorStop(1, 'rgba(255, 140, 30, 0.02)');
    ctx.fillStyle = glassGrad;
    ctx.beginPath();
    ctx.ellipse(x, y - 18, 12.5 * flame, 15 * flame, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 250, 220, ${0.5 + 0.5 * lit})`;
    ctx.beginPath(); // flame core
    ctx.ellipse(x, y - 16, 3.6 * flame, 6.5 * flame, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ash shield: a faint ring while the shield is charged.
    if (this.shield) {
      ctx.strokeStyle = 'rgba(160, 210, 255, 0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y - 16, 24 + Math.sin(this.flicker * 0.6) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
