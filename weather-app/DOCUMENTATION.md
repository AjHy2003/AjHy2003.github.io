# WX Radio — App Documentation

*Web App Development for Mobile — Midterm. The app spec I gave Claude, plus how the finished app works.*

Also included: **[PROMPTS.md](PROMPTS.md)** (every prompt I sent Claude) and **[API.md](API.md)** (the API reference).

## 1. The brief I gave Claude

> Build a **full Expo app** that is a **weather app** with a **unique theme** designed in **Claude Design** (not the default weather look).
> It must have **logins and sign-ups**, and **push notifications for weather alerts sent from the backend using Back4App**.
> Reuse the Back4App app, Expo account and push setup from my earlier project.

**Theme chosen:** *Retro radio / weather-station dashboard.* A 1940s tabletop radio with a walnut cabinet, cream dial face and brass trim. The temperature is an analog gauge with a needle, saved cities are radio "stations" and "presets", and alerts arrive as an "Emergency Broadcast" on red ticker tape.

## 2. Features

| Screen | What it does |
|---|---|
| **Sign On** | Log in, or create an account ("New Listener") with a username, password and optional email. Accounts are stored in Back4App's `_User` table. |
| **Now** | Analog temperature gauge, current conditions, feels-like / humidity / wind readouts, a bulletin bar (official NWS alert or rain warning), and a scrollable 12-hour "tuning band". Pull down to refresh. |
| **7-Day** | Daily forecast: conditions, rain chance, wind gusts, high/low, plus sunrise/sunset and UV index. |
| **Stations** | Search any city (Open-Meteo geocoding), add it as a preset, or **Use my location** (GPS). Tap to tune in; long-press to remove. Saved per user in Back4App. |
| **Alerts** | Inbox of every notification received on the phone (tap one, or tap a banner, to read the full message). Toggles for which alerts you want (master switch, rain, freezing, heat, wind, official NWS warnings), saved to your Back4App user. **Check Now** runs the backend alert check, and **Test Alert** sends a sample push. Also shows a broadcast log of every notification sent, and lets you sign off. |

## 3. How push weather alerts work (backend)

```
Phone (Expo app)                        Back4App (Parse Server + Cloud Code)                 Outside services
──────────────────                      ─────────────────────────────────────               ────────────────
1. Sign on  ───────────────────────────▶ _User (session token)
2. Get Expo Push Token ─ registerPushDevice ─▶ PushDevice {token, user}
3. Add a city ─────────────────────────▶ WeatherLocation {name, lat, lon, owner}
4. Toggle alert prefs ─────────────────▶ _User.alertPrefs
                                         5. Job "weatherAlerts" (scheduled, e.g. hourly)
                                            or "Check Now" → checkMyWeatherAlerts
                                              ├─ forecast for each city ───────────────▶ Open-Meteo API
                                              ├─ official alerts ──────────────────────▶ api.weather.gov (NWS)
                                              ├─ rules: rain ≥60%, low ≤32°F,
                                              │         high ≥90°F, gusts ≥40 mph, NWS warning
                                              ├─ skip alerts already sent (WeatherAlertSent)
                                              ├─ send push ────────────────────────────▶ Expo Push API → APNs / FCM
                                              └─ save record → Notification
6. Notification arrives on the phone ◀──────────────────────────────────────────────────
```

### Back4App classes
| Class | Fields | Who can read it |
|---|---|---|
| `_User` | username, password (hashed), email, `alertPrefs` | the user |
| `WeatherLocation` | name, region, country, latitude, longitude, owner | owner only (ACL) |
| `PushDevice` | token, platform, deviceName, user | Cloud Code only |
| `WeatherAlertSent` | user, location, key (for example `rain:2026-10-22`) | Cloud Code only |
| `Notification` | title, message, sender, target, devices, sent, status | sender; admins via Cloud Code |

### Cloud Code (`cloud/main.js`)
| Function / job | Purpose |
|---|---|
| `registerPushDevice`, `unregisterPushDevice` | Save or remove this phone's Expo Push Token |
| `checkMyWeatherAlerts({ force })` | Check the logged-in user's cities now and push any alerts |
| `sendTestWeatherAlert` | Push the current temperature for the first city (demo) |
| **job `weatherAlerts`** | Scheduled check for **every** user, which sends the alerts automatically |
| `sendPushNotification`, `broadcastPushNotification` | Manual sends (used by `push.html`, the admin web sender) |
| `getPushReceipts` | Checks with the Expo Push Receipts API that Apple/Google delivered a notification |
| `getNotificationHistory` | Broadcast log |

## 4. APIs used
- **Open-Meteo** forecast and geocoding: free, no API key
- **National Weather Service** active alerts (`api.weather.gov`): free, no key, US locations only
- **Back4App REST API**: auth, data and Cloud Functions
- **Expo Push API**: delivery to iPhone (APNs) and Android (FCM)
- **Expo Push Receipts API**: confirms Apple/Google actually delivered each notification

## 5. Tech
Expo SDK 57 (React Native 0.86), `expo-notifications`, `expo-location`, `expo-font` with the Google Fonts Righteous, Barlow Condensed and Courier Prime, and `react-native-svg` for the gauge. Back4App is called through its REST API with `fetch`, because the Parse JS SDK doesn't bundle in Expo Go.

## 6. Design
Made in **Claude Design**. The files are in [`design/`](design/): `Main`, `Forecast`, `Stations`, `Alerts`, `SignOn` and `StyleGuide` (`.dc.html`) plus `canvas.json`.

| Token | Hex | Use |
|---|---|---|
| Walnut | `#3b2416` | cabinet background |
| Bakelite | `#1c1714` | readouts, nav |
| Dial cream | `#f3e6c8` | panels |
| Brass | `#c9a24a` | trim, selected tab |
| Tube amber | `#f2a93b` | readout numbers |
| Signal red | `#c8402a` | alerts, main buttons |
| Cold steel | `#2f5d73` | lows, rain |
