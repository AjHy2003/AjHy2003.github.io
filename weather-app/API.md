# WX Radio — APIs used

WX Radio uses **3 public weather APIs**, **the Back4App API** (including our own Cloud Function API) and **the Expo Push API**.

| # | API | Used for | Auth | Code |
|---|---|---|---|---|
| 1 | Open-Meteo Forecast | Current, hourly, 7-day weather | none (free) | `src/weather.js` → `getForecast()`; `cloud/main.js` → `fetchForecast()` |
| 2 | Open-Meteo Geocoding | City search | none (free) | `src/weather.js` → `searchCities()` |
| 3 | National Weather Service (NWS) | Official alerts/warnings (US) | none (needs a User-Agent) | `src/weather.js` → `getOfficialAlerts()`; `cloud/main.js` → `fetchOfficialAlerts()` |
| 4 | Back4App (Parse) REST API | Sign up, login, saved cities, alert prefs | App ID + JavaScript Key (+ session token) | `src/back4app.js` |
| 5 | Back4App Cloud Functions (our API) | Push devices, weather alerts, test alert, history | same | `cloud/main.js` |
| 6 | Expo Push API | Deliver notifications to iPhone/Android | none (Expo Push Token) | `cloud/main.js` → `deliver()` |
| 7 | Expo Push Receipts API | Confirm Apple (APNs) / Google (FCM) delivered each notification | none (ticket ids) | `cloud/main.js` → `fetchReceipts()`, `getPushReceipts` |

---

## 1. Open-Meteo Forecast API
`GET https://api.open-meteo.com/v1/forecast`

Example request (Newark, NJ):
```
https://api.open-meteo.com/v1/forecast?latitude=40.7357&longitude=-74.1724
  &current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day,precipitation
  &hourly=temperature_2m,precipitation_probability,weather_code,wind_gusts_10m,is_day
  &daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset,uv_index_max
  &temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=auto&forecast_days=7
```
Response (shortened):
```json
{
  "current": { "time": "2026-10-22T13:15", "temperature_2m": 54.2, "apparent_temperature": 51,
               "relative_humidity_2m": 68, "weather_code": 2, "wind_speed_10m": 12 },
  "hourly":  { "time": ["2026-10-22T13:00", "..."], "temperature_2m": [54, "..."], "precipitation_probability": [10, "..."] },
  "daily":   { "time": ["2026-10-22", "..."], "temperature_2m_max": [61, "..."], "temperature_2m_min": [47, "..."] }
}
```
`weather_code` is a WMO code, which `describe()` in `src/weather.js` turns into "Partly cloudy", "Rain" and so on.

## 2. Open-Meteo Geocoding API
`GET https://geocoding-api.open-meteo.com/v1/search?name=Newark&count=8&language=en&format=json`
```json
{ "results": [ { "id": 5101798, "name": "Newark", "admin1": "New Jersey", "country_code": "US",
                 "latitude": 40.73566, "longitude": -74.17237, "timezone": "America/New_York" } ] }
```

## 3. National Weather Service — active alerts
`GET https://api.weather.gov/alerts/active?point=40.7357,-74.1724`
Headers: `User-Agent: WeatherAlertsMidterm (github.com/AjHy2003)`, `Accept: application/geo+json`
```json
{ "features": [ { "properties": {
    "id": "urn:oid:2.49.0.1.840.0....", "event": "Wind Advisory", "severity": "Moderate",
    "headline": "Wind Advisory issued October 22 at 9:15AM EDT until October 22 at 8:00PM EDT" } } ] }
```
Alerts with severity **Moderate, Severe or Extreme** become push notifications.

## 4. Back4App REST API
Base URL `https://parseapi.back4app.com`. Every request sends:
```
X-Parse-Application-Id: <Application ID>
X-Parse-Javascript-Key: <JavaScript Key>
X-Parse-Session-Token: <token>     (after login)
Content-Type: application/json
```
| Action | Request |
|---|---|
| Sign up | `POST /users` `{"username","password","email","alertPrefs"}` → `{"objectId","sessionToken"}` |
| Log in | `POST /login` `{"username","password"}` → user + `sessionToken` |
| Current user | `GET /users/me` |
| Log out | `POST /logout` |
| Save alert settings | `PUT /users/<objectId>` `{"alertPrefs":{"enabled":true,"rain":true,...}}` |
| List my cities | `GET /classes/WeatherLocation?where={"owner":{"__type":"Pointer","className":"_User","objectId":"<id>"}}` |
| Add a city | `POST /classes/WeatherLocation` `{"name","region","latitude","longitude","owner","ACL"}` |
| Remove a city | `DELETE /classes/WeatherLocation/<objectId>` |

## 5. Our API — Back4App Cloud Functions (`cloud/main.js`)
Called with `POST https://parseapi.back4app.com/functions/<name>`, using the same headers.

| Function | Body | Returns |
|---|---|---|
| `registerPushDevice` | `{"token":"ExponentPushToken[...]","platform":"ios","deviceName":"iPhone"}` | `{"objectId"}` |
| `unregisterPushDevice` | `{"token"}` | `{"removed":1}` |
| `checkMyWeatherAlerts` | `{"force":false}` | `{"locations":1,"found":[{"title":"🌧️ Rain likely in Newark",...}],"sent":1,"skipped":0}` |
| `sendTestWeatherAlert` | `{}` | `{"sent":1,"failed":[],"notificationId":"..."}` |
| `getPushReceipts` | `{"notificationId":"..."}` | `{"receiptStatus":"delivered","delivered":1,"pending":0,"errors":[]}` |
| `getNotificationHistory` | `{"limit":20}` | `[{"title","message","status","createdAt",...}]` |
| `sendPushNotification` | `{"title","message"}` | `{"sent","failed"}` (own devices) |
| `broadcastPushNotification` *(admin)* | `{"title","message","username?"}` | `{"sent","failed"}` (everyone or one user) |
| **Job** `weatherAlerts` | (scheduled hourly) | checks every user's cities and sends alerts |

Try it from PowerShell (after logging in, use your session token):
```powershell
$h = @{ "X-Parse-Application-Id"="<APP_ID>"; "X-Parse-Javascript-Key"="<JS_KEY>"; "X-Parse-Session-Token"="<SESSION>"; "Content-Type"="application/json" }
Invoke-RestMethod -Method Post https://parseapi.back4app.com/functions/sendTestWeatherAlert -Headers $h -Body "{}"
```

## 6. Expo Push API
`POST https://exp.host/--/api/v2/push/send` (sent by Cloud Code, never by the phone)
```json
[ { "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", "title": "🌧️ Rain likely in Newark",
    "subtitle": "WX Radio · Newark", "priority": "high", "channelId": "default",
    "body": "85% chance of rain around 4 PM. Grab an umbrella!", "sound": "default",
    "data": { "type": "weather", "alert": "rain" } } ]
```
Response: `{ "data": [ { "status": "ok", "id": "..." } ] }`. Tokens that come back as `DeviceNotRegistered` are deleted from `PushDevice`.

## 7. Expo Push Receipts API
`POST https://exp.host/--/api/v2/push/getReceipts` (from Cloud Code, a few seconds after sending)

The send call above only says Expo **accepted** the message. The receipt says whether **Apple (APNs) / Google (FCM) delivered** it.
```json
{ "ids": ["XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX"] }
```
Response:
```json
{ "data": { "XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX": { "status": "ok" } } }
```
or, on failure:
```json
{ "data": { "XXXXXXXX-...": { "status": "error", "message": "...", "details": { "error": "DeviceNotRegistered" } } } }
```
Our Cloud Function `getPushReceipts` saves the result on the `Notification` row (`receiptStatus`: delivered / error / pending, plus `receiptErrors`). The app's **Test Alert** button and `wx-broadcast.html` check it automatically about 5 seconds after sending.

| Receipt error | Meaning / fix |
|---|---|
| `DeviceNotRegistered` | The app was removed or the token changed. Sign off and sign back on. |
| `InvalidCredentials` | APNs/FCM keys in EAS are missing or wrong. Run `npx eas-cli@latest credentials`. |
| `MessageTooBig` | The payload is over 4 KB. |
| `MessageRateExceeded` | Too many messages to one device. Slow down. |
