# Prompt log

The prompts I gave Claude (Claude Code + Claude Design) to build WX Radio, in order. Only the prompts that defined the app or its features are listed; small spelling fixes only.

## WX Radio (midterm)

| # | Prompt | Result |
|---|---|---|
| 1 | Build a weather app as a full Expo app. Use Claude Design for a unique theme (not the default weather look). It must use logins and sign-ups, and push notifications for weather alerts from the backend using Back4App. | Plan: Expo app + Back4App login and push backend + weather alert rules |
| 2 | Theme: **retro radio / dashboard** | Claude Design canvas: 5 phone screens (Now, 7-Day, Stations, Alerts, Sign On) + style guide; app built to match |
| 3 | I need APIs as well. | Open-Meteo forecast and geocoding, National Weather Service alerts, Back4App REST + Cloud Functions, Expo Push; documented in `API.md` |
| 4 | We need test notifications, and an HTML page where I can send random notifications. | **Test Alert** button in the app; `wx-broadcast.html` web sender with weather presets and a random alert generator |
| 5 | It does not send the full notification to my Apple device, let's fix that. I think we need an API for the notifications. | Expo Push Receipts API to confirm Apple delivered each alert; high-priority pushes with an iPhone subtitle; tap a notification to read the full message; in-app inbox |
| 6 | Turn the Claude Design and the documentation into a PDF. | `WX-Radio-Midterm.pdf` |

## Backend setup (reused by WX Radio)

These prompts built the Expo + Back4App login and push-notification backend that WX Radio runs on.

| # | Prompt | Result |
|---|---|---|
| 1 | Make a standard Expo app that uses Back4App with Expo Go dev. You can code it on GitHub and use CLIs. | Expo SDK 57 app on GitHub, Back4App via its REST API (works in Expo Go) |
| 2 | Push notifications (class steps): add `expo-notifications` and get the Expo Push Token for each device; save the token in a Back4App `PushDevice` class for each logged-in user; create a Back4App Cloud Code function that takes an Expo Push Token, title, message and optional data and sends it to the Expo Push API; set up Apple/Android push credentials in Expo/EAS; test on a real phone. | Login/sign-up, `PushDevice` class, `registerPushDevice` and `sendPushNotification` Cloud Functions, EAS + Firebase FCM V1 credentials |
| 3 | Make a webpage that I can type in that can send to the app. | Web sender page + admin-only `broadcastPushNotification` Cloud Function |
| 4 | Have every notification sent saved on the Back4App app. | `Notification` class logs every send (sender, target, delivered count, status) + `getNotificationHistory` |
