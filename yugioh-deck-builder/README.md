# Yu-Gi-Oh! Deck Optimizer (Expo + Back4App)

An Expo app that builds and optimizes Yu-Gi-Oh! decks. It runs in **Expo Go** with no native build needed.

## Features
- **Optimize**: type an archetype (with autocomplete) and get a legal 40-card Main Deck plus a 15-card Extra Deck.
  - Scores cards by role: starters (searchers or deck summoners), extenders, interruptions, hand traps, and bricks.
  - Follows the current TCG banlist (Forbidden / Limited / Semi-Limited).
  - Fills spare slots with the best generic staples (Ash Blossom, Maxx "C", Called by the Grave…).
  - Hill-climbs the ratios to raise the odds of opening a starter (hypergeometric math).
- **Deck**: edit card counts and see stats, starter odds and legality warnings.
- **Search**: look up any card by name and add it.
- **Saved**: decks are stored in **Back4App** per user (or on the device when logged out).
- **Account**: log in or sign up with Back4App. The app registers the phone for **push notifications**, and you can send yourself a test notification.

Card data comes from the free [YGOPRODeck API](https://ygoprodeck.com/api-guide/).

## Run it
```bash
cd yugioh-deck-builder
npm install
npm run start:go     # Expo Go (same Wi-Fi)
npm run tunnel       # Expo Go over a tunnel (school/campus Wi-Fi)
# or: npx expo start  (development build, needed for Android push; see below)
```
Scan the QR code with your phone.

## Connect Back4App
1. Create an app at [back4app.com](https://www.back4app.com/).
2. Open **App Settings → Security & Keys** and copy the **Application ID** and the **JavaScript Key** (the REST API Key also works).
3. `cp .env.example .env` and paste the keys in.
4. Restart Expo. The app creates the `Deck` class the first time you save.

The app uses Back4App's REST API with `fetch` rather than the Parse JS SDK, because the SDK depends on Node's `crypto`, which doesn't bundle in Expo Go.

> Note: `EXPO_PUBLIC_*` variables are bundled into the app, so treat them as public. Decks saved while logged in are private to that user (ACL), and `PushDevice` rows are only accessible through Cloud Code.

## Push notifications (Expo → Back4App)

How it works: **log in → app gets its Expo Push Token → token is saved in Back4App's `PushDevice` class → a Cloud Function sends it through the Expo Push API → notification shows up on the phone.**

### 1. Deploy the Cloud Code
In Back4App, open **Cloud Code**, replace `cloud/main.js` with [`cloud/main.js`](cloud/main.js), and click **Deploy**. It defines:

| Function | What it does |
|---|---|
| `registerPushDevice({ token, platform, deviceName })` | Saves or updates this device's token in `PushDevice`, linked to the logged-in user |
| `unregisterPushDevice({ token })` | Removes the device (called on logout) |
| `sendPushNotification({ token?, userId?, title, message, data? })` | Sends through `https://exp.host/--/api/v2/push/send` |

`sendPushNotification` targets:
- `token`: that one device.
- No `token`: all of the caller's devices.
- `userId`: all of that user's devices (master key only).

Regular users can only notify their own devices. Tokens for uninstalled apps are deleted automatically.

To test from your computer with the master key:
```bash
curl -X POST https://parseapi.back4app.com/functions/sendPushNotification \
  -H "X-Parse-Application-Id: YOUR_APP_ID" -H "X-Parse-Master-Key: YOUR_MASTER_KEY" \
  -H "Content-Type: application/json" \
  -d '{"token":"ExponentPushToken[...]","title":"Hello","message":"From Back4App"}'
```
Never put the master key in the app.

### 2. Link an Expo (EAS) project
```bash
npx eas-cli@latest login
npx eas-cli@latest init      # adds extra.eas.projectId to app.json (needed for push tokens)
```

### 3. Set up Apple and Android push credentials
- **Android (FCM):** create a Firebase project and add an Android app with package `com.ajhy2003.ygodeckoptimizer`. Download `google-services.json`, put it in this folder, and add `"googleServicesFile": "./google-services.json"` under `android` in `app.json`. Then upload an FCM V1 service-account key with `npx eas-cli@latest credentials` (Android → Push Notifications) or in the expo.dev dashboard.
- **iOS (APNs):** needs a paid Apple Developer account. `npx eas-cli@latest build --profile development --platform ios` offers to create the push key for you.

### 4. Build a development build and test on a real phone
Expo Go **can't receive push notifications on Android** (removed in SDK 53), so install a development build:
```bash
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start
```
Install the build on your phone and open the project. Then go to **Account → log in**. Your token appears under Push notifications and in Back4App's `PushDevice` class. Tap **Send Test Notification** and it arrives on the phone.

Everything else (deck builder, saving, login) still works in plain Expo Go (`npm run start:go`). Only the push token step needs the dev build.

## Code layout
- `App.js`: the UI (4 tabs)
- `src/api.js`: YGOPRODeck API client
- `src/optimizer.js`: card scoring, deck optimizer and probability analysis
- `src/back4app.js`: Back4App REST calls (auth, decks, cloud functions), with an AsyncStorage fallback
- `src/notifications.js`: permissions, Android channel and Expo Push Token
- `cloud/main.js`: Back4App Cloud Code for push notifications
