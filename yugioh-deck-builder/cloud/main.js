// Back4App Cloud Code. Upload this file in Back4App: Cloud Code -> cloud/main.js -> Deploy.
//
// PushDevice class: { token, platform, deviceName, user (Pointer<_User>) }
// Rows are only readable with the master key; the app goes through these functions.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

const isExpoToken = (t) => typeof t === 'string' && /^Expo(nent)?PushToken\[.+\]$/.test(t);

// POST JSON to a URL. Newer Parse Server versions removed Parse.Cloud.httpRequest,
// so use Node's built-in fetch, falling back to the old helper or the https module.
async function postJson(url, body) {
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (typeof fetch === 'function') {
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    return res.json();
  }
  if (Parse.Cloud.httpRequest) {
    const res = await Parse.Cloud.httpRequest({ method: 'POST', url, headers, body });
    return res.data;
  }
  const https = require('https');
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'POST', headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(raw));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

function requireUser(request) {
  if (!request.user && !request.master) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'You must be logged in.');
  }
}

// Save (or move) this device's Expo Push Token to the logged-in user.
Parse.Cloud.define('registerPushDevice', async (request) => {
  requireUser(request);
  const { token, platform, deviceName } = request.params;
  if (!isExpoToken(token)) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'Invalid Expo Push Token.');

  const query = new Parse.Query('PushDevice');
  query.equalTo('token', token);
  let device = await query.first({ useMasterKey: true });
  if (!device) {
    device = new Parse.Object('PushDevice');
    const acl = new Parse.ACL();
    acl.setPublicReadAccess(false);
    acl.setPublicWriteAccess(false);
    device.setACL(acl);
  }
  device.set({ token, platform, deviceName, user: request.user });
  await device.save(null, { useMasterKey: true });
  return { objectId: device.id };
});

// Remove this device (called on logout).
Parse.Cloud.define('unregisterPushDevice', async (request) => {
  requireUser(request);
  const query = new Parse.Query('PushDevice');
  query.equalTo('token', request.params.token);
  if (!request.master) query.equalTo('user', request.user);
  const devices = await query.find({ useMasterKey: true });
  await Parse.Object.destroyAll(devices, { useMasterKey: true });
  return { removed: devices.length };
});

/**
 * Send a push notification through the Expo Push API.
 * Params: { token?, userId?, title, message, data? }
 *  - token:  send to one Expo Push Token
 *  - userId: send to every device of that user (master key only)
 *  - neither: send to every device of the calling user
 * Regular users can only notify their own devices; the master key can notify anyone.
 */
Parse.Cloud.define('sendPushNotification', async (request) => {
  requireUser(request);
  const { token, userId, title, message, data } = request.params;
  if (!title && !message) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'title or message is required.');

  const query = new Parse.Query('PushDevice');
  if (token) query.equalTo('token', token);
  if (userId) {
    if (!request.master) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'userId needs the master key.');
    query.equalTo('user', Parse.User.createWithoutData(userId));
  } else if (!request.master) {
    query.equalTo('user', request.user);
  }
  const devices = await query.find({ useMasterKey: true });

  // The master key may also send to a raw token that was never registered.
  let tokens = devices.map((d) => d.get('token'));
  if (!tokens.length && token && request.master && isExpoToken(token)) tokens = [token];
  if (!tokens.length) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'No registered devices found.');

  const messages = tokens.map((to) => ({ to, title, body: message, data: data || {}, sound: 'default' }));
  const tickets = [];
  for (let i = 0; i < messages.length; i += 100) {
    const json = await postJson(EXPO_PUSH_URL, messages.slice(i, i + 100));
    if (!Array.isArray(json.data)) {
      const reason = (json.errors || []).map((e) => e.message).join('; ') || JSON.stringify(json);
      throw new Parse.Error(Parse.Error.SCRIPT_FAILED, `Expo Push API error: ${reason}`);
    }
    tickets.push(...json.data);
  }

  // Clean up tokens for uninstalled apps.
  const dead = tickets
    .map((t, i) => (t.details && t.details.error === 'DeviceNotRegistered' ? tokens[i] : null))
    .filter(Boolean);
  if (dead.length) {
    const stale = await new Parse.Query('PushDevice').containedIn('token', dead).find({ useMasterKey: true });
    await Parse.Object.destroyAll(stale, { useMasterKey: true });
  }

  return {
    sent: tickets.filter((t) => t.status === 'ok').length,
    failed: tickets.filter((t) => t.status === 'error').map((t) => t.message),
  };
});
