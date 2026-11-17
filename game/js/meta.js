// meta.js — what the keeper keeps between runs: Keeper's Marks and the
// Keeper's Cache. Marks are earned by every run (the better the run, the
// more it leaves behind) and spent in the Cache on three permanent
// blessings that apply to every run from then on. All of it persists in
// localStorage; this module owns the saving, the prices and the applying,
// so main.js only ever asks "how many marks?" and "make it so".

const META_KEY = 'emberfall-meta';

// The Cache's three shelves. Each blessing has three levels and the price
// climbs with every level taken — the first taste is cheap, mastery is
// not. `desc` is written for the level the buyer is about to take.
export const CACHE_ITEMS = [
  {
    id: 'deepwick',
    name: 'Deep Wick',
    icon: '♨',
    prices: [4, 9, 18],
    desc: [
      'Every run begins with +8 more light in the lantern.',
      'A deeper wick still: +8 more starting light (16 in all).',
      'The deepest wick: +8 more starting light (24 in all).',
    ],
  },
  {
    id: 'widehands',
    name: 'Wide Hands',
    icon: '◠',
    prices: [4, 9, 18],
    desc: [
      'The basket is +4 wider on every run, forever.',
      'Wider still: another +4 (8 in all).',
      'A keeper’s reach: another +4 (12 in all).',
    ],
  },
  {
    id: 'wardcharm',
    name: 'Ward Charm',
    icon: '◎',
    prices: [6, 14, 28],
    desc: [
      'Every run begins with an ash shield already raised.',
      'The charm renews the shield at every dawn, like the blessing.',
      'A blocked ash now feeds the flame +4 light as it breaks.',
    ],
  },
];

function blankMeta() {
  return { marks: 0, owned: { deepwick: 0, widehands: 0, wardcharm: 0 } };
}

// Read the keeper's purse. Anything missing or malformed in storage falls
// back to a fresh purse rather than breaking the game.
export function loadMeta() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return blankMeta();
    const parsed = JSON.parse(raw);
    const meta = blankMeta();
    if (Number.isFinite(parsed.marks) && parsed.marks >= 0) meta.marks = Math.floor(parsed.marks);
    for (const item of CACHE_ITEMS) {
      const lvl = parsed.owned ? parsed.owned[item.id] : 0;
      if (Number.isFinite(lvl)) meta.owned[item.id] = Math.max(0, Math.min(item.prices.length, Math.floor(lvl)));
    }
    return meta;
  } catch {
    return blankMeta();
  }
}

export function saveMeta(meta) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    // Storage can be unavailable (private mode, quotas). The run goes on;
    // the marks simply do not persist.
  }
}

// What a finished run leaves behind: one Mark per 150 points, plus one
// per night survived — endurance pays even when the score does not.
export function marksEarnedForRun(score, nightsCompleted) {
  return Math.floor(Math.max(0, score) / 150) + Math.max(0, nightsCompleted);
}

export function ownedLevel(meta, id) {
  return meta.owned[id] || 0;
}

// The price of the next level of an item, or null when it is maxed.
export function priceFor(meta, item) {
  const lvl = ownedLevel(meta, item.id);
  return lvl >= item.prices.length ? null : item.prices[lvl];
}

// Try to buy the next level of an item. On success the marks are spent,
// the level rises and the purse is saved; on failure nothing changes.
export function buyItem(meta, id) {
  const item = CACHE_ITEMS.find((it) => it.id === id);
  if (!item) return false;
  const price = priceFor(meta, item);
  if (price === null || meta.marks < price) return false;
  meta.marks -= price;
  meta.owned[id] = ownedLevel(meta, id) + 1;
  saveMeta(meta);
  return true;
}

// Lay the permanent blessings over a fresh run. Called from resetRun
// after the keeper and the per-run fields are back at their defaults, so
// the Cache stacks with — never replaces — what a run earns on its own.
export function applyMeta(game) {
  const meta = game.meta;
  const wick = ownedLevel(meta, 'deepwick');
  if (wick > 0) game.keeper.addLight(8 * wick);
  const hands = ownedLevel(meta, 'widehands');
  if (hands > 0) game.keeper.basketHalf = Math.min(74, game.keeper.basketHalf + 4 * hands);
  const ward = ownedLevel(meta, 'wardcharm');
  if (ward >= 1) game.keeper.shield = true;
  if (ward >= 2) game.shieldPerNight = true;
}
