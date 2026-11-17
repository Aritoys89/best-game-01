// main.js — EMBERFALL: Keeper of the Last Lantern.
//
// Boot, the game loop, input, and the screen state machine. The screens are
// title / cache / playing / choice / paused / gameover; every change is mirrored to
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
//
// Every fifth night the Ash Golem crosses the valley: it swallows the
// embers that fall into it, its shadow drinks the light, and its stomps
// shake bonus embers loose — survive it and the dawn offers a rare
// blessing. Every tenth night is the Longest Night: the golem comes
// crowned in cinders, faster and angrier, and the Ash Crow circles with
// it. The crow is the valley's other hunter: it drops cinders aimed at
// the keeper, and a cinder is the one thing in the sky she must NOT
// catch — let it strike the ridge and it cracks open into embers.
// Moonwater sometimes falls too, a droplet that pours light back into
// the lantern but spends the streak it lands on. And every run earns
// Keeper's Marks, spent between runs in the Keeper's Cache on blessings
// that never fade.

import { Keeper } from './keeper.js';
import { FallingField, KIND } from './falling.js';
import { pickTwo, pickBossPair, applyUpgrade } from './upgrades.js';
import { SoundEngine } from './audio.js';
import { Particles, Floaters, drawHUD } from './hud.js';
import { Background } from './render.js';
import { Golem } from './golem.js';
import { AshCrow } from './crows.js';
import { CACHE_ITEMS, loadMeta, saveMeta, buyItem, priceFor, ownedLevel, marksEarnedForRun, applyMeta } from './meta.js';

const W = 960;
const H = 600;
const BEST_KEY = 'emberfall-best';
const BOSS_BONUS = 150;   // score for surviving a golem night
const CLIMAX_BONUS = 300; // score for surviving the Longest Night
const SHADOW_DRAIN = 1.7; // extra light per second inside the golem's shadow

// Every night has a name, and the name says what kind of night it is.
// Boss nights name the golem; the rest cycle through the valley's moods.
const NIGHT_NAMES = [
  'The First Dark', 'Ember Rain', 'Ashfall Hollow', 'The Whispering Dark',
  'Wisp Hollow', 'Moonwater Springs', 'The Long Fall', 'Stormwrack',
  'The Starless Deep', 'Emberfall Deepens',
];
const GOLEM_NAMES = ['The Ash Golem', 'The Ash Golem Returns', 'The Ash Golem, Unbowed'];

function nightTitle(night) {
  if (night % 10 === 0) {
    return { name: 'The Ash Golem, Crowned in Cinders', sub: 'The Longest Night — everything the dark has, at once.' };
  }
  if (night % 5 === 0) {
    const name = GOLEM_NAMES[Math.floor(night / 5 - 1) % GOLEM_NAMES.length];
    return { name, sub: 'It drinks the falling light. Keep out of its shadow.' };
  }
  const name = NIGHT_NAMES[(night - 1) % NIGHT_NAMES.length];
  return { name, sub: night === 1 ? 'Keep the lantern lit until dawn.' : '' };
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = W;
    this.H = H;
    this.keeper = new Keeper(W, H);
    this.field = new FallingField(W, H);
    this.golem = new Golem(W, H);
    this.crow = new AshCrow(W, H);
    this.background = new Background(W, H);
    this.particles = new Particles();
    this.floaters = new Floaters();
    this.sound = new SoundEngine();
    this.meta = loadMeta();       // Keeper's Marks and Cache levels
    this.marksEarned = 0;         // what the last finished run left behind
    this.cacheRows = [];          // clickable rows, rebuilt by drawCache
    this.cacheMsg = '';           // last purchase result, shown in the Cache
    this.muteRect = { x: W - 128, y: H - 30, w: 120, h: 24 };
    this.cacheLinkRect = null;    // set by drawTitle each frame it shows
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
    this.emberLightBonus = 0; // from Twin Flame: extra light per ember
    this.fountainEvery = 9;   // streak length that bursts a fountain (Twin Flame: 7)
    this.magnetRadius = 0;    // from Ember Magnet upgrades
    this.shieldPerNight = false;
    this.galeheart = false;   // Galeheart: the gale feeds instead of shoving
    this.ashenPact = false;   // Ashen Pact: swallowed ash pays score
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
    // Boss nights and the intro banner that names each night.
    this.bossThisNight = false;   // a golem is crossing (or crossed) tonight
    this.climaxThisNight = false; // the Longest Night: crowned golem, crow too
    this.bossBonus = 0;           // what surviving it paid, shown at dawn
    this.bannerT = 0;             // seconds of night-name banner remaining
    this.bannerTitle = null;      // {name, sub} for the current night
    this.wasInShadow = false;     // edge trigger for the shadow warning
    // The crow's visit, scheduled like the gale's.
    this.crowAt = this.nightLength * 0.55; // seconds into the night it arrives
    this.crowDone = false;        // it has come and gone (or never came)
    // Run tallies for the game-over screen, and small timers.
    this.stats = { embers: 0, wisps: 0, ash: 0, fountains: 0, moon: 0, bestStreak: 0, swallowed: 0, stomps: 0, cinders: 0 };
    this.heartbeatT = 0;
    this.trailT = 0;
    this.keeper.reset();
    this.golem.reset();
    this.crow.reset();
    applyMeta(this); // the Cache's permanent blessings ride on every run
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
    this.beginNight();
    this.setScreen('playing');
  }

  // Set up the night that is about to begin: its gale, its name on the
  // banner, and — every fifth night — the golem's crossing. Every tenth
  // night is the Longest Night: the golem comes crowned (faster, stomping
  // oftener, its shadow deeper) and the crow is allowed to circle with
  // it; on ordinary nights from the third on, the crow may visit alone.
  beginNight() {
    this.nightLeft = this.nightLength;
    this.galeAt = this.nightLength * (0.35 + Math.random() * 0.3);
    this.galeDone = false;
    this.galeLeft = 0;
    this.bannerTitle = nightTitle(this.night);
    this.bannerT = 3;
    this.bossThisNight = this.night % 5 === 0;
    this.climaxThisNight = this.night % 10 === 0;
    if (this.bossThisNight) {
      this.golem.start(this.climaxThisNight);
      this.sound.golemGroan();
    } else {
      this.golem.reset();
    }
    this.crow.reset();
    this.crowDone = false;
    this.crowAt = this.nightLength * (0.3 + Math.random() * 0.35);
  }

  // May the crow visit tonight? From the third night on it circles the
  // ordinary nights; on boss nights it keeps away — except on the
  // Longest Night, when everything the dark has comes at once.
  crowMayVisit() {
    return this.night >= 3 && (!this.bossThisNight || this.climaxThisNight);
  }

  endNight() {
    // The dawn bonus: the light you kept becomes gold. Holding light back
    // all night is suddenly a strategy, not just survival.
    this.dawnBonus = Math.floor(this.keeper.light) * 2 * this.dawnFactor;
    this.score += this.dawnBonus;
    // A boss night survived pays out of the golem's hoard — and the hoard
    // guarantees one of the two blessings offered is a rare one. The
    // Longest Night's hoard is twice as deep.
    this.bossBonus = this.bossThisNight ? (this.climaxThisNight ? CLIMAX_BONUS : BOSS_BONUS) : 0;
    this.score += this.bossBonus;
    this.options = this.bossThisNight ? pickBossPair() : pickTwo();
    this.golem.reset(); // the crossing ends with the night, however it went
    this.crow.reset();  // and the crow is gone with it
    this.field.clear();
    this.sound.nightClear();
    this.setScreen('choice');
  }

  chooseOption(idx) {
    const upgrade = this.options[idx];
    if (!upgrade) return;
    applyUpgrade(this, upgrade);
    this.night += 1;
    this.keeper.addLight(18); // a breath between nights
    if (this.shieldPerNight) this.keeper.shield = true;
    this.sound.nightBell();
    this.beginNight();
    this.setScreen('playing');
  }

  gameOver() {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    // The run is spent, but it leaves Marks behind — the currency that
    // outlives any single night.
    this.marksEarned = marksEarnedForRun(this.score, this.night - 1);
    this.meta.marks += this.marksEarned;
    saveMeta(this.meta);
    this.setScreen('gameover');
  }

  // ---- rules: what catches and misses do ---------------------------------

  onCatch(it) {
    const k = this.keeper;
    if (it.kind === KIND.EMBER) {
      this.combo += 1;
      this.stats.embers += 1;
      if (this.combo > this.stats.bestStreak) this.stats.bestStreak = this.combo;
      this.multiplier = Math.min(8, 1 + Math.floor(this.combo / 3));
      const kindled = this.kindledLeft > 0;
      const points = (10 + this.emberBonus) * this.multiplier + (kindled ? 5 : 0);
      this.score += points;
      // A kindled flame drinks deep; a twin flame deeper still; and a
      // Galeheart keeper drinks twice from every catch while her gale
      // blows — the storm that shoves everyone else feeds her.
      let sip = (kindled ? 10.5 : 6.5) + this.emberLightBonus;
      if (this.galeheart && this.galeLeft > 0) sip *= 2;
      k.addLight(sip);
      k.pop = 1;
      // The burst grows with the multiplier: a long streak should feel
      // louder under the hands than the first catch of a night.
      this.particles.burst(it.x, k.catchY, '#ffca6a', 15 + this.multiplier * 2, 140 + this.multiplier * 9);
      this.floaters.add(it.x, k.catchY - 18, `+${points}`);
      this.sound.catchChime(this.combo);
      // Streak milestone: every ninth unbroken catch (seventh with a
      // Twin Flame), the lantern itself throws a fountain of bonus
      // embers into the air around the keeper.
      if (this.combo > 0 && this.combo % this.fountainEvery === 0) {
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
      k.pop = 1;
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
        // A maxed Ward Charm turns the block into a sip of light.
        if (ownedLevel(this.meta, 'wardcharm') >= 3) k.addLight(4);
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
        // The Ashen Pact pays for the bite — the one blessing that can
        // make standing under a falling ash lump a decision, not a slip.
        if (this.ashenPact) {
          this.score += 25;
          this.floaters.add(it.x, k.catchY - 18, 'Ash! −light, +25 the pact pays', '#ff8d7d');
        } else {
          this.floaters.add(it.x, k.catchY - 18, 'Ash! −light', '#ff8d7d');
        }
        this.sound.ashThud();
      }
    } else if (it.kind === KIND.CINDER) {
      // The crow's stone, caught: the game's one anti-catch. It snuffs
      // a little less than ash — the flame spits the stone out — but it
      // spends the streak all the same, and the shield cannot help: a
      // shield turns aside ash, not a falling rock. The only right
      // answer to a cinder is to not be under it when it lands.
      k.light -= 14;
      this.combo = 0;
      this.multiplier = 1;
      this.shake = Math.max(this.shake, 0.32);
      this.flash = Math.max(this.flash, 0.6);
      this.flashColor = '255, 110, 40';
      this.particles.burst(it.x, k.catchY, '#3a2415', 16, 160);
      this.particles.burst(it.x, k.catchY, '#ff8a3d', 8, 130);
      this.floaters.add(it.x, k.catchY - 18, 'Cinder! −light', '#ffa26a');
      this.sound.ashThud();
    } else if (it.kind === KIND.FROST) {
      k.pop = 1;
      this.slowLeft = 4.5;
      this.particles.burst(it.x, k.catchY, '#bfe6ff', 16, 130);
      this.floaters.add(it.x, k.catchY - 18, 'Time slows', '#bfe6ff');
      this.sound.frostShimmer();
    } else if (it.kind === KIND.MOON) {
      // Moonwater: the lantern drinks deep — a solid chunk of light, now
      // — but the cold water spends the streak it lands on. A rescue when
      // the flame is dying; a real loss when the combo was climbing.
      this.stats.moon += 1;
      k.pop = 1;
      k.addLight(22);
      const spent = this.combo;
      this.combo = 0;
      this.multiplier = 1;
      this.score += 5;
      this.particles.burst(it.x, k.catchY, '#7db4ff', 18, 140);
      this.particles.ring(it.x, k.catchY, '#9cc8ff', 58);
      this.floaters.add(it.x, k.catchY - 18,
        spent > 0 ? 'Moonwater +22 light — streak spent' : 'Moonwater +22 light', '#bcd9ff');
      this.sound.moonSip();
    }
  }

  onAbsorb(it) {
    // An ember swallowed by the golem: a dull puff where it vanished.
    this.stats.swallowed += 1;
    this.particles.burst(it.x, it.y, '#4a4258', 5, 60);
  }

  onCinderGround(it) {
    // The crow's stone, dodged: it cracks on the ridge and spills the
    // embers it was carrying. The reward for the game's one anti-catch
    // is paid in the game's own currency — more things to catch.
    this.stats.cinders += 1;
    this.field.spawnCinderEmbers(it.x);
    this.particles.burst(it.x, this.H - 42, '#ff8a3d', 10, 120);
    this.particles.burst(it.x, this.H - 42, '#2a1a0e', 8, 90);
    this.particles.ring(it.x, this.H - 42, '#ffa26a', 46);
    this.floaters.add(it.x, this.H - 72, 'Cracked open!', '#ffa26a');
    this.sound.cinderCrack();
  }

  onStomp(golem) {
    // The ridge answers the golem's foot: dust, a shiver through the
    // ground, and the burst of embers the stomp shook loose.
    this.stats.stomps += 1;
    this.shake = Math.max(this.shake, 0.28);
    this.field.spawnStompBurst(golem.x);
    this.particles.burst(golem.x - golem.bodyHalf * 0.5, this.H - 42, '#6b5a44', 12, 120);
    this.particles.burst(golem.x + golem.bodyHalf * 0.5, this.H - 42, '#6b5a44', 12, 120);
    this.particles.ring(golem.x, this.H - 40, '#8a7a5c', 84);
    this.sound.golemStomp();
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
    if (this.bannerT > 0) this.bannerT -= dt;

    // The golem crosses on the night's own clock (frost slows it too),
    // and its shadow is a tax on standing still beneath it — a deeper
    // tax under the crowned golem of the Longest Night.
    if (this.golem.active) {
      this.golem.update(dt * timeScale, { onStomp: (g) => this.onStomp(g) });
      const inShadow = this.golem.inShadow(this.keeper.x);
      if (inShadow) {
        this.keeper.light -= SHADOW_DRAIN * (this.golem.enraged ? 1.5 : 1) * dt;
        if (!this.wasInShadow) {
          this.floaters.add(this.keeper.x, this.keeper.catchY - 64, 'The shadow drinks the light!', '#ff9a86');
        }
      }
      this.wasInShadow = inShadow;
    }

    // The crow arrives partway through its nights, caws once, and drops
    // its stones aimed at where the keeper stands at each drop.
    if (!this.crowDone && this.crowMayVisit() && this.nightLeft <= this.nightLength - this.crowAt) {
      this.crowDone = true;
      this.crow.start();
      this.floaters.add(this.W / 2, 128, 'An ash crow circles!', '#ffa26a');
      this.sound.crowCaw();
    }
    if (this.crow.active) {
      this.crow.update(dt * timeScale, {
        onDrop: (x, y) => this.field.spawnCinder(x, y, this.keeper.x),
      });
    }

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
      // The wind worries at the keeper too — unless she holds the
      // Galeheart, and the gale is hers.
      if (!this.galeheart) this.keeper.x += this.galeDir * 26 * dt;
      if (Math.random() < 0.55) {
        const fromEdge = this.galeDir > 0 ? -12 : this.W + 12;
        this.particles.streak(fromEdge, 60 + Math.random() * 380, this.galeDir * (380 + Math.random() * 160));
      }
    }

    this.keeper.update(dt, this.input);

    // A spark trail while she runs: the faster she moves, the more the
    // lantern sheds light behind her — and on a long streak the trail
    // runs hot, bigger and brighter.
    this.trailT -= dt;
    if (Math.abs(this.keeper.vx) > 70 && this.trailT <= 0) {
      const hot = this.combo >= 12;
      this.trailT = hot ? 0.016 : 0.028;
      this.particles.trail(this.keeper.x - Math.sign(this.keeper.vx) * 12, this.keeper.catchY + 10, this.keeper.vx, hot);
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

    // The music follows the pressure: a low flame, a kindled one, a
    // golem crossing or the crow above all swell the pad underneath.
    this.sound.setIntensity(
      this.keeper.light / 130 +
      (this.kindledLeft > 0 ? 0.22 : 0) +
      (this.golem.active ? 0.16 : 0) +
      (this.crow.active ? 0.08 : 0));

    this.field.update(dt * timeScale, this.night, this.keeper, this.magnetRadius, {
      onCatch: (it) => this.onCatch(it),
      onMissEmber: (it) => this.onMissEmber(it),
      onGround: (it) => this.onGround(it),
      onWispGround: (it) => this.onWispGround(it),
      onCinderGround: (it) => this.onCinderGround(it),
      onAbsorb: (it) => this.onAbsorb(it),
    }, { wind, spawnBoost: this.galeLeft > 0, golem: this.golem.active ? this.golem : null });
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
    // A dying flame throbs red at the edges of sight, in time with the
    // heartbeat — the dark itself warning her.
    if (this.screen === 'playing' && keeper.heartPulse > 0 && keeper.light < 26) {
      const pulse = ctx.createRadialGradient(W / 2, H / 2, H * 0.36, W / 2, H / 2, H * 0.8);
      pulse.addColorStop(0, 'rgba(120, 12, 4, 0)');
      pulse.addColorStop(1, `rgba(120, 12, 4, ${0.22 * keeper.heartPulse})`);
      ctx.fillStyle = pulse;
      ctx.fillRect(0, 0, W, H);
    }
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
    this.golem.draw(ctx, this.keeper.x);
    this.crow.draw(ctx);
    this.keeper.draw(ctx);
    this.particles.draw(ctx);
    ctx.restore();

    const inRun = this.screen === 'playing' || this.screen === 'paused' || this.screen === 'choice';
    const lightFrac = inRun ? this.keeper.light / this.keeper.maxLight : 0.55;
    this.drawDarkness(lightFrac);
    this.floaters.draw(ctx);
    this.drawFlash();

    if (inRun) drawHUD(ctx, this);
    if (this.screen === 'playing') {
      this.drawBanner();
      this.drawTutorialHints();
    }
    if (this.screen === 'title') this.drawTitle();
    else if (this.screen === 'cache') this.drawCache();
    else if (this.screen === 'choice') this.drawChoice();
    else if (this.screen === 'paused') this.drawCentred(['Paused', 'P to resume']);
    else if (this.screen === 'gameover') this.drawGameOver();
    this.drawMuteToggle();
  }

  // The night's name, announced as the night begins and gone before it
  // can get in the way: a slow fade in, a hold, a fade out.
  drawBanner() {
    if (this.bannerT <= 0 || !this.bannerTitle) return;
    const { ctx } = this;
    const t = this.bannerT; // 3 → 0 over the banner's life
    const alpha = t > 2.5 ? (3 - t) * 2 : t < 0.7 ? t / 0.7 : 1;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9bb';
    ctx.font = '700 34px Georgia, serif';
    ctx.fillText(`Night ${this.night}`, W / 2, 148);
    ctx.fillStyle = this.bossThisNight ? '#ffb08a' : '#ffca6a';
    ctx.font = 'italic 700 25px Georgia, serif';
    ctx.fillText(this.bannerTitle.name, W / 2, 182);
    if (this.bannerTitle.sub) {
      ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
      ctx.font = '16px Georgia, serif';
      ctx.fillText(this.bannerTitle.sub, W / 2, 208);
    }
    ctx.restore();
  }

  // First-night teaching, written on the ridge itself: four short lines
  // in turn across the opening twenty seconds, each gone before the next
  // arrives. The game never pauses to explain itself — the night teaches
  // while it is being survived.
  drawTutorialHints() {
    if (this.night !== 1 || this.screen !== 'playing') return;
    const elapsed = this.nightLength - this.nightLeft;
    const HINTS = [
      [0, 5.5, 'Move to catch the golden embers — they feed the flame'],
      [5.5, 11, 'Keep the dark ash out of the basket'],
      [11, 16.5, 'Unbroken catches raise your combo — and your score'],
      [16.5, 22, 'Frost slows time · violet wisps kindle the flame'],
    ];
    const hint = HINTS.find(([from, to]) => elapsed >= from && elapsed < to);
    if (!hint) return;
    const [from, to, text] = hint;
    const fade = Math.min(1, (elapsed - from) / 0.8, (to - elapsed) / 0.8);
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = Math.max(0, fade) * 0.9;
    ctx.textAlign = 'center';
    ctx.font = 'italic 16.5px Georgia, serif';
    ctx.fillStyle = '#ffe9bb';
    ctx.fillText(text, W / 2, H - 64);
    ctx.restore();
  }

  // The mute state, always visible in the corner — sound is part of the
  // game, and its switch should be seen, not just remembered. Clickable.
  drawMuteToggle() {
    const { ctx } = this;
    const r = this.muteRect;
    ctx.save();
    ctx.textAlign = 'right';
    ctx.font = '13px Georgia, serif';
    ctx.fillStyle = this.sound.muted ? 'rgba(255, 140, 120, 0.85)' : 'rgba(232, 226, 208, 0.55)';
    ctx.fillText(this.sound.muted ? '✕ sound off (M)' : '♪ sound on (M)', r.x + r.w, r.y + 16);
    ctx.restore();
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
    ctx.fillText('The valley has one light left, and the night wants it.', W / 2, 262);
    ctx.fillText('Catch the falling embers to keep your lantern alive —', W / 2, 306);
    ctx.fillText('but keep the ash out, and mind the frost.', W / 2, 330);
    ctx.fillStyle = 'rgba(216, 180, 255, 0.9)';
    ctx.fillText('Dare the violet wisps: caught, they kindle the flame —', W / 2, 356);
    ctx.fillText('burst beside you, they bite it.', W / 2, 380);
    ctx.fillStyle = 'rgba(255, 162, 106, 0.92)';
    ctx.fillText('And when the ash crow circles: never catch its cinders —', W / 2, 406);
    ctx.fillText('let them fall, and gather what cracks open.', W / 2, 430);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 21px Georgia, serif';
    ctx.fillText('Press Enter or click to take up the lantern', W / 2, 458);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.6)';
    ctx.font = '15px Georgia, serif';
    ctx.fillText('Mouse or ← → / A D to move · P pause · M mute', W / 2, 484);
    // The purse and the shop it feeds: Marks outlive every run.
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 17px Georgia, serif';
    const cacheLine = `✦ Keeper’s Marks: ${this.meta.marks} — the Keeper’s Cache (press C) ✦`;
    ctx.fillText(cacheLine, W / 2, 516);
    this.cacheLinkRect = { x: W / 2 - 250, y: 496, w: 500, h: 28 };
    if (this.best > 0) {
      ctx.fillStyle = '#ffca6a';
      ctx.font = '17px Georgia, serif';
      ctx.fillText(`Best score so far: ${this.best}`, W / 2, 546);
    }
  }

  // The Keeper's Cache: where Marks become permanent blessings. Three
  // shelves, three levels each, prices climbing — keys 1–3 or a click
  // buy, Esc or the back line returns to the title.
  drawCache() {
    const { ctx } = this;
    ctx.fillStyle = 'rgba(4, 6, 16, 0.82)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffe9bb';
    ctx.font = '700 36px Georgia, serif';
    ctx.fillText('The Keeper’s Cache', W / 2, 104);
    ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
    ctx.font = '17px Georgia, serif';
    ctx.fillText('Blessings bought with Keeper’s Marks never fade.', W / 2, 134);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 19px Georgia, serif';
    ctx.fillText(`✦ Marks: ${this.meta.marks}`, W / 2, 166);

    const rowW = 660, rowH = 92, gap = 14, x0 = (W - rowW) / 2;
    this.cacheRows = CACHE_ITEMS.map((item, i) => ({
      x: x0, y: 188 + i * (rowH + gap), w: rowW, h: rowH, id: item.id,
    }));
    for (const row of this.cacheRows) {
      const item = CACHE_ITEMS.find((it) => it.id === row.id);
      const lvl = ownedLevel(this.meta, item.id);
      const price = priceFor(this.meta, item);
      const afford = price !== null && this.meta.marks >= price;
      ctx.fillStyle = 'rgba(20, 27, 52, 0.95)';
      ctx.strokeStyle = afford ? 'rgba(255, 202, 106, 0.75)' : 'rgba(160, 170, 200, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(row.x, row.y, row.w, row.h, 12);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffca6a';
      ctx.font = '34px Georgia, serif';
      ctx.fillText(item.icon, row.x + 22, row.y + 56);
      ctx.font = '700 21px Georgia, serif';
      ctx.fillStyle = '#ffe9bb';
      const pips = '●'.repeat(lvl) + '○'.repeat(item.prices.length - lvl);
      ctx.fillText(`${item.name}  ${pips}`, row.x + 72, row.y + 34);
      ctx.font = '15px Georgia, serif';
      ctx.fillStyle = 'rgba(232, 226, 208, 0.85)';
      const blurb = price === null ? 'Fully bought — it rides with you now.' : item.desc[lvl];
      this.wrapText(blurb, row.x + 72, row.y + 60, 440, 19, 'left');
      ctx.textAlign = 'right';
      ctx.font = '700 17px Georgia, serif';
      ctx.fillStyle = price === null ? 'rgba(160, 220, 160, 0.9)' : afford ? '#ffd98a' : 'rgba(232, 226, 208, 0.45)';
      ctx.fillText(price === null ? 'MAX' : `Buy · ${price} ✦`, row.x + row.w - 20, row.y + 40);
      ctx.font = '13px Georgia, serif';
      ctx.fillStyle = 'rgba(232, 226, 208, 0.5)';
      ctx.fillText(`press ${this.cacheRows.indexOf(row) + 1}`, row.x + row.w - 20, row.y + 62);
      ctx.textAlign = 'center';
    }

    if (this.cacheMsg) {
      ctx.fillStyle = '#ffd98a';
      ctx.font = '16px Georgia, serif';
      ctx.fillText(this.cacheMsg, W / 2, 516);
    }
    ctx.fillStyle = 'rgba(232, 226, 208, 0.7)';
    ctx.font = '16px Georgia, serif';
    ctx.fillText('Esc to return to the title', W / 2, 556);
    this.cacheBackRect = { x: W / 2 - 160, y: 534, w: 320, h: 30 };
  }

  buyFromCache(id) {
    const item = CACHE_ITEMS.find((it) => it.id === id);
    if (!item) return;
    const price = priceFor(this.meta, item);
    if (price === null) {
      this.cacheMsg = `${item.name} is already at its deepest.`;
      return;
    }
    if (buyItem(this.meta, id)) {
      this.cacheMsg = `${item.name}, level ${ownedLevel(this.meta, id)} — yours on every run now.`;
      this.sound.ensure();
      this.sound.cacheChime();
    } else {
      this.cacheMsg = `Not enough Marks for ${item.name} — it costs ${price} ✦. A good run leaves more behind.`;
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
    if (this.dawnBonus > 0 || this.bossBonus > 0) {
      const parts = [];
      if (this.dawnBonus > 0) parts.push(`Dawn bonus +${this.dawnBonus} — the light you kept became gold`);
      if (this.bossBonus > 0) parts.push(`the golem’s hoard pays +${this.bossBonus}, and a rare blessing is offered`);
      ctx.fillStyle = '#ffd98a';
      ctx.font = '700 16.5px Georgia, serif';
      ctx.fillText(parts.join(' · '), W / 2, 210);
    }

    const cardW = 330, cardH = 190, gap = 36;
    const x0 = W / 2 - cardW - gap / 2;
    this.choiceCards = this.options.map((opt, i) => ({
      x: x0 + i * (cardW + gap), y: 232, w: cardW, h: cardH, idx: i,
    }));
    for (const card of this.choiceCards) {
      const opt = this.options[card.idx];
      ctx.fillStyle = 'rgba(20, 27, 52, 0.95)';
      // A rare blessing (the golem's guarantee) wears a violet-gold edge.
      ctx.strokeStyle = opt.rare ? 'rgba(216, 180, 255, 0.95)' : 'rgba(255, 202, 106, 0.65)';
      ctx.lineWidth = opt.rare ? 3 : 2;
      ctx.beginPath();
      ctx.roundRect(card.x, card.y, card.w, card.h, 12);
      ctx.fill();
      ctx.stroke();
      if (opt.rare) {
        ctx.fillStyle = '#d8b4ff';
        ctx.font = '700 13px Georgia, serif';
        ctx.fillText('✦ RARE ✦', card.x + card.w / 2, card.y + 24);
      }
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

  wrapText(text, cx, y, maxWidth, lineHeight, align = 'center') {
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
    const prevAlign = this.ctx.textAlign;
    this.ctx.textAlign = align;
    lines.forEach((l, i) => this.ctx.fillText(l, cx, y + i * lineHeight));
    this.ctx.textAlign = prevAlign;
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
    ctx.fillText(`Nights survived: ${this.night - 1} · fell on Night ${this.night}`, W / 2, 330);
    ctx.font = '16px Georgia, serif';
    ctx.fillStyle = 'rgba(232, 226, 208, 0.75)';
    ctx.fillText(
      `Embers caught ${this.stats.embers} · best streak ${this.stats.bestStreak} · wisps kindled ${this.stats.wisps}`,
      W / 2, 358);
    const line2 = [`Ash swallowed ${this.stats.ash}`, `moonwater sipped ${this.stats.moon}`];
    if (this.stats.cinders > 0) line2.push(`cinders cracked ${this.stats.cinders}`);
    if (this.stats.stomps > 0) line2.push(`golem stomps ${this.stats.stomps}`, `embers it ate ${this.stats.swallowed}`);
    ctx.fillText(line2.join(' · '), W / 2, 382);
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 18px Georgia, serif';
    ctx.fillText(`✦ Keeper’s Marks +${this.marksEarned} — purse now ${this.meta.marks} ✦`, W / 2, 412);
    if (this.taken.length) {
      ctx.font = '15px Georgia, serif';
      ctx.fillStyle = 'rgba(255, 217, 138, 0.7)';
      ctx.fillText(`Blessings taken: ${this.taken.length}`, W / 2, 438);
    }
    ctx.fillStyle = '#ffd98a';
    ctx.font = '700 20px Georgia, serif';
    ctx.fillText('Press Enter or click to light it again', W / 2, 472);
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
  const p = canvasPos(evt);
  const inRect = (r) => r && p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  // The mute corner answers before anything else, on every screen.
  if (inRect(game.muteRect)) {
    game.sound.setMuted(!game.sound.muted);
    return;
  }
  if (game.screen === 'title') {
    if (inRect(game.cacheLinkRect)) {
      game.cacheMsg = '';
      game.setScreen('cache');
    } else {
      game.startRun();
    }
  } else if (game.screen === 'gameover') {
    game.startRun();
  } else if (game.screen === 'cache') {
    const row = game.cacheRows.find((r) => inRect(r));
    if (row) game.buyFromCache(row.id);
    else if (inRect(game.cacheBackRect)) game.setScreen('title');
  } else if (game.screen === 'choice') {
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
  } else if ((key === 'c' || key === 'C') && game.screen === 'title') {
    game.cacheMsg = '';
    game.setScreen('cache');
  } else if (game.screen === 'cache') {
    if (key === 'Escape') game.setScreen('title');
    else if (key === '1' || key === '2' || key === '3') {
      const item = CACHE_ITEMS[Number(key) - 1];
      if (item) game.buyFromCache(item.id);
    }
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
