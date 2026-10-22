// Talks to Back4App (hosted Parse Server) through its REST API.
// Plain fetch keeps the app Expo Go compatible (the Parse JS SDK needs Node's crypto).
import AsyncStorage from '@react-native-async-storage/async-storage';

const APP_ID = (process.env.EXPO_PUBLIC_BACK4APP_APP_ID || '').trim();
const KEY = (
  process.env.EXPO_PUBLIC_BACK4APP_REST_KEY ||
  process.env.EXPO_PUBLIC_BACK4APP_JS_KEY ||
  process.env.EXPO_PUBLIC_BACK4APP_CLIENT_KEY ||
  ''
).trim();
const SERVER = process.env.EXPO_PUBLIC_BACK4APP_SERVER_URL || 'https://parseapi.back4app.com';
const USER_KEY = 'weather.user.v1';

export const isConfigured = Boolean(APP_ID && KEY);

export const DEFAULT_ALERT_PREFS = {
  enabled: true,
  rain: true, // rain chance >= 60% in the next 12 hours
  freeze: true, // low <= 32°F
  heat: true, // high >= 90°F
  wind: true, // gusts >= 40 mph
  official: true, // National Weather Service warnings/watches (US)
};

// --- Session --------------------------------------------------------------

let currentUser = null; // { objectId, username, email, sessionToken, alertPrefs }

export const getUser = () => currentUser;

async function setUser(u) {
  currentUser = {
    objectId: u.objectId,
    username: u.username,
    email: u.email || '',
    sessionToken: u.sessionToken,
    alertPrefs: { ...DEFAULT_ALERT_PREFS, ...(u.alertPrefs || {}) },
  };
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(currentUser));
  return currentUser;
}

async function clearUser() {
  currentUser = null;
  await AsyncStorage.removeItem(USER_KEY);
}

export async function restoreUser() {
  const raw = await AsyncStorage.getItem(USER_KEY);
  currentUser = raw ? JSON.parse(raw) : null;
  if (!currentUser) return null;
  try {
    const me = await api('GET', '/users/me'); // throws if the session expired
    return setUser({ ...me, sessionToken: currentUser.sessionToken });
  } catch {
    await clearUser();
    return null;
  }
}

// --- REST helper ----------------------------------------------------------

async function api(method, path, body) {
  if (!isConfigured) throw new Error('Add your Back4App keys to .env, then restart Expo with --clear.');
  // Parse Server accepts the request if any client key header matches.
  const headers = {
    'X-Parse-Application-Id': APP_ID,
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
  const json = await res.json().catch(() => ({}));
  if (json.error === 'unauthorized') {
    throw new Error('Back4App rejected the App ID or key. Check .env, then restart with --clear.');
  }
  if (json.code === 209 && currentUser) await clearUser(); // invalid session
  if (!res.ok) throw new Error(json.error || `Back4App error ${res.status}`);
  return json;
}

export const callFunction = async (name, params = {}) =>
  (await api('POST', `/functions/${name}`, params)).result;

// --- Auth -----------------------------------------------------------------

export async function signUp(username, password, email) {
  const body = { username, password, alertPrefs: DEFAULT_ALERT_PREFS };
  if (email) body.email = email;
  const res = await api('POST', '/users', body);
  return setUser({ ...body, ...res });
}

export async function logIn(username, password) {
  return setUser(await api('POST', '/login', { username, password }));
}

export async function logOut() {
  try {
    await api('POST', '/logout');
  } finally {
    await clearUser();
  }
}

export async function saveAlertPrefs(alertPrefs) {
  await api('PUT', `/users/${currentUser.objectId}`, { alertPrefs });
  return setUser({ ...currentUser, alertPrefs });
}

// --- Saved cities (WeatherLocation class, private to each user) ------------

const ownerPointer = () => ({ __type: 'Pointer', className: '_User', objectId: currentUser.objectId });

export async function listLocations() {
  const where = encodeURIComponent(JSON.stringify({ owner: ownerPointer() }));
  const { results } = await api('GET', `/classes/WeatherLocation?where=${where}&order=createdAt&limit=50`);
  return results;
}

export async function addLocation({ name, region, country, latitude, longitude, timezone }) {
  const data = {
    name,
    region: region || '',
    country: country || '',
    latitude,
    longitude,
    timezone: timezone || 'auto',
    owner: ownerPointer(),
    ACL: { [currentUser.objectId]: { read: true, write: true } },
  };
  const created = await api('POST', '/classes/WeatherLocation', data);
  return { ...data, objectId: created.objectId };
}

export const deleteLocation = (objectId) => api('DELETE', `/classes/WeatherLocation/${objectId}`);

// --- Push + alerts (see cloud/main.js) -------------------------------------

export const registerPushDevice = (token, platform, deviceName) =>
  callFunction('registerPushDevice', { token, platform, deviceName });
export const unregisterPushDevice = (token) => callFunction('unregisterPushDevice', { token });
export const checkMyWeatherAlerts = (force = false) => callFunction('checkMyWeatherAlerts', { force });
export const getNotificationHistory = (limit = 20) => callFunction('getNotificationHistory', { limit });
