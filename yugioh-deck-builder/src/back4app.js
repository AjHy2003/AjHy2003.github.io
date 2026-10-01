// Talks to Back4App (hosted Parse Server) through its REST API.
// Using plain fetch keeps the app Expo Go compatible (the Parse JS SDK needs Node's crypto).
// If no keys are set, decks are saved on the device with AsyncStorage instead.
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_ID = process.env.EXPO_PUBLIC_BACK4APP_APP_ID;
const REST_KEY = process.env.EXPO_PUBLIC_BACK4APP_REST_KEY;
const JS_KEY = process.env.EXPO_PUBLIC_BACK4APP_JS_KEY;
const CLIENT_KEY = process.env.EXPO_PUBLIC_BACK4APP_CLIENT_KEY;
const KEY = (REST_KEY || JS_KEY || CLIENT_KEY || '').trim();
const SERVER = process.env.EXPO_PUBLIC_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com';
const CLASS = 'Deck';
const LOCAL_KEY = 'decks.v1';
const USER_KEY = 'user.v1';

// Any one client key (REST API, JavaScript or Client Key) works with Parse Server's REST API.
export const isCloudEnabled = Boolean(APP_ID && KEY);

// --- Session --------------------------------------------------------------

let currentUser = null; // { objectId, username, sessionToken }

export async function restoreUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  currentUser = raw ? JSON.parse(raw) : null;
  if (currentUser) {
    try {
      await api('GET', '/users/me'); // throws if the session expired
    } catch {
      await clearUser();
    }
  }
  return currentUser;
}

async function setUser({ objectId, username, sessionToken }) {
  currentUser = { objectId, username, sessionToken };
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  return currentUser;
}

async function clearUser() {
  currentUser = null;
  await AsyncStorage.removeItem(USER_KEY);
}

export const getUser = () => currentUser;

// --- REST helper ----------------------------------------------------------

async function api(method, path, body) {
  if (!isCloudEnabled) throw new Error('Add your Back4App keys to .env first.');
  // Parse Server accepts the request if any of these matches, so the same key is sent
  // under each name; that way it works whichever key type was copied from Back4App.
  const headers = {
    'X-Parse-Application-Id': APP_ID.trim(),
    'X-Parse-REST-API-Key': KEY,
    'X-Parse-Javascript-Key': KEY,
    'X-Parse-Client-Key': KEY,
    'Content-Type': 'application/json',
  };
  if (currentUser) headers['X-Parse-Session-Token'] = currentUser.sessionToken;
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (res.status === 403 && json.error === 'unauthorized') {
    throw new Error(
      'Back4App rejected the App ID or key. Check .env against App Settings → Security & Keys, then restart with --clear.',
    );
  }
  if (!res.ok) throw new Error(json.error || `Back4App error ${res.status}`);
  return json;
}

export const callFunction = async (name, params = {}) =>
  (await api('POST', `/functions/${name}`, params)).result;

// --- Auth -----------------------------------------------------------------

export async function signUp(username, password) {
  const res = await api('POST', '/users', { username, password });
  return setUser({ ...res, username });
}

export async function logIn(username, password) {
  const res = await api('POST', '/login', { username, password });
  return setUser(res);
}

export async function logOut() {
  try {
    await api('POST', '/logout');
  } finally {
    await clearUser();
  }
}

// --- Decks ----------------------------------------------------------------

const serialize = (entries) => entries.map(({ card, count }) => ({ card, count }));
const useCloud = () => isCloudEnabled && currentUser;

async function readLocal() {
  const raw = await AsyncStorage.getItem(LOCAL_KEY);
  return raw ? JSON.parse(raw) : [];
}

export async function listDecks() {
  if (!useCloud()) return readLocal();
  const where = encodeURIComponent(
    JSON.stringify({ owner: { __type: 'Pointer', className: '_User', objectId: currentUser.objectId } }),
  );
  const { results } = await api('GET', `/classes/${CLASS}?where=${where}&order=-updatedAt&limit=100`);
  return results;
}

export async function saveDeck({ objectId, name, archetype, main, extra }) {
  const data = { name, archetype: archetype || '', main: serialize(main), extra: serialize(extra) };
  if (!useCloud()) {
    const decks = await readLocal();
    const id = objectId || String(Date.now());
    const now = new Date().toISOString();
    const next = [{ ...data, objectId: id, updatedAt: now }, ...decks.filter((d) => d.objectId !== id)];
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    return id;
  }
  // Decks saved before logging in have local ids, so create them in the cloud.
  if (objectId && !/^\d+$/.test(objectId)) {
    await api('PUT', `/classes/${CLASS}/${objectId}`, data);
    return objectId;
  }
  const created = await api('POST', `/classes/${CLASS}`, {
    ...data,
    owner: { __type: 'Pointer', className: '_User', objectId: currentUser.objectId },
    ACL: { [currentUser.objectId]: { read: true, write: true } },
  });
  return created.objectId;
}

export async function deleteDeck(objectId) {
  if (!useCloud()) {
    const decks = await readLocal();
    await AsyncStorage.setItem(LOCAL_KEY, JSON.stringify(decks.filter((d) => d.objectId !== objectId)));
    return;
  }
  await api('DELETE', `/classes/${CLASS}/${objectId}`);
}

// --- Push notifications (see cloud/main.js) ------------------------------

export const registerPushDevice = (token, platform, deviceName) =>
  callFunction('registerPushDevice', { token, platform, deviceName });

export const unregisterPushDevice = (token) => callFunction('unregisterPushDevice', { token });

export const sendPushNotification = (params) => callFunction('sendPushNotification', params);
