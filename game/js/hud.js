// hud.js — everything the player reads while playing: the score line, the
// light meter (the most important bar in the game), the combo indicator,
// plus the two kinds of juice that float above the action — particle bursts
// and rising "+N" score texts.

export class Particles {
  constructor() { this.bits = []; this.rings = []; }

  clear() { this.bits = []; this.rings = []; }

  burst(x, y, color, count = 14, speed = 130) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.3 + Math.random() * 0.9);
      this.bits.push({
        x, y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        life: 0.55 + Math.random() * 0.4,
        age: 0,
        size: 1.4 + Math.random() * 2.4,
        color,
        grav: 190,
      });
    }
  }

  // An expanding ring — the punctuation mark for the big moments: a wisp
  // caught, a streak milestone, a zap on the ridge.
  ring(x, y, color, maxR = 56) {
    this.rings.push({ x, y, color, maxR, age: 0, life: 0.45 });
  }

  // One spark shed behind the keeper as she runs — her trail of light.
  trail(x, y, vx) {
    this.bits.push({
      x, y,
      vx: -vx * 0.25 + (Math.random() - 0.5) * 22,
      vy: -18 - Math.random() * 26,
      life: 0.4 + Math.random() * 0.25,
      age: 0,
      size: 1.1 + Math.random() * 1.4,
      color: Math.random() < 0.3 ? '#ffe9a8' : '#ffab4a',
      grav: -30, // trail sparks drift up like real sparks off a flame
    });
  }

  // A gale streak: a fast, nearly flat spark the wind carries across.
  streak(x, y, vx) {
    this.bits.push({
      x, y,
      vx,
      vy: (Math.random() - 0.5) * 30,
      life: 0.5 + Math.random() * 0.3,
      age: 0,
      size: 1 + Math.random() * 1.2,
      color: 'rgba(190, 205, 235, 0.8)',
      grav: 6,
    });
  }

  update(dt) {
    for (const b of this.bits) {
      b.age += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.vy += b.grav * dt; // a little gravity, like real sparks settling
    }
    this.bits = this.bits.filter(b => b.age < b.life);
    for (const r of this.rings) r.age += dt;
    this.rings = this.rings.filter(r => r.age < r.life);
  }

  draw(ctx) {
    for (const b of this.bits) {
      const t = 1 - b.age / b.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.size * t + 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      const t = r.age / r.life;
      ctx.globalAlpha = (1 - t) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = 2.2 * (1 - t) + 0.4;
      ctx.beginPath();
      ctx.arc(r.x, r.y, 6 + (r.maxR - 6) * t, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

export class Floaters {
  constructor() { this.texts = []; }

  clear() { this.texts = []; }

  add(x, y, text, color = '#ffd98a') {
    this.texts.push({ x, y, text, color, age: 0, life: 0.95 });
  }

  update(dt) {
    for (const t of this.texts) { t.age += dt; t.y -= 42 * dt; }
    this.texts = this.texts.filter(t => t.age < t.life);
  }

  draw(ctx) {
    ctx.textAlign = 'center';
    ctx.font = '700 17px Georgia, serif';
    for (const t of this.texts) {
      ctx.globalAlpha = 1 - t.age / t.life;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }
}

// The top-of-screen readout. The light meter changes colour as the flame
// weakens: gold, then amber, then a warning red under a quarter.
export function drawHUD(ctx, game) {
  const { keeper } = game;
  const W = game.W;

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(6, 9, 20, 0.45)';
  ctx.fillRect(0, 0, W, 46);

  ctx.font = '700 20px Georgia, serif';
  ctx.fillStyle = '#ffe9bb';
  ctx.fillText(`Score ${game.score}`, 16, 30);

  ctx.font = '15px Georgia, serif';
  ctx.fillStyle = 'rgba(232, 226, 208, 0.65)';
  ctx.fillText(`Best ${game.best}`, 170, 30);

  ctx.textAlign = 'center';
  ctx.font = '700 18px Georgia, serif';
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText(`Night ${game.night}`, W / 2, 30);

  // Night progress: a thin line of stars draining left to right.
  const frac = Math.max(0, game.nightLeft / game.nightLength);
  ctx.fillStyle = 'rgba(160, 190, 255, 0.5)';
  ctx.fillRect(W / 2 - 60, 36, 120 * frac, 2.5);

  // Combo indicator — only worth showing once it is doing something. It
  // lives under the score (an earlier spot collided with the LIGHT label).
  if (game.multiplier > 1) {
    ctx.textAlign = 'left';
    ctx.font = '700 19px Georgia, serif';
    ctx.fillStyle = '#ffb84d';
    ctx.fillText(`Combo ×${game.multiplier}`, 16, 72);
    ctx.font = '12.5px Georgia, serif';
    ctx.fillStyle = 'rgba(255, 217, 138, 0.75)';
    ctx.fillText(`${game.combo} caught in a row`, 16, 90);
  }

  // The light meter, right side.
  const barW = 168, barX = W - barW - 16, barY = 14;
  ctx.textAlign = 'right';
  ctx.font = '13px Georgia, serif';
  ctx.fillStyle = 'rgba(232, 226, 208, 0.8)';
  ctx.fillText('LIGHT', barX - 8, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fillRect(barX, barY, barW, 15);
  const lightFrac = Math.max(0, keeper.light / keeper.maxLight);
  // Under a quarter the bar throbs with the heartbeat main.js sounds.
  ctx.globalAlpha = lightFrac < 0.26 ? 0.62 + keeper.heartPulse * 0.38 : 1;
  ctx.fillStyle = lightFrac > 0.5 ? '#ffcf6e' : lightFrac > 0.25 ? '#ff9d45' : '#ff5d4d';
  ctx.fillRect(barX, barY, barW * lightFrac, 15);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(255, 233, 187, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barW, 15);

  // Event notices, stacked under the night name so several can show at
  // once without colliding: the gale first, then frost's slow time, then
  // the kindled flame.
  const notices = [];
  if (game.galeLeft > 0) notices.push(['≋ THE GALE ≋', 'rgba(200, 216, 245, 0.95)']);
  if (game.slowLeft > 0) notices.push(['❄ time drifts slow ❄', 'rgba(190, 230, 255, 0.9)']);
  if (game.kindledLeft > 0) notices.push(['✦ KINDLED — the flame drinks deep ✦', 'rgba(216, 180, 255, 0.95)']);
  ctx.textAlign = 'center';
  ctx.font = 'italic 15px Georgia, serif';
  notices.forEach(([text, color], i) => {
    ctx.fillStyle = color;
    ctx.fillText(text, W / 2, 68 + i * 22);
  });
}
