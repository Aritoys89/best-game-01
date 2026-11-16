// main.js — EMBERFALL: Keeper of the Last Lantern.
//
// Boot, the game loop, input, and the screen state machine. The screens are
// title / playing / choice / paused / gameover; every change is mirrored to
// document.body.dataset.screen so the page styling (and anything watching
// the page) can react to where the game is.
//
// The rules in one breath: catch golden embers to feed the lantern and
// score; its light drains always and the game ends at zero. Ash snuffs the
// flame, frost slows time, unbroken catches build a combo multiplier, and
// between nights the keeper chooses one of two blessings. Storm wisps
// dart through the fall — catch one and the flame kindles, drinking deep
// from every ember, but let one burst beside you and it zaps. Once a
// night a gale rises and shoves the whole sky sideways. And whatever
// light you still hold when a night ends, the dawn pays back in score.

import { Keeper } from './keeper.js';
import { FallingField, KIND } from './falling.js';
import { pickTwo, applyUpgrade } from './upgrades.js';
import { SoundEngine } from './audio.js';
import { Particles, Floaters, drawHUD } from './hud.js';
import { Background } from './render.js';

const W = 960;
const H = 600;
const BEST_KEY = 'emberfall-best';

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = W;
    this.H = H;
    this.keeper = new Keeper(W, H);
    this.field = new FallingField(W, H);
    this.background = new Background(W, H);
    this.particles = new Particles();
    this.floaters = new Floaters();
    this.sound = new SoundEngine();
    this.input = { left: false, right: false, mouseX: null, mouseActive: false };
    this.best = Number(localStorage.getItem(BEST_KEY) || 0);
    this.screen = 'title';
    this.choiceCards = [];
    this.options = [];
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '200, 30, 20';
    this.lastTs = 0;
    this.resetRun();
  }

  resetRun() {
    this.score = 0;
    this.night = 1;
    this.nightLength = 40;
    this.nightLeft = this.nightLength;
    this.combo = 0;
    this.multiplier = 1;
    this.emberBonus = 0;      // from Brighter Core upgrades
    this.magnetRadius = 0;    // from Ember Magnet upgrades
    this.shieldPerNight = false;
    this.taken = [];
    this.slowLeft = 0;
    // Storm wisps and the kindled flame they light.
    this.kindledLeft = 0;     // seconds of kindled time remaining
    this.kindledFactor = 1;   // Stormglass Charm stretches kindling
    this.wispWard = false;    // Stormglass Charm: zaps feed instead of bite
    // The dawn bonus: leftover light becomes score at night's end.
    this.dawnFactor = 1;      // Dawn Tithe doubles it
    this.dawnBonus = 0;       // what the last dawn paid
    // The gale: one mid-night surge per night.
    this.galeAt = this.nightLength * (0.35 + Math.random() * 0.3);
    this.galeLeft = 0;
    this.galeDir = 1;
    this.galeDone = false;
    // Run tallies for the game-over screen, and small timers.
    this.stats = { embers: 0, wisps: 0, ash: 0, fountains: 0 };
    this.heartbeatT = 0;
    this.trailT = 0;
    this.keeper.reset();
    this.field.clear();
    this.particles.clear();
    this.floaters.clear();
  }

  setScreen(name) {
    this.screen = name;
    document.body.dataset.screen = name;
  }

  startRun() {
    this.sound.ensure();
    this.sound.startAmbience();
    this.resetRun();
    this.setScreen('playing');
  }

  endNight() {
    // The dawn bonus: the light you kept becomes gold. Holding light back
    // all night is suddenly a strategy, not just survival.
    this.dawnBonus = Math.floor(this.keeper.light) * 2 * this.dawnFactor;
    this.score += this.dawnBonus;
    this.options = pickTwo();
    this.field.clear();
    this.sound.nightClear();
    this.setScreen('choice');
  }

  chooseOption(idx) {
    const upgrade = this.options[idx];
    if (!upgrade) return;
    applyUpgrade(this, upgrade);
    this.night += 1;
    this.nightLeft = this.nightLength;
    this.galeAt = this.nightLength * (0.35 + Math.random() * 0.3);
    this.galeDone = false;
    this.galeLeft = 0;
    this.keeper.addLight(18); // a breath between nights
    if (this.shieldPerNight) this.keeper.shield = true;
    this.sound.nightBell();
    this.setScreen('playing');
  }

  gameOver() {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.setScreen('gameover');
  }

  // ---- rules: what catches and misses do ---------------------------------

  onCatch(it) {
    const k = this.keeper;
    if (it.kind === KIND.EMBER) {
      this.combo += 1;
      this.stats.embers += 1;
      this.multiplier = Math.min(8, 1 + Math.floor(this.combo / 3));
      const kindled = this.kindledLeft > 0;
      const points = (10 + this.emberBonus) * this.multiplier + (kindled ? 5 : 0);
      this.score += points;
      k.addLight(kindled ? 10.5 : 6.5); // a kindled flame drinks deep
      // The burst grows with the multiplier: a long streak should feel
      // louder under the hands than the first catch of a night.
      this.particles.burst(it.x, k.catchY, '#ffca6a', 15 + this.multiplier * 2, 140 + this.multiplier * 9);
      this.floaters.add(it.x, k.catchY - 18, `+${points}`);
      this.sound.catchChime(this.combo);
      // Streak milestone: every ninth unbroken catch, the lantern itself
      // throws a fountain of bonus embers into the air around the keeper.
      if (this.combo > 0 && this.combo % 9 === 0) {
        this.stats.fountains += 1;
        this.field.spawnFountain(k.x, k.catchY);
        this.particles.ring(k.x, k.catchY, '#ffca6a', 74);
        this.floaters.add(k.x, k.catchY - 52, 'Kindling streak!', '#ffe9a8');
        this.sound.milestone();
      }
    } else if (it.kind === KIND.WISP) {
      // The dare of the game: a wisp caught kindles the flame for a few
      // seconds — embers feed it far more light and a little more score.
      this.stats.wisps += 1;
      this.kindledLeft = 6 * this.kindledFactor;
      const points = 30 * this.multiplier;
      this.score += points;
      this.particles.burst(it.x, k.catchY, '#c9a2ff', 22, 180);
      this.particles.ring(it.x, k.catchY, '#b284ff', 64);
      this.floaters.add(it.x, k.catchY - 18, `Kindled! +${points}`, '#d8b4ff');
      this.sound.wispCatch();
    } else if (it.kind === KIND.ASH) {
      this.stats.ash += 1;
      if (k.shield) {
        k.shield = false;
        this.particles.burst(it.x, k.catchY, '#a8d4ff', 16, 150);
        this.floaters.add(it.x, k.catchY - 18, 'Blocked!', '#a8d4ff');
        this.sound.frostShimmer();
      } else {
        k.light -= 17;
        this.combo = 0;
        this.multiplier = 1;
        this.shake = 0.45;
        this.flash = 0.85;
        this.flashColor = '200, 30, 20';
        this.particles.burst(it.x, k.catchY, '#574a66', 18, 170);
        this.floaters.add(it.x, k.catchY - 18, 'Ash! −light', '#ff8d7d');
        this.sound.ashThud();
      }
    } else if (it.kind === KIND.FROST) {
      this.slowLeft = 4.5;
      this.particles.burst(it.x, k.catchY, '#bfe6ff', 16, 130);
      this.floaters.add(it.x, k.catchY - 18, 'Time slows', '#bfe6ff');
      this.sound.frostShimmer();
    }
  }

  onMissEmber(it) {
    // Fountain embers are a gift, not a test: one that lands is just dust.
    if (it.bonus) {
      this.particles.burst(it.x, this.H - 40, '#a8894f', 5, 55);
      return;
    }
    // Only an ember that lands close beside the basket counts as a miss —
    // one the keeper plainly could have caught. Embers raining elsewhere in
    // the valley are weather, not failure; with the whole sky spawning, a
    // stricter rule would break the combo every couple of seconds and the
    // multiplier could never climb.
    const withinReach = Math.abs(it.x - this.keeper.x) <= this.keeper.basketHalf + 95;
    if (withinReach && this.combo > 0) {
      this.floaters.add(it.x, this.H - 66, 'Combo lost', 'rgba(232,226,208,0.75)');
    }
    if (withinReach) {
      this.combo = 0;
      this.multiplier = 1;
    }
    this.particles.burst(it.x, this.H - 40, '#8a7a5c', 5, 60);
  }

  onWispGround(it) {
    // A wisp that bursts beside the keeper zaps the flame; one that lands
    // far away is only weather. The Stormglass Charm drinks the zap.
    const near = Math.abs(it.x - this.keeper.x) <= 130;
    if (this.wispWard) {
      this.keeper.addLight(5);
      this.particles.ring(it.x, this.H - 44, '#b284ff', 40);
      this.particles.burst(it.x, this.H - 44, '#c9a2ff', 10, 110);
      if (near) this.floaters.add(it.x, this.H - 70, 'Stormglass drinks it +5', '#d8b4ff');
      this.sound.frostShimmer();
    } else if (near) {
      this.keeper.light -= 7;
      this.shake = Math.max(this.shake, 0.3);
      this.flash = Math.max(this.flash, 0.55);
      this.flashColor = '150, 90, 255';
      this.particles.ring(it.x, this.H - 44, '#b284ff', 52);
      this.particles.burst(it.x, this.H - 44, '#a678ff', 14, 150);
      this.floaters.add(it.x, this.H - 70, 'Zapped! −light', '#d8b4ff');
      this.sound.wispZap();
    } else {
      this.particles.burst(it.x, this.H - 44, '#7a5cc9', 8, 90);
    }
  }

  onGround(it) {
    this.particles.burst(it.x, this.H - 40, it.kind === KIND.ASH ? '#3a3547' : '#9fc8e8', 4, 50);
  }

  // ---- per-frame update ---------------------------------------------------

  update(dt) {
    if (this.screen !== 'playing') return;
    const timeScale = this.slowLeft > 0 ? 0.45 : 1;
    if (this.slowLeft > 0) this.slowLeft -= dt;
    if (this.kindledLeft > 0) this.kindledLeft -= dt;
    this.keeper.kindled = this.kindledLeft > 0;

    // The gale: once a night, partway through, the wind rises for five
    // seconds and shoves everything that falls — keeper included, a
    // little — while the sky thickens.
    if (!this.galeDone && this.nightLeft <= this.nightLength - this.galeAt) {
      this.galeDone = true;
      this.galeLeft = 5;
      this.galeDir = Math.random() < 0.5 ? -1 : 1;
      this.floaters.add(this.W / 2, 128, 'The gale rises!', '#cfe0ff');
      this.sound.galeGust();
    }
    let wind = 0;
    if (this.galeLeft > 0) {
      this.galeLeft -= dt;
      wind = this.galeDir * 165;
      this.keeper.x += this.galeDir * 26 * dt; // the wind worries at her too
      if (Math.random() < 0.55) {
        const fromEdge = this.galeDir > 0 ? -12 : this.W + 12;
        this.particles.streak(fromEdge, 60 + Math.random() * 380, this.galeDir * (380 + Math.random() * 160));
      }
    }

    this.keeper.update(dt, this.input);

    // A spark trail while she runs: the faster she moves, the more the
    // lantern sheds light behind her.
    this.trailT -= dt;
    if (Math.abs(this.keeper.vx) > 70 && this.trailT <= 0) {
      this.trailT = 0.028;
      this.particles.trail(this.keeper.x - Math.sign(this.keeper.vx) * 12, this.keeper.catchY + 10, this.keeper.vx);
    }

    // The heartbeat of a dying flame, in sound and in the glow alike.
    if (this.keeper.light < 26) {
      this.heartbeatT -= dt;
      if (this.heartbeatT <= 0) {
        this.heartbeatT = 0.95;
        this.keeper.heartPulse = 1;
        this.sound.heartbeat();
      }
    }

    this.field.update(dt * timeScale, this.night, this.keeper, this.magnetRadius, {
      onCatch: (it) => this.onCatch(it),
      onMissEmber: (it) => this.onMissEmber(it),
      onGround: (it) => this.onGround(it),
      onWispGround: (it) => this.onWispGround(it),
    }, { wind, spawnBoost: this.galeLeft > 0 });
    this.particles.update(dt);
    this.floaters.update(dt);

    this.nightLeft -= dt;
    if (this.keeper.light <= 0) {
      this.keeper.light = 0;
      this.gameOver();
    } else if (this.nightLeft <= 0) {
      this.endNight();
    }
  }

  // ---- drawing ------------------------------------------------------------

  drawDarkness(lightFrac) {
    // The world darkens as the flame fades: a radial veil centred on the
    // lantern, clear inside the glow and near-black beyond it. The radius
    // is the keeper's own glow radius, so the veil breathes, flares and
    // throbs exactly as the flame she carries does.
    const { ctx, keeper } = this;
    const radius = this.screen === 'playing' || this.screen === 'paused' || this.screen === 'choice'
      ? keeper.glowRadius()
      : 90 + lightFrac * 300;
    const g = ctx.createRadialGradient(keeper.x, keeper.y - 18, radius * 0.35, keeper.x, keeper.y - 18, radius * 1.45);
    g.addColorStop(0, 'rgba(3, 5, 14, 0)');
    g.addColorStop(0.7, 'rgba(3, 5, 14, 0.30)');
    g.addColorStop(1, 'rgba(2, 3, 10, 0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawFlash() {
    if (this.flash <= 0) return;
    const { ctx } = this;
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.32, W / 2, H / 2, H * 0.78);
    g.addColorStop(0, `rgba(${this.flashColor}, 0)`);
    g.addColorStop(1, `rgba(${this.flashColor}, ${0.4 * this.flash})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  draw() {
    const { ctx } = this;
    ctx.save();
    if (this.shake > 0) {
      const m = this.shake * 11;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    this.background.draw(ctx, this.keeper.x - W / 2);
    this.field.draw(ctx);
    this.keeper.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();

    const inRun = this.screen === 'playing' || this.screen === 'paused' || this.screen === 'choice';
    const lightFrac = inRun ? this.keeper.light / this.keeper.maxLight : 0.55;
    this.drawDarkness(lightFrac);
    this.floaters.draw(ctx);
    this.drawFlash();

    if (inRun) drawHUD(ctx, this);
    if (this.screen === 'title') this.drawTitle();
    else if (this.screen === 'choice') this.drawChoice();
    else if (this.screen === 'paused') this.drawCentred(['Paused', 'P to resume']);
    else if (this.screen === 'gameover') this.drawGameOver();
  }

  drawCentred(lines) {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(4, 6, 16, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    lines.forEach((line, i) => {
      ctx.font = i === 0 ? '700 44px Georgia, serif' : '19px Georgia, serif';
      ctx.fillStyle = i === 0 ? '#ffe9bb' : 'rgba(232,226,208,0.8)';
      ctx.fillText(line, W / 2, H / 2 - 10 + i * 40);
    });
  }

  drawTitle() {
    const { ctx } = this;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffca6a';
    ctx.font = '700 74px Georgia, serif';
    ctx.fillText('EMBERFALL', W / 2, 168);
    ctx.fillStyle = '#e8e2d0';
    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillText('Keeper of the Last Lantern', W / 2, 208);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
    ctx.font = '18px Georgia, serif';
    ctx.fillText('The valley has one light left, and the night wants it.', W / 2, 268);
    ctx.fillText('Catch the falling embers to keep your lantern alive —', W / 2, 316);
    ctx.fillText('but keep the ash out, and mind the frost.', W / 2, 342);
    ctx.fillStyle = 'rgba(216, 180, 255, 0.9)';
    ctx.fillText('Dare the violet wisps: caught, they kindle the flame —', W / 2, 368);
    ctx.fillText('burst beside you, they bite it.', W / 2, 392);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 21px Georgia, serif';
    ctx.fillText('Press Enter or click to take up the lantern', W / 2, 420);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.6)';
    ctx.font = '15px Georgia, serif';
    ctx.fillText('Mouse or ← → / A D to move · P pause · M mute', W / 2, 452);
    if (this.best > 0) {
      ctx.fillStyle = '#ffca6a';
      ctx.font = '17px Georgia, serif';
      ctx.fillText(`Best score so far: ${this.best}`, W / 2, 492);
    }
  }

  drawChoice() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(4, 6, 16, 0.62)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9bb';
    ctx.font = '700 34px Georgia, serif';
    ctx.fillText(`Night ${this.night} survived`, W / 2, 150);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
    ctx.font = '18px Georgia, serif';
    ctx.fillText('The lantern keeper may take one blessing before the next night.', W / 2, 184);
    if (this.dawnBonus > 0) {
      ctx.fillStyle = '#ffd98a';
      ctx.font = '700 17px Georgia, serif';
      ctx.fillText(`Dawn bonus +${this.dawnBonus} — the light you kept became gold`, W / 2, 210);
    }

    const cardW = 330, cardH = 190, gap = 36;
    const x0 = W / 2 - cardW - gap / 2;
    this.choiceCards = this.options.map((opt, i) => ({
      x: x0 + i * (cardW + gap), y: 232, w: cardW, h: cardH, idx: i,
    }));
    for (const card of this.choiceCards) {
      const opt = this.options[card.idx];
      ctx.fillStyle = 'rgba(20, 27, 52, 0.95)';
      ctx.strokeStyle = 'rgba(255, 202, 106, 0.65)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(card.x, card.y, card.w, card.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffca6a';
      ctx.font = '40px Georgia, serif';
      ctx.fillText(opt.icon, card.x + card.w / 2, card.y + 58);
      ctx.font = '700 23px Georgia, serif';
      ctx.fillStyle = '#ffe9bb';
      ctx.fillText(opt.name, card.x + card.w / 2, card.y + 98);
      ctx.font = '15.5px Georgia, serif';
      ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
      this.wrapText(opt.desc, card.x + card.w / 2, card.y + 126, card.w - 44, 20);
      ctx.fillStyle = 'rgba(255, 217, 138, 0.75)';
      ctx.font = '700 14px Georgia, serif';
      ctx.fillText(`press ${card.idx + 1}`, card.x + card.w / 2, card.y + card.h - 14);
    }
  }

  wrapText(text, cx, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
      const trial = line ? `${line} ${word}` : word;
      if (this.ctx.measureText(trial).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = trial;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => this.ctx.fillText(l, cx, y + i * lineHeight));
  }

  drawGameOver() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(3, 4, 10, 0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cdd8f5';
    ctx.font = '700 46px Georgia, serif';
    ctx.fillText('The light has gone out', W / 2, 190);
    ctx.fillStyle = '#ffe9bb';
    ctx.font = '700 30px Georgia, serif';
    ctx.fillText(`Score ${this.score}`, W / 2, 262);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
    ctx.font = '19px Georgia, serif';
    ctx.fillText(`Best ${this.best}`, W / 2, 300);
    ctx.fillText(`Nights completed: ${this.night - 1} · fell on Night ${this.night}`, W / 2, 330);
    ctx.font = '16px Georgia, serif';
    ctx.fillStyle = 'rgba(232, 226, 208, 0.75)';
    ctx.fillText(
      `Embers caught ${this.stats.embers} · wisps kindled ${this.stats.wisps} · ash swallowed ${this.stats.ash}`,
      W / 2, 358);
    if (this.taken.length) {
      ctx.font = '15px Georgia, serif';
      ctx.fillStyle = 'rgba(255, 217, 138, 0.7)';
      ctx.fillText(`Blessings taken: ${this.taken.length}`, W / 2, 384);
    }
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 20px Georgia, serif';
    ctx.fillText('Press Enter or click to light it again', W / 2, 428);
  }

  // ---- the loop -----------------------------------------------------------

  frame(ts) {
    const dt = Math.min(0.033, this.lastTs ? (ts - this.lastTs) / 1000 : 0.016);
    this.lastTs = ts;
    this.shake = Math.max(0, this.shake - dt * 1.6);
    this.flash = Math.max(0, this.flash - dt * 1.8);
    this.update(dt);
    // Particles and floaters also drift on the title and end screens.
    if (this.screen !== 'playing') {
      this.particles.update(dt);
      this.floaters.update(dt);
    }
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }
}

// ---- boot and input -------------------------------------------------------

const canvas = document.getElementById('game');
const game = new Game(canvas);
document.body.dataset.screen = game.screen;
// A handle for the maker's own tooling (the screenshot script drives the
// game through this to stage its pictures). It changes nothing in play.
window.__emberfall = game;

function canvasPos(evt) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (evt.clientX - rect.left) * (canvas.width / rect.width),
    y: (evt.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousemove', (evt) => {
  const p = canvasPos(evt);
  game.input.mouseX = p.x;
  game.input.mouseActive = true;
});

canvas.addEventListener('click', (evt) => {
  game.sound.ensure();
  if (game.screen === 'title' || game.screen === 'gameover') {
    game.startRun();
  } else if (game.screen === 'choice') {
    const p = canvasPos(evt);
    const card = game.choiceCards.find(c => p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h);
    if (card) game.chooseOption(card.idx);
  }
});

window.addEventListener('keydown', (evt) => {
  const key = evt.key;
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') game.input.left = true;
  else if (key === 'ArrowRight' || key === 'd' || key === 'D') game.input.right = true;
  else if (key === 'Enter') {
    game.sound.ensure();
    if (game.screen === 'title' || game.screen === 'gameover') game.startRun();
  } else if (key === 'p' || key === 'P') {
    if (game.screen === 'playing') game.setScreen('paused');
    else if (game.screen === 'paused') game.setScreen('playing');
  } else if (key === 'm' || key === 'M') {
    game.sound.ensure();
    game.sound.setMuted(!game.sound.muted);
  } else if ((key === '1' || key === '2') && game.screen === 'choice') {
    game.chooseOption(Number(key) - 1);
  }
  if (key.startsWith('Arrow')) evt.preventDefault();
});

window.addEventListener('keyup', (evt) => {
  const key = evt.key;
  if (key === 'ArrowLeft' || key === 'a' || key === 'A') game.input.left = false;
  if (key === 'ArrowRight' || key === 'd' || key === 'D') game.input.right = false;
});

requestAnimationFrame((t) => game.frame(t));
