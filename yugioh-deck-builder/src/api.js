// Card data comes from the free YGOPRODeck API (no key needed).
// Docs: https://ygoprodeck.com/api-guide/
const BASE = 'https://db.ygoprodeck.com/api/v7';

const EXTRA_FRAMES = ['fusion', 'synchro', 'xyz', 'link'];

async function get(path) {
  const res = await fetch(`${BASE}${path}`);
  const json = await res.json();
  // The API answers "no results" with a 400 and an `error` field.
  if (json.error) return [];
  return json.data ?? [];
}

// Strip the large API objects down to what the app actually uses.
export function slimCard(c) {
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    frameType: c.frameType,
    desc: c.desc ?? '',
    level: c.level ?? c.linkval ?? null,
    race: c.race ?? null,
    archetype: c.archetype ?? null,
    banTcg: c.banlist_info?.ban_tcg ?? null,
    image: c.card_images?.[0]?.image_url_small ?? null,
  };
}

export function isExtraDeck(card) {
  return EXTRA_FRAMES.some((f) => card.frameType?.startsWith(f));
}

export function isPlayable(card) {
  return !['token', 'skill'].includes(card.frameType);
}

export async function searchCards(text) {
  const q = text.trim();
  if (!q) return [];
  const data = await get(`/cardinfo.php?fname=${encodeURIComponent(q)}&num=40&offset=0`);
  return data.map(slimCard).filter(isPlayable);
}

export async function getArchetypeCards(archetype) {
  const data = await get(`/cardinfo.php?archetype=${encodeURIComponent(archetype.trim())}`);
  return data.map(slimCard).filter(isPlayable);
}

export async function getCardsByName(names) {
  if (!names.length) return [];
  const data = await get(`/cardinfo.php?name=${names.map(encodeURIComponent).join('|')}`);
  return data.map(slimCard);
}

let archetypeCache = null;
export async function getArchetypes() {
  if (archetypeCache) return archetypeCache;
  const res = await fetch(`${BASE}/archetypes.php`);
  const json = await res.json();
  archetypeCache = json.map((a) => a.archetype_name).sort();
  return archetypeCache;
}
