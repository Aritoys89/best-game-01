// falling.js — everything that falls out of the night sky: golden embers
// (catch for points and light), dark ash lumps (catch and the flame
// suffers) and pale frost shards (catch to slow the fall of time itself).
// This module owns spawning, motion, magnet drift and collision tests; the
// game in main.js decides what a catch or a miss means.

export const KIND = { EMBER: 'ember', ASH: 'ash', FROST: 'frost' };

export class FallingField {
  constructor(width, height) {
    this.W = width;
    this.H = height;
    this.items = [];
    this.spawnTimer = 0;
    this.elapsed = 0;
  }

  clear() {
    this.items = [];
    this.spawnTimer = 0.3;
  }

  // Difficulty knobs for a night: later nights fall faster, spawn thicker
  // and throw more ash into the mix.
  profile(night) {
    return {
      fall: 95 + (night - 1) * 22,                       // base fall speed px/s
      interval: Math.max(0.32, 0.56 - (night - 1) * 0.04), // seconds per spawn
      ashChance: Math.min(0.30, 0.13 + (night - 1) * 0.03),
      frostChance: 0.055,
    };
  }

  spawn(night) {
    const p = this.profile(night);
    const roll = Math.random();
    let kind = KIND.EMBER;
    if (roll < p.ashChance) kind = KIND.ASH;
    else if (roll < p.ashChance + p.frostChance) kind = KIND.FROST;
    const speed = p.fall * (0.82 + Math.random() * 0.45);
    this.items.push({
      kind,
      x: 24 + Math.random() * (this.W - 48),
      y: -18,
      vy: speed,
      sway: Math.random() * Math.PI * 2,   // gentle side-to-side drift phase
      swaySpeed: 0.8 + Math.random() * 1.4,
      r: kind === KIND.ASH ? 11 : kind === KIND.FROST ? 9 : 8,
      spin: Math.random() * Math.PI * 2,
    });
  }

  // Advance the field. `hooks` receives onCatch(item) and onMissEmber(item)
  // so the rules live in one place (main.js). timeScale is the frost effect.
  update(dt, night, keeper, magnetRadius, hooks) {
    const scaled = dt; // caller already applies the frost time scale
    this.elapsed += scaled;
    this.spawnTimer -= scaled;
    if (this.spawnTimer <= 0) {
      this.spawn(night);
      this.spawnTimer = this.profile(night).interval * (0.7 + Math.random() * 0.6);
    }

    const groundY = this.H - 38;
    const kept = [];
    for (const it of this.items) {
      it.sway += it.swaySpeed * scaled;
      it.spin += scaled * 2;
      it.y += it.vy * scaled;
      it.x += Math.sin(it.sway) * 14 * scaled;

      // Ember magnet upgrade: nearby embers bend toward the lantern.
      if (magnetRadius > 0 && it.kind === KIND.EMBER) {
        const dx = keeper.x - it.x;
        const dy = keeper.catchY - it.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < magnetRadius * magnetRadius && d2 > 4) {
          const d = Math.sqrt(d2);
          const pull = 260 * scaled * (1 - d / magnetRadius);
          it.x += (dx / d) * pull;
          it.y += (dy / d) * pull * 0.4;
        }
      }

      // Caught? The item reaches the basket rim inside its span.
      if (it.y >= keeper.catchY - 4 && it.y <= keeper.catchY + 16 &&
          Math.abs(it.x - keeper.x) <= keeper.basketHalf + it.r * 0.4) {
        hooks.onCatch(it);
        continue;
      }
      // Missed: it lands on the ridge.
      if (it.y > groundY) {
        if (it.kind === KIND.EMBER) hooks.onMissEmber(it);
        else hooks.onGround(it);
        continue;
      }
      kept.push(it);
    }
    this.items = kept;
  }

  draw(ctx) {
    for (const it of this.items) {
      if (it.kind === KIND.EMBER) this.drawEmber(ctx, it);
      else if (it.kind === KIND.ASH) this.drawAsh(ctx, it);
      else this.drawFrost(ctx, it);
    }
  }

  drawEmber(ctx, it) {
    const pulse = 1 + Math.sin(it.sway * 3) * 0.12;
    const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, 20 * pulse);
    g.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
    g.addColorStop(0.35, 'rgba(255, 186, 73, 0.75)');
    g.addColorStop(1, 'rgba(255, 140, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(it.x, it.y, 20 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff3cf';
    ctx.beginPath();
    ctx.arc(it.x, it.y, 3.4 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  drawAsh(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.spin * 0.4);
    ctx.fillStyle = '#23202b';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath(); // an irregular lump, not a clean circle
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = it.r * (0.78 + ((i * 37) % 10) / 22);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(140, 130, 160, 0.5)';
    ctx.beginPath();
    ctx.arc(-3, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawFrost(ctx, it) {
    ctx.save();
    ctx.translate(it.x, it.y);
    ctx.rotate(it.spin * 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 18);
    g.addColorStop(0, 'rgba(210, 240, 255, 0.5)');
    g.addColorStop(1, 'rgba(150, 210, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(205, 238, 255, 0.95)';
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 3; i++) { // a simple six-point snowflake star
      const a = (i / 3) * Math.PI;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -it.r, Math.sin(a) * -it.r);
      ctx.lineTo(Math.cos(a) * it.r, Math.sin(a) * it.r);
      ctx.stroke();
    }
    ctx.restore();
  }
}
