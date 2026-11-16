// falling.js — everything that falls out of the night sky: golden embers
// (catch for points and light), dark ash lumps (catch and the flame
// suffers), pale frost shards (catch to slow the fall of time itself) and
// storm wisps — rare violet orbs that dart sideways as they fall. A wisp
// caught kindles the flame (see main.js); a wisp that strikes the ridge
// near the keeper bursts in a zap. This module owns spawning, motion,
// magnet drift and collision tests; the game in main.js decides what a
// catch or a miss means.

export const KIND = { EMBER: 'ember', ASH: 'ash', FROST: 'frost', WISP: 'wisp' };

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
  // and throw more ash (and a few more wisps) into the mix.
  profile(night) {
    return {
      fall: 95 + (night - 1) * 22,                       // base fall speed px/s
      interval: Math.max(0.32, 0.56 - (night - 1) * 0.04), // seconds per spawn
      ashChance: Math.min(0.30, 0.13 + (night - 1) * 0.03),
      frostChance: 0.055,
      wispChance: Math.min(0.075, 0.038 + (night - 1) * 0.007),
    };
  }

  spawn(night) {
    const p = this.profile(night);
    const roll = Math.random();
    let kind = KIND.EMBER;
    if (roll < p.ashChance) kind = KIND.ASH;
    else if (roll < p.ashChance + p.frostChance) kind = KIND.FROST;
    else if (roll < p.ashChance + p.frostChance + p.wispChance) kind = KIND.WISP;
    const speed = p.fall * (0.82 + Math.random() * 0.45) * (kind === KIND.WISP ? 1.18 : 1);
    this.items.push({
      kind,
      x: 24 + Math.random() * (this.W - 48),
      y: -18,
      vy: speed,
      vx: 0,          // horizontal velocity (fountain embers, wisp darts)
      grav: 0,        // gravity for arcing items; 0 = steady fall
      noCatchT: 0,    // fountain embers cannot be caught while this runs
      bonus: false,   // fountain embers never break a combo when missed
      dartT: 0.3 + Math.random() * 0.5, // wisps: time to the next dart
      sway: Math.random() * Math.PI * 2,   // gentle side-to-side drift phase
      swaySpeed: 0.8 + Math.random() * 1.4,
      r: kind === KIND.ASH ? 11 : kind === KIND.WISP ? 10 : kind === KIND.FROST ? 9 : 8,
      spin: Math.random() * Math.PI * 2,
    });
  }

  // A fountain of bonus embers from the lantern itself — the reward for a
  // long unbroken streak. They arc up and outward under gravity, cannot be
  // caught for a heartbeat (they begin inside the basket), then rain back
  // down as ordinary, catchable embers that never break the combo.
  spawnFountain(x, y) {
    for (const dir of [-1, 0, 1]) {
      this.items.push({
        kind: KIND.EMBER,
        x: x + dir * 6,
        y: y - 8,
        vy: -(165 + Math.random() * 75),
        vx: dir * (58 + Math.random() * 42),
        grav: 305,
        noCatchT: 0.5,
        bonus: true,
        dartT: 0,
        sway: Math.random() * Math.PI * 2,
        swaySpeed: 1 + Math.random(),
        r: 8,
        spin: Math.random() * Math.PI * 2,
      });
    }
  }

  // Advance the field. `hooks` receives onCatch(item), onMissEmber(item),
  // onGround(item) and onWispGround(item) so the rules live in one place
  // (main.js). `opts.wind` is the gale's sideways push in px/s and
  // `opts.spawnBoost` thickens the spawn rate while the gale blows. The
  // caller has already applied the frost time scale to dt.
  update(dt, night, keeper, magnetRadius, hooks, opts = {}) {
    const scaled = dt;
    const wind = opts.wind || 0;
    this.elapsed += scaled;
    this.spawnTimer -= scaled * (opts.spawnBoost ? 1.85 : 1);
    if (this.spawnTimer <= 0) {
      this.spawn(night);
      this.spawnTimer = this.profile(night).interval * (0.7 + Math.random() * 0.6);
    }

    const groundY = this.H - 38;
    const kept = [];
    for (const it of this.items) {
      it.sway += it.swaySpeed * scaled;
      it.spin += scaled * 2;
      if (it.noCatchT > 0) it.noCatchT -= scaled;
      if (it.grav) it.vy += it.grav * scaled;
      it.y += it.vy * scaled;
      it.x += (it.vx || 0) * scaled + wind * scaled;

      if (it.kind === KIND.WISP) {
        // Wisps wander hard and dart: every half-second or so they throw
        // themselves sideways, then the throw bleeds away.
        it.x += Math.sin(it.sway * 2.4) * 44 * scaled;
        it.dartT -= scaled;
        if (it.dartT <= 0) {
          it.dartT = 0.45 + Math.random() * 0.55;
          it.vx = (Math.random() * 2 - 1) * 210;
        }
        it.vx *= Math.pow(0.22, scaled);
      } else {
        it.x += Math.sin(it.sway) * 14 * scaled;
      }
      // Nothing leaves the valley: a soft wall at each edge.
      if (it.x < 10) { it.x = 10; it.vx = Math.abs(it.vx) * 0.5; }
      if (it.x > this.W - 10) { it.x = this.W - 10; it.vx = -Math.abs(it.vx) * 0.5; }

      // Ember magnet upgrade: nearby embers bend toward the lantern.
      if (magnetRadius > 0 && it.kind === KIND.EMBER && !it.bonus) {
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
      if (it.noCatchT <= 0 &&
          it.y >= keeper.catchY - 4 && it.y <= keeper.catchY + 16 &&
          Math.abs(it.x - keeper.x) <= keeper.basketHalf + it.r * 0.4) {
        hooks.onCatch(it);
        continue;
      }
      // Missed: it lands on the ridge.
      if (it.y > groundY) {
        if (it.kind === KIND.EMBER) hooks.onMissEmber(it);
        else if (it.kind === KIND.WISP) hooks.onWispGround(it);
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
      else if (it.kind === KIND.WISP) this.drawWisp(ctx, it);
      else this.drawFrost(ctx, it);
    }
  }

  drawEmber(ctx, it) {
    // Fountain embers burn a little larger and whiter than sky embers —
    // they came from the lantern itself, and the eye should know it.
    const bonus = it.bonus ? 1.3 : 1;
    const pulse = (1 + Math.sin(it.sway * 3) * 0.12) * bonus;
    const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, 20 * pulse);
    g.addColorStop(0, 'rgba(255, 240, 190, 0.95)');
    g.addColorStop(0.35, 'rgba(255, 186, 73, 0.75)');
    g.addColorStop(1, 'rgba(255, 140, 30, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(it.x, it.y, 20 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = it.bonus ? '#fffbe8' : '#fff3cf';
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

  drawWisp(ctx, it) {
    // A storm wisp: a violet-white core in a crackling halo. The arcs are
    // re-rolled every frame on purpose — lightning should never sit still.
    const pulse = 1 + Math.sin(it.sway * 5) * 0.15;
    const g = ctx.createRadialGradient(it.x, it.y, 0, it.x, it.y, 24 * pulse);
    g.addColorStop(0, 'rgba(240, 230, 255, 0.9)');
    g.addColorStop(0.3, 'rgba(178, 132, 255, 0.65)');
    g.addColorStop(1, 'rgba(120, 60, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(it.x, it.y, 24 * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(216, 190, 255, 0.85)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a0 = it.spin * 1.7 + (i / 3) * Math.PI * 2;
      const r0 = 5, r1 = 12 + Math.random() * 5;
      const mx = it.x + Math.cos(a0 + 0.5) * (r0 + r1) / 2 + (Math.random() - 0.5) * 5;
      const my = it.y + Math.sin(a0 + 0.5) * (r0 + r1) / 2 + (Math.random() - 0.5) * 5;
      ctx.beginPath();
      ctx.moveTo(it.x + Math.cos(a0) * r0, it.y + Math.sin(a0) * r0);
      ctx.lineTo(mx, my);
      ctx.lineTo(it.x + Math.cos(a0) * r1, it.y + Math.sin(a0) * r1);
      ctx.stroke();
    }
    ctx.fillStyle = '#fdfaff';
    ctx.beginPath();
    ctx.arc(it.x, it.y, 3.6 * pulse, 0, Math.PI * 2);
    ctx.fill();
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
