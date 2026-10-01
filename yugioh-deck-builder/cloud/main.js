// Back4App Cloud Code. Upload this file in Back4App: Cloud Code -> cloud/main.js -> Deploy.
//
// PushDevice class: { token, platform, deviceName, user (Pointer<_User>) }
// Rows are only readable with the master key; the app goes through these functions.

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

// Usernames allowed to send notifications to other users (e.g. from push.html).
const ADMIN_USERNAMES = ['andrhenry449'];

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

const isAdmin = (request) =>
  request.master || Boolean(request.user && ADMIN_USERNAMES.includes(request.user.get('username')));

function requireAdmin(request) {
  requireUser(request);
  if (!isAdmin(request)) throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, 'Admins only.');
}

function requireContent({ title, message }) {
  if (!title && !message) throw new Parse.Error(Parse.Error.VALIDATION_ERROR, 'title or message is required.');
}

// Send one notification to many Expo Push Tokens and remove tokens of uninstalled apps.
async function deliver(tokens, { title, message, data }) {
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
}

/**
 * Send, then save a record of it in the Notification class (also when sending fails).
 * target: 'me' | 'device' | 'user' | 'all'
 */
async function sendAndLog(request, tokens, content, target, targetUsername) {
  const record = new Parse.Object('Notification');
  const acl = new Parse.ACL();
  if (request.user) acl.setReadAccess(request.user.id, true); // senders can read their own history
  record.setACL(acl);
  record.set({
    title: content.title || '',
    message: content.message || '',
    data: content.data || {},
    senderUsername: request.user ? request.user.get('username') : 'master key',
    target,
    targetUsername: targetUsername || '',
    devices: tokens.length,
  });
  if (request.user) record.set('sender', request.user);

  try {
    const result = await deliver(tokens, content);
    record.set({
      sent: result.sent,
      failedCount: result.failed.length,
      errors: result.failed,
      status: result.failed.length ? (result.sent ? 'partial' : 'failed') : 'sent',
    });
    await record.save(null, { useMasterKey: true });
    return { ...result, notificationId: record.id };
  } catch (e) {
    record.set({ sent: 0, failedCount: tokens.length, errors: [e.message], status: 'failed' });
    await record.save(null, { useMasterKey: true }).catch(() => {});
    throw e;
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
  requireContent(request.params);

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
  const target = token ? 'device' : userId ? 'user' : 'me';
  return sendAndLog(request, tokens, { title, message, data }, target, userId || '');
});

// Who am I and how many devices can I reach? Used by push.html.
Parse.Cloud.define('getPushInfo', async (request) => {
  requireUser(request);
  const admin = isAdmin(request);
  const mine = new Parse.Query('PushDevice');
  if (request.user) mine.equalTo('user', request.user);
  const info = { isAdmin: admin, myDevices: request.user ? await mine.count({ useMasterKey: true }) : 0 };
  if (admin) info.allDevices = await new Parse.Query('PushDevice').count({ useMasterKey: true });
  return info;
});

/**
 * Admin only: send to every registered device, or to one user by username.
 * Params: { title, message, data?, username? }
 */
Parse.Cloud.define('broadcastPushNotification', async (request) => {
  requireAdmin(request);
  const { title, message, data, username } = request.params;
  requireContent(request.params);

  const query = new Parse.Query('PushDevice').limit(10000);
  if (username) {
    const user = await new Parse.Query(Parse.User).equalTo('username', username).first({ useMasterKey: true });
    if (!user) throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `No user named "${username}".`);
    query.equalTo('user', user);
  }
  const devices = await query.find({ useMasterKey: true });
  return sendAndLog(
    request,
    devices.map((d) => d.get('token')),
    { title, message, data },
    username ? 'user' : 'all',
    username,
  );
});

/**
 * Sent-notification history, newest first. Admins see everything; others see their own.
 * Params: { limit? } (max 100)
 */
Parse.Cloud.define('getNotificationHistory', async (request) => {
  requireUser(request);
  const query = new Parse.Query('Notification').descending('createdAt');
  query.limit(Math.min(Number(request.params.limit) || 20, 100));
  if (!isAdmin(request)) query.equalTo('sender', request.user);
  const rows = await query.find({ useMasterKey: true });
  return rows.map((n) => ({
    id: n.id,
    title: n.get('title'),
    message: n.get('message'),
    senderUsername: n.get('senderUsername'),
    target: n.get('target'),
    targetUsername: n.get('targetUsername'),
    devices: n.get('devices'),
    sent: n.get('sent'),
    failedCount: n.get('failedCount'),
    status: n.get('status'),
    createdAt: n.createdAt,
  }));
});
