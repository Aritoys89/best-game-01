// golem.js — the Ash Golem, the boss of every fifth night. A mountain of
// cinder and old ash that crosses the valley once, slowly, while the
// night runs. It is a hazard with a body: embers that fall into it are
// swallowed, its shadow drinks the lantern's light faster, and every few
// seconds it stomps — shaking a burst of bonus embers loose from the
// ridge for a keeper quick enough to catch them. This module owns the
// golem's body, walk, stomp cadence and drawing; main.js decides what
// surviving it is worth.

import { KIND } from './falling.js';

export class Golem {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    this.feetY = height - 38;          // the ridge line it walks
    this.heightPx = 218;               // silhouette height
    this.topY = this.feetY - this.heightPx;
    this.bodyHalf = 62;                // half-width of the body mass
    this.shadowHalf = this.bodyHalf + 36; // where its shadow falls
    this.speed = 25;                   // a slow, geological pace, px/s
    this.active = false;
    this.x = -220;
    this.dir = 1;
    this.stompT = 2.6;                 // seconds to the next stomp
    this.lift = 0;                     // 0..1 telegraph: the stomp winding up
    this.slam = 0;                     // 1 the instant of a stomp, decays fast
    this.walkPhase = 0;
  }

  reset() {
    this.active = false;
    this.x = -220;
    this.lift = 0;
    this.slam = 0;
  }

  // Begin the crossing from a random edge, walking to the other one. At
  // this pace the crossing takes about as long as the night itself.
  start() {
    this.dir = Math.random() < 0.5 ? 1 : -1;
    this.x = this.dir > 0 ? -150 : this.W + 150;
    this.stompT = 2.6;
    this.lift = 0;
    this.slam = 0;
    this.active = true;
  }

  update(dt, hooks = {}) {
    if (!this.active) return;
    this.walkPhase += dt * 2.1;
    this.x += this.dir * this.speed * dt;
    this.slam = Math.max(0, this.slam - dt * 4.5);

    // The stomp: a slow wind-up over the last 0.6 s (the lift the player
    // learns to read), then the foot comes down and the ridge answers.
    this.stompT -= dt;
    if (this.stompT <= 0) {
      this.stompT = 4.3 + Math.random() * 0.9;
      this.lift = 0;
      this.slam = 1;
      if (hooks.onStomp) hooks.onStomp(this);
    } else if (this.stompT < 0.6) {
      this.lift = Math.min(1, (0.6 - this.stompT) / 0.6);
    } else {
      this.lift = 0;
    }

    if ((this.dir > 0 && this.x > this.W + 170) || (this.dir < 0 && this.x < -170)) {
      this.active = false;
    }
  }

  // The keeper standing in the shadow the golem throws across the ridge.
  inShadow(x) {
    return this.active && Math.abs(x - this.x) <= this.shadowHalf;
  }

  // Does this falling thing vanish into the golem's body? Only honest sky
  // embers on their way down — the lantern's own fountain embers and the
  // stomp's gifts arc free, and ash, frost, wisps and moonwater pass the
  // bulk like weather past a cliff.
  absorbs(it) {
    if (!this.active) return false;
    if (it.kind !== KIND.EMBER || it.bonus || it.vy <= 0) return false;
    return it.y > this.topY + 14 && it.y < this.feetY - 6 &&
      Math.abs(it.x - this.x) < this.bodyHalf - 4;
  }

  draw(ctx, keeperX) {
    if (!this.active) return;
    const { x, feetY } = this;
    const bob = Math.sin(this.walkPhase) * 2.5;
    const face = keeperX >= x ? 1 : -1;

    // The shadow it throws: a cold pool on the ridge, wide as the drain
    // zone the keeper feels.
    ctx.fillStyle = 'rgba(2, 2, 8, 0.5)';
    ctx.beginPath();
    ctx.ellipse(x, feetY + 8, this.shadowHalf, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(40, 30, 70, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, feetY + 8, this.shadowHalf * 0.7, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x, feetY + this.slam * 5);
    ctx.scale(1, 1 - this.slam * 0.025);

    const hipY = -96 + bob * 0.4;
    const shoulderY = -this.heightPx + 44 + bob;
    const legSwing = Math.sin(this.walkPhase) * 9;

    // Legs: two cinder pillars, stepping slowly.
    ctx.fillStyle = '#0c0f1a';
    for (const side of [-1, 1]) {
      const footX = side * 26 + (side === this.dir ? legSwing : -legSwing) * 0.7;
      ctx.beginPath();
      ctx.moveTo(side * 20 - 13, hipY);
      ctx.lineTo(side * 20 + 13, hipY);
      ctx.lineTo(footX + 15, -4);
      ctx.lineTo(footX - 15, -4);
      ctx.closePath();
      ctx.fill();
    }

    // Torso and shoulders: one great hunched mass.
    const body = new Path2D();
    body.moveTo(-this.bodyHalf, hipY + 6);
    body.quadraticCurveTo(-this.bodyHalf - 8, shoulderY + 42, -this.bodyHalf + 12, shoulderY + 8);
    body.quadraticCurveTo(0, shoulderY - 16, this.bodyHalf - 12, shoulderY + 8);
    body.quadraticCurveTo(this.bodyHalf + 8, shoulderY + 42, this.bodyHalf, hipY + 6);
    body.quadraticCurveTo(0, hipY + 22, -this.bodyHalf, hipY + 6);
    ctx.fillStyle = '#101423';
    ctx.fill(body);
    ctx.strokeStyle = 'rgba(255, 160, 70, 0.16)';
    ctx.lineWidth = 2;
    ctx.stroke(body);

    // Arms: the far one hangs; the near one is the stomping arm and
    // rises with the telegraph before it falls.
    ctx.strokeStyle = '#0c0f1a';
    ctx.lineCap = 'round';
    ctx.lineWidth = 21;
    ctx.beginPath(); // far arm, hanging
    ctx.moveTo(-face * (this.bodyHalf - 8), shoulderY + 26);
    ctx.quadraticCurveTo(-face * (this.bodyHalf + 10), -110, -face * (this.bodyHalf + 2), -34);
    ctx.stroke();
    ctx.beginPath(); // near arm: raised by the lift, dropped by the slam
    const handY = -34 - this.lift * 74 + this.slam * 30;
    ctx.moveTo(face * (this.bodyHalf - 8), shoulderY + 26);
    ctx.quadraticCurveTo(face * (this.bodyHalf + 12), -120 - this.lift * 40, face * (this.bodyHalf + 4), handY);
    ctx.stroke();
    ctx.lineCap = 'butt';

    // Head: small, sunk between the shoulders, watching the lantern.
    ctx.fillStyle = '#0a0d17';
    ctx.beginPath();
    ctx.ellipse(face * 6, shoulderY + 6, 21, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    const emberEye = 0.65 + Math.sin(this.walkPhase * 0.7) * 0.3;
    ctx.fillStyle = `rgba(255, 166, 66, ${emberEye})`;
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(face * 6 + side * 7 + face * 2, shoulderY + 4, 2.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Ember cracks: the old fire inside it, showing through the ash.
    ctx.strokeStyle = `rgba(255, 130, 40, ${0.34 + Math.sin(this.walkPhase * 0.9) * 0.12})`;
    ctx.lineWidth = 1.6;
    const cracks = [
      [[-30, -150], [-14, -128], [-22, -104]],
      [[16, -168], [8, -142], [20, -118], [12, -96]],
      [[-4, -86], [6, -66], [-2, -50]],
    ];
    for (const line of cracks) {
      ctx.beginPath();
      line.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py + bob) : ctx.lineTo(px, py + bob)));
      ctx.stroke();
    }
    ctx.restore();
  }
}
