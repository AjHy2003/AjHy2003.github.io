import { isExtraDeck } from './api';

// Generic cards almost every competitive deck can play. Anything banned on the
// current TCG list is filtered out automatically when the optimizer runs.
export const STAPLE_NAMES = [
  'Ash Blossom & Joyous Spring',
  'Maxx "C"',
  'Effect Veiler',
  'Infinite Impermanence',
  'Ghost Belle & Haunted Mansion',
  'Called by the Grave',
  'Triple Tactics Talent',
  'Pot of Prosperity',
  'Forbidden Droplet',
  'Droll & Lock Bird',
  'Nibiru, the Primal Being',
  'Crossout Designator',
];

const MAIN_SIZE = 40;
const EXTRA_SIZE = 15;
const HAND_SIZE = 5;

export function maxCopies(card) {
  switch (card.banTcg) {
    case 'Banned':
    case 'Forbidden':
      return 0;
    case 'Limited':
      return 1;
    case 'Semi-Limited':
      return 2;
    default:
      return 3;
  }
}

const isMonster = (c) => c.type?.includes('Monster');
const isSpell = (c) => c.type === 'Spell Card';
const isTrap = (c) => c.type === 'Trap Card';

// --- Card role detection from effect text ---------------------------------

// Starters: cards that get a combo going by themselves (searchers / deck summoners).
export function isStarter(c) {
  const d = c.desc.toLowerCase();
  return (
    /add (1|one|2|two)[^.]*from your deck to your hand/.test(d) ||
    /special summon (1|one)[^.]*from your deck/.test(d)
  );
}

// Extenders: cards that add extra bodies to the field from hand/GY.
export function isExtender(c) {
  const d = c.desc.toLowerCase();
  return /you can special summon this card from your (hand|gy|graveyard)/.test(d);
}

export function isHandTrap(c) {
  const d = c.desc.toLowerCase();
  return (
    isMonster(c) &&
    /\(quick effect\)/.test(d) &&
    /discard this card|send this card from your hand|reveal this card in your hand/.test(d)
  );
}

export function isInterruption(c) {
  return /negate/.test(c.desc.toLowerCase());
}

// Higher score = more valuable to the deck.
export function scoreCard(c, archetype) {
  let s = 0;
  const arch = archetype?.toLowerCase();
  if (arch && (c.archetype?.toLowerCase() === arch || c.name.toLowerCase().includes(arch))) s += 3;
  if (isStarter(c)) s += 5;
  if (isExtender(c)) s += 3;
  if (isInterruption(c)) s += 2;
  if (isHandTrap(c)) s += 2;
  if (isSpell(c) && c.race === 'Field') s += 1;
  if (isMonster(c) && !isExtraDeck(c)) {
    if (c.level && c.level <= 4) s += 1;
    // Big monsters that can't summon themselves are bricks.
    if (c.level >= 7 && !/special summon/i.test(c.desc)) s -= 3;
  }
  if (/you can only control 1/i.test(c.desc)) s -= 1;
  return s;
}

// --- Probability helpers --------------------------------------------------

function choose(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

// Chance to draw at least one of `hits` copies in an opening hand.
export function openChance(hits, deckSize, hand = HAND_SIZE) {
  if (deckSize <= 0) return 0;
  return 1 - choose(deckSize - hits, hand) / choose(deckSize, hand);
}

// --- Deck analysis --------------------------------------------------------

export const count = (entries) => entries.reduce((n, e) => n + e.count, 0);

export function analyzeDeck(deck) {
  const mainSize = count(deck.main);
  const extraSize = count(deck.extra);
  const starters = count(deck.main.filter((e) => isStarter(e.card)));
  const handTraps = count(deck.main.filter((e) => isHandTrap(e.card)));
  const monsters = count(deck.main.filter((e) => isMonster(e.card)));
  const spells = count(deck.main.filter((e) => isSpell(e.card)));
  const traps = count(deck.main.filter((e) => isTrap(e.card)));
  const bricks = count(
    deck.main.filter((e) => isMonster(e.card) && e.card.level >= 7 && !/special summon/i.test(e.card.desc)),
  );

  const warnings = [];
  if (mainSize < 40) warnings.push(`Main Deck needs at least 40 cards (has ${mainSize}).`);
  if (mainSize > 60) warnings.push(`Main Deck can have at most 60 cards (has ${mainSize}).`);
  if (mainSize > 40) warnings.push('Cutting down to 40 makes your best cards show up more often.');
  if (extraSize > 15) warnings.push(`Extra Deck can have at most 15 cards (has ${extraSize}).`);
  for (const e of [...deck.main, ...deck.extra]) {
    const max = maxCopies(e.card);
    if (e.count > max) warnings.push(`${e.card.name}: ${e.count} copies, limit is ${max}.`);
  }
  const p = openChance(starters, mainSize);
  if (mainSize >= 40 && p < 0.8) warnings.push('Less than 80% to open a starter — add more searchers.');
  if (bricks > 3) warnings.push(`${bricks} high-level monsters with no way to summon themselves.`);

  return { mainSize, extraSize, starters, handTraps, monsters, spells, traps, bricks, starterOdds: p, warnings };
}

// --- Optimizer ------------------------------------------------------------

/**
 * Build a 40-card Main Deck + 15-card Extra Deck from an archetype pool.
 *
 * Strategy:
 *  1. Score every legal card by role (starter, extender, interruption...).
 *  2. Give the core engine its max legal copies, filling ~28 slots.
 *  3. Fill the rest with the best generic staples / hand traps.
 *  4. Hill-climb: swap the weakest non-starter for more starter copies until
 *     the odds of opening a starter stop improving.
 */
export function optimizeDeck(pool, staples, archetype, { engineSlots = 28 } = {}) {
  const legal = (c) => maxCopies(c) > 0;
  const uniq = new Map();
  for (const c of pool) if (legal(c)) uniq.set(c.id, c);
  const cards = [...uniq.values()];

  const mainPool = cards
    .filter((c) => !isExtraDeck(c))
    .map((card) => ({ card, score: scoreCard(card, archetype) }))
    .sort((a, b) => b.score - a.score);
  const extraPool = cards
    .filter(isExtraDeck)
    .map((card) => ({ card, score: scoreCard(card, archetype) }))
    .sort((a, b) => b.score - a.score);

  const main = new Map(); // id -> { card, count }
  const add = (card, n) => {
    const cur = main.get(card.id)?.count ?? 0;
    const room = Math.min(maxCopies(card) - cur, MAIN_SIZE - total());
    if (room <= 0) return 0;
    const take = Math.min(n, room);
    main.set(card.id, { card, count: cur + take });
    return take;
  };
  const total = () => count([...main.values()]);

  // 2. Engine
  for (const { card, score } of mainPool) {
    if (total() >= engineSlots) break;
    if (score <= 0) continue;
    const want = isStarter(card) || score >= 6 ? 3 : score >= 4 ? 2 : 1;
    add(card, Math.min(want, engineSlots - total()));
  }

  // 3. Staples (skip ones already in the deck)
  const stapleCards = staples
    .filter((c) => legal(c) && !main.has(c.id))
    .map((card) => ({ card, score: scoreCard(card) + (isHandTrap(card) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score);
  for (const { card } of stapleCards) {
    if (total() >= MAIN_SIZE) break;
    add(card, isHandTrap(card) ? 3 : 2);
  }

  // Still short? Pad with remaining archetype cards, then extra copies.
  for (const { card } of mainPool) {
    if (total() >= MAIN_SIZE) break;
    add(card, 3);
  }

  // 4. Hill-climb toward more starters.
  const starterCount = () => count([...main.values()].filter((e) => isStarter(e.card)));
  for (let i = 0; i < 20; i++) {
    const upgrade = mainPool.find(
      ({ card }) => isStarter(card) && (main.get(card.id)?.count ?? 0) < maxCopies(card),
    );
    if (!upgrade) break;
    const victims = [...main.values()]
      .filter((e) => !isStarter(e.card) && !isHandTrap(e.card))
      .sort((a, b) => scoreCard(a.card, archetype) - scoreCard(b.card, archetype));
    const victim = victims[0];
    if (!victim || scoreCard(victim.card, archetype) >= upgrade.score) break;
    const before = openChance(starterCount(), MAIN_SIZE);
    victim.count -= 1;
    if (victim.count === 0) main.delete(victim.card.id);
    add(upgrade.card, 1);
    if (openChance(starterCount(), MAIN_SIZE) <= before) break;
  }

  // Extra Deck: best cards first, 1 copy each, then doubles if there's room.
  const extra = [];
  for (const { card } of extraPool) {
    if (count(extra) >= EXTRA_SIZE) break;
    extra.push({ card, count: 1 });
  }
  for (const e of extra) {
    if (count(extra) >= EXTRA_SIZE) break;
    if (maxCopies(e.card) > 1) e.count += 1;
  }

  const order = (e) => (isMonster(e.card) ? 0 : isSpell(e.card) ? 1 : 2);
  const sorted = [...main.values()].sort((a, b) => order(a) - order(b) || b.count - a.count);
  return { main: sorted, extra };
}
