// Saves decks to Back4App (hosted Parse Server) through its REST API.
// Using plain fetch keeps the app 100% Expo Go compatible (no native modules).
// If no keys are set, decks are saved on the device with AsyncStorage instead.
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_ID = process.env.EXPO_PUBLIC_BACK4APP_APP_ID;
const REST_KEY = process.env.EXPO_PUBLIC_BACK4APP_REST_KEY;
const SERVER = process.env.EXPO_PUBLIC_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com';
const CLASS = 'Deck';
const LOCAL_KEY = 'decks.v1';

export const isCloudEnabled = Boolean(APP_ID && REST_KEY);

async function api(method, path, body) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: {
      'X-Parse-Application-Id': APP_ID,
      'X-Parse-REST-API-Key': REST_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || `Back4App error ${res.status}`);
  return json;
}

// Store only ids/counts plus the slim card data so a saved deck renders offline.
const serialize = (entries) => entries.map(({ card, count }) => ({ card, count }));

async function readLocal() {
  const raw = await AsyncStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function listDecks() {
  if (!isCloudEnabled) return readLocal();
  const { results } = await api('GET', `/classes/${CLASS}?order=-updatedAt&limit=100`);
  return results;
}

export async function saveDeck({ objectId, name, archetype, main, extra }) {
  const data = { name, archetype: archetype || '', main: serialize(main), extra: serialize(extra) };
  if (!isCloudEnabled) {
    const decks = await readLocal();
    const id = objectId || String(Date.now());
    const now = new Date().toISOString();
    const next = [{ ...data, objectId: id, updatedAt: now }, ...decks.filter((d) => d.objectId !== id)];
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return id;
  }
  if (objectId) {
    await api('PUT', `/classes/${CLASS}/${objectId}`, data);
    return objectId;
  }
  const created = await api('POST', `/classes/${CLASS}`, data);
  return created.objectId;
}

export async function deleteDeck(objectId) {
  if (!isCloudEnabled) {
    const decks = await readLocal();
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(decks.filter((d) => d.objectId !== objectId)));
    return;
  }
  await api('DELETE', `/classes/${CLASS}/${objectId}`);
}
