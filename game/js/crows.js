// crows.js — the Ash Crow, the valley's second hunter. On some nights it
// crosses the high sky twice, and as it crosses it drops cinders — hot
// stones aimed a little toward where the keeper stands (see falling.js
// for the stones themselves). The crow inverts the game's first rule:
// everything else in the sky is for catching, but a cinder caught snuffs
// the flame like ash. The keeper's skill is to step aside, let the stone
// crack open on the ridge, and scoop up the embers it spills. This
// module owns the crow's flight, drop cadence and drawing; main.js
// decides when a crow night is and what its stones are worth.

export class AshCrow {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    this.baseY = 128;      // the height of its crossing lane
    this.speed = 118;      // a steady, unhurried wingbeat pace, px/s
    this.reset();
  }

  reset() {
    this.active = false;
    this.x = -80;
    this.y = this.baseY;
    this.dir = 1;
    this.t = 0;            // time aloft; drives the bob and the wings
    this.flap = 0;
    this.dropT = 0;        // seconds to the next cinder
    this.passes = 0;       // completed crossings; it leaves after two
  }

  // Take off from a random edge. Two crossings, then it is gone — a crow
  // night is a visit, not a siege.
  start() {
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir > 0 ? -60 : this.W + 60;
    this.t = 0;
    this.flap = 0;
    this.dropT = 1.7 + Math.random() * 0.8; // first stone a breath after it shows
    this.passes = 0;
    this.active = true;
  }

  update(dt, hooks = {}) {
    if (!this.active) return;
    this.t += dt;
    this.flap += dt * 9;
    this.x += this.dir * this.speed * dt;
    this.y = this.baseY + Math.sin(this.t * 1.6) * 24;

    // Stones fall only while the crow is over the valley — a drop at the
    // very edge would land where no keeper could ever answer it.
    this.dropT -= dt;
    if (this.dropT <= 0 && this.x > 46 && this.x < this.W - 46) {
      this.dropT = 2.4 + Math.random() * 0.9;
      if (hooks.onDrop) hooks.onDrop(this.x, this.y + 14);
    }

    // Off the far edge: turn for the second crossing, or leave for good.
    if ((this.dir > 0 && this.x > this.W + 70) || (this.dir < 0 && this.x < -70)) {
      this.passes += 1;
      if (this.passes >= 2) {
        this.active = false;
      } else {
        this.dir *= -1;
        this.dropT = Math.max(this.dropT, 1.2); // no stone the instant it turns
      }
    }
  }

  draw(ctx) {
    if (!this.active) return;
    const { x, y, dir } = this;
    const wing = Math.sin(this.flap) * 13;      // wing tips ride the beat
    const glide = Math.sin(this.flap * 0.5) * 2;

    ctx.save();
    ctx.translate(x, y + glide);
    ctx.scale(dir, 1); // drawn facing right; mirrored when it flies left

    // Wings: two broad strokes, the far one dimmer, tips lifted or
    // pressed by the wingbeat.
    ctx.fillStyle = 'rgba(10, 12, 20, 0.75)';
    ctx.beginPath(); // far wing
    ctx.moveTo(-2, -2);
    ctx.quadraticCurveTo(-16, -12 - wing * 0.7, -30, -6 - wing * 0.7);
    ctx.quadraticCurveTo(-16, -1, -3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0d0f16';
    ctx.beginPath(); // near wing
    ctx.moveTo(2, 0);
    ctx.quadraticCurveTo(-12, -14 - wing, -27, -8 - wing);
    ctx.quadraticCurveTo(-13, 2, 3, 5);
    ctx.closePath();
    ctx.fill();

    // Tail: a small fan behind.
    ctx.beginPath();
    ctx.moveTo(-14, 1);
    ctx.lineTo(-27, -4);
    ctx.lineTo(-25, 4);
    ctx.lineTo(-27, 10);
    ctx.lineTo(-13, 6);
    ctx.closePath();
    ctx.fill();

    // Body and head: one dark shape, beak forward, edged with a thread
    // of moonlight so the silhouette reads against the night sky.
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(190, 202, 235, 0.38)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.ellipse(0, 1, 16, 7.5, 0, Math.PI * 1.08, Math.PI * 1.72);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13, -2, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#05070c';
    ctx.beginPath(); // beak
    ctx.moveTo(18, -3.5);
    ctx.lineTo(27, -1);
    ctx.lineTo(18, 0.5);
    ctx.closePath();
    ctx.fill();

    // The ember eye: it has eaten too many stolen sparks to be dark.
    ctx.fillStyle = 'rgba(255, 166, 66, 0.95)';
    ctx.beginPath();
    ctx.arc(14.5, -3, 1.7, 0, Math.PI * 2);
    ctx.fill();

    // Claws, curled under the body — empty now; the next stone is coming.
    ctx.strokeStyle = '#0d0f16';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(2, 7);
    ctx.quadraticCurveTo(3, 11, 6, 11.5);
    ctx.moveTo(-4, 7);
    ctx.quadraticCurveTo(-3, 11, 0, 11.5);
    ctx.stroke();
    ctx.restore();
  }
}
