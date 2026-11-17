// upgrades.js — the rewards offered between nights. When a night ends the
// game offers two of these at random; the chosen one applies immediately
// and stacks with everything taken before. Each entry knows how to change
// the game state, so main.js never special-cases an upgrade.

export const UPGRADES = [
  {
    id: 'wide',
    name: 'Wider Lantern',
    desc: 'The basket grows. Catches get easier, misses rarer.',
    icon: '◠',
    apply(game) { game.keeper.basketHalf = Math.min(74, game.keeper.basketHalf + 13); },
  },
  {
    id: 'wick',
    name: 'Steady Wick',
    desc: 'The flame sips instead of gulping: light drains 15% slower.',
    icon: '♨',
    apply(game) { game.keeper.drainPerSec *= 0.85; },
  },
  {
    id: 'magnet',
    name: 'Ember Magnet',
    desc: 'Nearby embers curve toward the lantern as they fall.',
    icon: '✦',
    apply(game) { game.magnetRadius = Math.min(230, game.magnetRadius + 85); },
  },
  {
    id: 'shield',
    name: 'Ash Shield',
    desc: 'A ring of ward-light blocks one ash hit every night.',
    icon: '◎',
    apply(game) { game.shieldPerNight = true; game.keeper.shield = true; },
  },
  {
    id: 'bright',
    name: 'Brighter Core',
    desc: 'A hotter heart: embers are worth +4 more points and drain slows a touch.',
    icon: '☀',
    apply(game) {
      game.emberBonus += 4;
      game.keeper.drainPerSec *= 0.94;
    },
  },
  {
    id: 'stormglass',
    name: 'Stormglass Charm',
    desc: 'Wisps kindle the flame far longer, and a burst wisp feeds it +5 light instead of zapping.',
    icon: '✧',
    rare: true,
    apply(game) {
      game.kindledFactor = 1.8;
      game.wispWard = true;
    },
  },
  {
    id: 'dawntithe',
    name: 'Dawn Tithe',
    desc: 'The dawn pays double: light left at night’s end is worth twice the score.',
    icon: '☼',
    rare: true,
    apply(game) { game.dawnFactor = 2; },
  },
];

// Two distinct upgrades, chosen at random.
export function pickTwo() {
  const pool = [...UPGRADES];
  const first = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  const second = pool[Math.floor(Math.random() * pool.length)];
  return [first, second];
}

// The dawn after a boss night: the golem's hoard guarantees one rare
// blessing among the two offered. The rare comes first so the choice
// screen can dress its card differently.
export function pickBossPair() {
  const rares = UPGRADES.filter((u) => u.rare);
  const rest = UPGRADES.filter((u) => !u.rare);
  const rare = rares[Math.floor(Math.random() * rares.length)];
  const other = rest[Math.floor(Math.random() * rest.length)];
  return [rare, other];
}

export function applyUpgrade(game, upgrade) {
  upgrade.apply(game);
  game.taken.push(upgrade.id);
}
