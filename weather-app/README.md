# WX Radio — retro radio weather app (Expo + Back4App)

A weather app themed like a 1940s weather-station radio, with logins and push weather alerts sent from Back4App. Full write-up: **[DOCUMENTATION.md](DOCUMENTATION.md)**. APIs: **[API.md](API.md)**. Design files: **[design/](design/)**.

## Run it (Windows PowerShell)

```powershell
cd C:\Users\andre\AjHy2003.github.io
git pull
cd weather-app
npm install
Copy-Item ..\yugioh-deck-builder\.env .env      # same Back4App keys as before
npx expo start --go --tunnel --clear            # or: npm run tunnel
```
Scan the QR code with the iPhone Camera app. It opens in Expo Go.

> Always run Expo from inside `weather-app`, or you'll get "package.json does not exist".
> If the `ENOENT ... codesigning` error appears: `New-Item -ItemType Directory -Force ~\.expo\codesigning\e2a05207-aea2-40e1-a62b-8dc410f5bbc0`

## Back4App setup (one time)
1. **Cloud Code:** Back4App → Basic App → Cloud Code → `cloud/main.js`. Replace everything with this project's [`cloud/main.js`](cloud/main.js) and click **Deploy**.
   It contains everything (the Yu-Gi-Oh! app and `push.html` keep working).
   Copy it to the clipboard: `Get-Content .\cloud\main.js -Raw | Set-Clipboard`
2. **Schedule the alert job:** Back4App → **Server Settings → Background Jobs** (or **Cloud Code → Jobs**) → **Schedule a job** → pick `weatherAlerts` → repeat **every 1 hour**.
3. Tables are created automatically the first time they're used: `WeatherLocation`, `WeatherAlertSent`, `Notification`.

## Send alerts from a web page
Open **[`wx-broadcast.html`](../wx-broadcast.html)**, the WX Radio Broadcast Desk (in the repo root).
After merging the pull request, it's also live at **https://ajhy2003.github.io/wx-broadcast.html**.
- Log in with your app account, then use the **Quick bulletins** (Rain, Freeze, Heat, Wind, Storm, Snow, Fog, All clear) or **Random weather alert**, and press **Send**.
- Send to: my devices / everyone / one user (the last two are admin only: `ADMIN_USERNAMES` in `cloud/main.js`).
- Every send is saved in Back4App → `Notification` and listed under **Sent notifications**.

## Midterm submission checklist
- [ ] **Video of the app working** (screen-record on the iPhone): sign up → add a city → Now / 7-Day → Alerts → **Test Alert** → the notification arrives → send a **Random weather alert** from `wx-broadcast.html` → it arrives
- [ ] **App documentation:** `DOCUMENTATION.md` + `API.md`
- [ ] **Design files:** the Claude Design link plus the `design/` folder
- [ ] **Back4App screenshots:**
  - Database → `_User` (your sign-ups)
  - Database → `PushDevice` (phone tokens)
  - Database → `Notification` (sent weather alerts)
  - Database → `WeatherLocation` (saved cities)
  - Cloud Code (`main.js`) and the scheduled `weatherAlerts` job

## Notes
- `app.json` reuses the existing EAS project (`projectId e2a05207…`, slug `yugioh-deck-builder`), so push works without new Expo setup. For a separate EAS project, change the slug and run `npx eas-cli@latest init`.
- iPhone push works in Expo Go. Android push needs a development build (`npx eas-cli@latest build --profile development --platform android`), plus `google-services.json` and the FCM key as set up before.
