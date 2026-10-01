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
- **Saved**: decks are stored in **Back4App** (or on the device if no keys are set).

Card data comes from the free [YGOPRODeck API](https://ygoprodeck.com/api-guide/).

## Run it
```bash
cd yugioh-deck-builder
npm install
npx expo start
```
Scan the QR code with the **Expo Go** app on your phone.

## Connect Back4App
1. Create an app at [back4app.com](https://www.back4app.com/).
2. Open **App Settings → Security & Keys** and copy the **Application ID** and **REST API Key**.
3. `cp .env.example .env` and paste the keys in.
4. Restart `npx expo start`. The app creates a `Deck` class the first time you save.

The app uses Back4App's REST API with `fetch` rather than the Parse JS SDK, because the SDK depends on Node's `crypto`, which doesn't bundle in Expo Go.

> Note: `EXPO_PUBLIC_*` variables are bundled into the app, and anyone with the keys can read and write the `Deck` class. That's fine for a personal app. For a public app, add Parse user login and per-user ACLs.

## Code layout
- `App.js`: the UI (4 tabs)
- `src/api.js`: YGOPRODeck API client
- `src/optimizer.js`: card scoring, deck optimizer and probability analysis
- `src/back4app.js`: Back4App REST storage, with an AsyncStorage fallback
