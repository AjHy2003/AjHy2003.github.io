# PickLab

A free, installable web app for researching player props, spreads and totals.

**What it does**

- **Player props** (NBA, WNBA, NFL, college, MLB, NHL, soccer): game logs, hit rates (L5/L10/L20/season/vs opponent/home-away), splits, rest days, a projection and an over/under probability graded against the sportsbook price. DraftKings prop lines load automatically when ESPN has them.
- **Game lines**: projected score, spread/total/moneyline probabilities blended with the market, team comparison, recent form, injuries, head-to-head, plus a one-click scan of every posted player prop in the game, sorted by edge.
- **NFL advanced** (nflverse + Next Gen Stats): targets, target share, aDOT, separation, cushion, catches by depth (5+/10+/20+ air yards), YAC over expected, QB designed runs vs scrambles, and opponent defense vs pass/run with ranks and production allowed by position.
- **NBA advanced** (computed from box scores): usage %, rebound %, rebound chances, team and opponent missed shots, assist %, pace, ratings and defense vs position.
- **Racing** (F1, NASCAR, IndyCar): 5,000-race simulation for win / top 3 / top 5 / top 10 / head-to-head using form, track history and the qualifying grid.
- **Golf, tennis, UFC**: tournament/fight cards, golfer finish history with top-N, make-cut and round-score pricing, and no-vig fair odds.
- **Anything else** (boxing, cricket, swimming, darts…): custom calculator — paste recent results and a line.
- **Saved picks** with automatic grading and a running record / units / ROI by grade.

Projections are estimates from past data. No model guarantees a result.

## How it runs

- The site is static (plain HTML/CSS/JS, no build step) and calls ESPN's public JSON directly from the browser for live scores, game logs and odds.
- `pipeline/` (Python) builds the advanced data. `.github/workflows/deploy.yml` runs it twice a day (≈5am and noon ET) and on every push to `main`, then publishes the site plus `data/` to GitHub Pages. Nothing is committed back to the repo.

## One-time setup

1. **Settings → Pages → Build and deployment → Source: GitHub Actions.**
2. **Actions → Build data and deploy site → Run workflow** (or push to `main`).
3. Open `https://<your-username>.github.io/sports-picks/`. On a phone, use *Add to Home Screen* to install it like an app.

## Local development

```bash
python -m http.server 8000          # serve the site
python pipeline/build.py --out data --cache cache --only nfl   # optional: build advanced data locally
```

## Data sources

ESPN public APIs, [nflverse](https://github.com/nflverse/nflverse-data) (play-by-play, Next Gen Stats), [Jolpica-F1](https://github.com/jolpica/jolpica-f1), NASCAR's public results feed.
