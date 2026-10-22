# Prompt log — what I asked Claude

All the prompts I sent Claude (Claude Code) while building this project, in order, copied as I typed them.
Screenshots and pasted errors are described in *[brackets]*. **Keys, passwords and private files are redacted.**

- **Part 1** is the midterm weather app (WX Radio).
- **Part 2** is the earlier session where we built the Expo + Back4App login and push-notification setup that WX Radio reuses.

---

## Part 1 — Midterm: WX Radio weather app

| # | My prompt | What Claude did |
|---|---|---|
| 1 | for our midterm we have to make an app with api the push notifications and so on wanna do the yu gi deck or pokemon deck app if thats okay | Suggested keeping the Yu-Gi-Oh! app and asked for the rubric |
| 2 | hopefully we dont have to make a whole new one i was one of the only students to get this working | Listed what was already done and asked for the assignment details |
| 3 | *[Screenshot of the Canvas midterm assignment: video of the app working, app documentation given to Claude, design files, Back4App screenshots of user logins and push notifications; weather app made with Claude Design and a unique theme; must use logins and sign-ups; must use push notifications for weather alerts from the backend using Back4App; must be a full Expo app]* | Explained the midterm has to be a weather app. Planned to reuse the Back4App login and push backend, and asked which theme |
| 4 | let's do this when i come back since it's due tomorrow | Listed what to have ready and offered to start on the backend |
| 5 | okay lets do it | Built the weather backend (Cloud Code alert rules, scheduled job) and asked for the theme |
| 6 | *Theme picked:* **Retro radio / dashboard** | Made the design in **Claude Design** (6 screens + style guide), then built the Expo app to match: login/sign-up, Now gauge, 7-Day, Stations, Alerts |
| 7 | I need apis as well | Wrote `API.md` documenting every API (Open-Meteo, NWS, Back4App REST, our Cloud Functions, Expo Push) |
| 8 | we need the test notifications should and the html that i can do random notifications should i do another app build and build with ai or no | Confirmed no new build was needed. Made `wx-broadcast.html` (weather presets + random alert generator) |
| 9 | when doing the test notifiactions in the app It said invalid test notifications | Explained that the new Cloud Code wasn't deployed yet and gave the steps |
| 10 | whats the stuff i have to paste | Sent the full `cloud/main.js` file to paste into Back4App |
| 11 | I think i need what prompts I sent you along with the documentation | Wrote this prompt log |

---

## Part 2 — Earlier session: Expo + Back4App + push notifications setup

| # | My prompt | What Claude did |
|---|---|---|
| 1 | Can you make me a standard expo app that uses back4end expo go dev you can even code it on github make it make it a yugioh deck builder app that optimizes the best deck building or if its easier you can use an anime generator app that allows me to generate shows based off my interest whatever is easier you can use clis if you want | Created the Expo app (Yu-Gi-Oh! deck optimizer) with Back4App storage and pushed it to GitHub |
| 2 | does this have notifications and what not | Explained the notification options |
| 3 | *[Screenshot of the class slide: 1) add expo-notifications and get the Expo Push Token, 2) save the token in a Back4App `PushDevice` class, 3) create a Cloud Code function that sends to the Expo Push API, 4) set up Apple/Android credentials in Expo/EAS, 5) test on a real phone]* | Built all of it: login, `PushDevice`, the `sendPushNotification` Cloud Function, EAS config |
| 4 | whats left | Listed the remaining setup steps |
| 5 | *[Back4App keys — redacted]* | Added support for the JavaScript Key |
| 6 | *[PowerShell error: cannot find path `yugioh-deck-builder`]* | Showed how to clone the repo on Windows |
| 7 | what about step 2 3 4 and 5 | Gave step-by-step Back4App, EAS, Firebase and build instructions |
| 8 | what code to open cloud main.js | Gave the PowerShell commands to open or copy the file |
| 9 | *[Pasted the Cloud Code to confirm]* | Confirmed and gave the deploy steps |
| 10 | it deployed whats next | Explained the EAS login and init |
| 11 | *[Output showing the EAS projectId]* | Explained Firebase setup for Android |
| 12 | *[Screenshot of the Firebase console]* | Walked through adding the Android app |
| 13 | i have both files | Explained uploading the FCM V1 key to EAS |
| 14 | does it also have apple | Explained that iPhone push works in Expo Go |
| 15 | *[Screenshot: EAS credentials menu on FCM Legacy]* | Pointed to the correct FCM V1 option |
| 16 | *[Screenshot: EAS asking for the key file path]* | Explained how to copy the file path |
| 17 | *[Uploaded the Firebase service-account key — redacted]* | Gave the path and recommended rotating the key |
| 18 | its fine keep going i got it | Gave the Android build steps |
| 19 | okay now iphone | Gave the Expo Go iPhone steps |
| 20 | did you create a login and everything | Described the login features |
| 21 | *[Error: ENOENT … .expo\codesigning …]* | Gave a fix for the Windows Expo bug |
| 22 | *[Error: Remove-Item cannot find path …]* | Had me create the missing folder |
| 23 | *[PowerShell output: folder created]* | Next steps |
| 24 | need to be logged into my expo account | Showed how to stay logged in (offline mode workaround) |
| 25 | is it supposed to be launched in browser | Explained it runs in Expo Go on the phone |
| 26 | its running 10.62 on chrome | Explained the tunnel for campus Wi-Fi |
| 27 | *[Screenshot: Expo Go "signed in to Expo Go but not Expo CLI"]* | Showed how to log in to the Expo CLI |
| 28 | you have to use tunnel | Gave the tunnel commands and added an `npm run tunnel` script |
| 29 | *[Screenshot of the app login screen]* Logged in but can't login | Explained the app account is separate from the Expo account |
| 30 | It said error unauthorized | Made the app send the key under every header name |
| 31 | *[.env contents — redacted]* | Troubleshooting |
| 32 | it only allows me to click log in which gives me unathourized | Gave a PowerShell key test |
| 33 | *[Test output: 401 Unauthorized]* | More troubleshooting |
| 34 | still same issue | Asked for the error body |
| 35 | Status: 401 Body: {"error":"unauthorized"} | Pointed to where the keys are in the dashboard |
| 36 | *[Screenshot: Back4App API console]* | Explained where to find the keys |
| 37 | its greyed out | Pointed to the other place |
| 38 | *[Screenshot: Back4App Connect page]* | Pointed to App Settings → Security & Keys |
| 39 | *[Screenshot: Security & Keys — redacted]* | Found the problem: the Client Key had been used as the Application ID |
| 40 | just paste it for me and give me everything | Wrote a script that found the right App ID and saved `.env` |
| 41 | *[Screenshot: logged in, "Invalid function: registerPushDevice"]* | Explained the Cloud Code wasn't deployed to that app |
| 42 | *[Pasted Back4App's default Cloud Code — contained a secret key, redacted]* | Explained what to replace it with |
| 43 | *[Pasted the Cloud Code into PowerShell by mistake]* | Explained it goes in the browser |
| 44 | what code | Pasted the full Cloud Code |
| 45 | *[Screenshot: "Parse.Cloud.httpRequest is not a function"]* | Fixed the Cloud Code to use `fetch` (newer Parse Server) |
| 46 | how about android | Gave the Android development build steps |
| 47 | I wanna make a webpage that i can type in that can send to the app | Built `push.html` and the admin broadcast Cloud Function |
| 48 | *[Screenshot: push.html keys screen]* | Explained what to fill in |
| 49 | worked now last thing can you have every notifications sent saved on the bac4end app | Saved every send to the `Notification` class, with history on the page |
| 50 | *[ConfigError: package.json does not exist]* | Explained the correct folder |
| 51 | okay what should i paste in main.js | Pasted the latest Cloud Code |
| 52 | *[Same ConfigError again]* | Gave a single command that works from any folder |
| 53 | make a zip of this chat so i can import it into another chat please | Made a handoff zip with a summary and the code |
