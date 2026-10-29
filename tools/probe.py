"""Probe sports data endpoints from a GitHub runner.

Records status, CORS headers and a shape skeleton of every response so the
site and pipeline can be written against real payloads. Output: probe-out/
"""
import json
import os
import re
import time
from datetime import datetime, timedelta, timezone

import requests

OUT = "probe-out"
os.makedirs(f"{OUT}/skel", exist_ok=True)
os.makedirs(f"{OUT}/full", exist_ok=True)

ORIGIN = "https://ajhy2003.github.io"
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/129.0 Safari/537.36")
NBA_HEADERS = {
    "User-Agent": UA,
    "Referer": "https://www.nba.com/",
    "Origin": "https://www.nba.com",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "x-nba-stats-origin": "stats",
    "x-nba-stats-token": "true",
}

summary = []


def skeleton(obj, depth=0):
    if depth > 9:
        return "…"
    if isinstance(obj, dict):
        return {k: skeleton(v, depth + 1) for k, v in obj.items()}
    if isinstance(obj, list):
        out = [skeleton(v, depth + 1) for v in obj[:3]]
        if len(obj) > 3:
            out.append(f"…(+{len(obj) - 3} more, len={len(obj)})")
        return out
    if isinstance(obj, str) and len(obj) > 120:
        return obj[:120] + "…"
    return obj


def probe(name, url, headers=None, full=False, full_limit=1_500_000):
    h = {"User-Agent": UA, "Origin": ORIGIN, "Accept": "application/json, */*"}
    if headers:
        h = headers
    rec = {"name": name, "url": url}
    t0 = time.time()
    data = None
    try:
        r = requests.get(url, headers=h, timeout=30)
        rec.update(
            status=r.status_code,
            acao=r.headers.get("access-control-allow-origin"),
            ctype=r.headers.get("content-type"),
            bytes=len(r.content),
            final_url=r.url if r.url != url else None,
        )
        body = r.content
        try:
            data = r.json()
        except Exception:
            data = None
        if data is not None:
            with open(f"{OUT}/skel/{name}.json", "w") as f:
                json.dump(skeleton(data), f, indent=1)
            if full and len(body) <= full_limit:
                with open(f"{OUT}/full/{name}.json", "w") as f:
                    json.dump(data, f)
        else:
            with open(f"{OUT}/skel/{name}.txt", "wb") as f:
                f.write(body[:4000])
    except Exception as e:
        rec["error"] = repr(e)[:300]
    rec["secs"] = round(time.time() - t0, 2)
    summary.append(rec)
    print(json.dumps(rec), flush=True)
    return data


ESPN = "https://site.api.espn.com/apis/site/v2/sports"
ESPNW = "https://site.web.api.espn.com/apis/common/v3/sports"
CORE = "https://sports.core.api.espn.com/v2/sports"

today = datetime.now(timezone.utc)
yday = (today - timedelta(days=1)).strftime("%Y%m%d")

leagues = [
    ("basketball", "nba"), ("basketball", "wnba"),
    ("basketball", "mens-college-basketball"),
    ("football", "nfl"), ("football", "college-football"),
    ("baseball", "mlb"), ("hockey", "nhl"),
    ("soccer", "eng.1"), ("soccer", "usa.1"), ("soccer", "esp.1"),
    ("soccer", "uefa.champions"),
    ("golf", "pga"), ("tennis", "atp"), ("tennis", "wta"),
    ("mma", "ufc"), ("racing", "f1"), ("racing", "nascar-premier"),
    ("racing", "irl"), ("boxing", "boxing"), ("cricket", "8676"),
]

boards = {}
for sport, league in leagues:
    tag = f"{sport}_{league}".replace(".", "_").replace("-", "_")
    boards[(sport, league)] = probe(f"sb_{tag}", f"{ESPN}/{sport}/{league}/scoreboard",
                                    full=sport in ("basketball", "football", "racing", "mma",
                                                   "golf", "tennis", "soccer", "hockey"))

nba_y = probe("sb_nba_yday", f"{ESPN}/basketball/nba/scoreboard?dates={yday}", full=True)


def first_event(board):
    try:
        return board["events"][0]["id"]
    except Exception:
        return None


def completed_event(board):
    try:
        for ev in board["events"]:
            if ev["status"]["type"]["completed"]:
                return ev["id"]
    except Exception:
        pass
    return first_event(board)


for (sport, league), board in list(boards.items()) + [(("basketball", "nba"), nba_y)]:
    ev = completed_event(board)
    if not ev:
        continue
    tag = f"{sport}_{league}".replace(".", "_").replace("-", "_")
    probe(f"summary_{tag}_{ev}", f"{ESPN}/{sport}/{league}/summary?event={ev}", full=True)

# Odds / props from the core API
ev = first_event(boards.get(("basketball", "nba")))
if ev:
    o = probe("core_nba_odds", f"{CORE}/basketball/leagues/nba/events/{ev}/competitions/{ev}/odds", full=True)
    try:
        for item in o["items"][:2]:
            pid = item["provider"]["id"]
            probe(f"core_nba_propbets_{pid}",
                  f"{CORE}/basketball/leagues/nba/events/{ev}/competitions/{ev}/odds/{pid}/propBets?limit=50",
                  full=True)
    except Exception as e:
        print("propbets err", e)
ev = first_event(boards.get(("football", "nfl")))
if ev:
    o = probe("core_nfl_odds", f"{CORE}/football/leagues/nfl/events/{ev}/competitions/{ev}/odds", full=True)
    try:
        pid = o["items"][0]["provider"]["id"]
        probe(f"core_nfl_propbets_{pid}",
              f"{CORE}/football/leagues/nfl/events/{ev}/competitions/{ev}/odds/{pid}/propBets?limit=50",
              full=True)
    except Exception as e:
        print("propbets err", e)

# Athlete game logs / splits
athletes = [
    ("basketball", "nba", 1966, "lebron"),
    ("football", "nfl", 4362628, "chase"),
    ("football", "nfl", 3916387, "lamar"),
    ("baseball", "mlb", 33192, "judge"),
    ("hockey", "nhl", 3895074, "mcdavid"),
    ("soccer", "eng.1", 253989, "haaland"),
    ("golf", "pga", 9478, "scheffler"),
    ("mma", "ufc", 2335639, "ufc_fighter"),
    ("tennis", "atp", 3623, "tennis_player"),
]
for sport, league, aid, nm in athletes:
    probe(f"gamelog_{nm}", f"{ESPNW}/{sport}/{league}/athletes/{aid}/gamelog", full=True)
    probe(f"overview_{nm}", f"{ESPNW}/{sport}/{league}/athletes/{aid}/overview", full=True)
probe("gamelog_lebron_2026", f"{ESPNW}/basketball/nba/athletes/1966/gamelog?season=2026", full=True)
probe("gamelog_chase_2025", f"{ESPNW}/football/nfl/athletes/4362628/gamelog?season=2025", full=True)
probe("splits_lebron", f"{ESPNW}/basketball/nba/athletes/1966/splits", full=True)
probe("splits_chase", f"{ESPNW}/football/nfl/athletes/4362628/splits", full=True)
probe("athlete_lebron", f"{ESPNW}/basketball/nba/athletes/1966", full=True)
probe("stats_lebron", f"{ESPNW}/basketball/nba/athletes/1966/stats", full=True)

# Search + athlete index
probe("search_v2", "https://site.web.api.espn.com/apis/search/v2?query=lebron&limit=5", full=True)
probe("search_common_v3", "https://site.web.api.espn.com/apis/common/v3/search?query=lebron&limit=5&type=player", full=True)
probe("core_v3_athletes_nba", "https://sports.core.api.espn.com/v3/sports/basketball/nba/athletes?limit=1000&active=true", full=True)
probe("core_v3_athletes_nfl", "https://sports.core.api.espn.com/v3/sports/football/nfl/athletes?limit=200&active=true")

# Teams
probe("teams_nba", f"{ESPN}/basketball/nba/teams", full=True)
probe("roster_phi", f"{ESPN}/basketball/nba/teams/20/roster", full=True)
probe("teamstats_phi", f"{ESPN}/basketball/nba/teams/20/statistics", full=True)
probe("schedule_phi", f"{ESPN}/basketball/nba/teams/20/schedule", full=True)
probe("teams_nfl", f"{ESPN}/football/nfl/teams", full=True)
probe("teamstats_bal", f"{ESPN}/football/nfl/teams/33/statistics", full=True)
probe("schedule_bal", f"{ESPN}/football/nfl/teams/33/schedule", full=True)
probe("core_teamstats_phi", f"{CORE}/basketball/leagues/nba/seasons/2027/types/2/teams/20/statistics", full=True)
probe("standings_nba", "https://site.api.espn.com/apis/v2/sports/basketball/nba/standings", full=True)

# NBA official
season = "2026-27"
nba_q = f"Season={season}&SeasonType=Regular%20Season&PerMode=PerGame&LeagueID=00"
probe("nba_pt_reb", f"https://stats.nba.com/stats/leaguedashptstats?{nba_q}&PtMeasureType=Rebounding&PlayerOrTeam=Player&LastNGames=0&Month=0&OpponentTeamID=0&Period=0", NBA_HEADERS, full=True)
probe("nba_pt_pass", f"https://stats.nba.com/stats/leaguedashptstats?{nba_q}&PtMeasureType=Passing&PlayerOrTeam=Player&LastNGames=0&Month=0&OpponentTeamID=0&Period=0", NBA_HEADERS, full=True)
probe("nba_adv", f"https://stats.nba.com/stats/leaguedashplayerstats?{nba_q}&MeasureType=Advanced&LastNGames=0&Month=0&OpponentTeamID=0&Period=0&PaceAdjust=N&PlusMinus=N&Rank=N", NBA_HEADERS, full=True)
probe("nba_gamelog_p", f"https://stats.nba.com/stats/leaguegamelog?Season={season}&SeasonType=Regular%20Season&PlayerOrTeam=P&Direction=DESC&Sorter=DATE&Counter=1000&LeagueID=00", NBA_HEADERS, full=True)
probe("nba_cdn_scoreboard", "https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json", full=True)
probe("nba_cdn_schedule", "https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json")

# MLB
probe("mlb_judge_gamelog", "https://statsapi.mlb.com/api/v1/people/592450/stats?stats=gameLog&group=hitting&season=2026", full=True)
probe("mlb_skubal_gamelog", "https://statsapi.mlb.com/api/v1/people/669373/stats?stats=gameLog&group=pitching&season=2026", full=True)
probe("mlb_people_search", "https://statsapi.mlb.com/api/v1/people/search?names=judge&sportIds=1", full=True)
probe("mlb_schedule", "https://statsapi.mlb.com/api/v1/schedule?sportId=1&hydrate=probablePitcher,team", full=True)
probe("mlb_teams_stats", "https://statsapi.mlb.com/api/v1/teams/stats?season=2026&sportIds=1&group=hitting&stats=season", full=True)
probe("mlb_judge_splits", "https://statsapi.mlb.com/api/v1/people/592450/stats?stats=statSplits&group=hitting&season=2026&sitCodes=vl,vr,h,a", full=True)

# NHL
probe("nhl_mcdavid_gamelog", "https://api-web.nhle.com/v1/player/8478402/game-log/20262027/2", full=True)
probe("nhl_schedule_now", "https://api-web.nhle.com/v1/schedule/now", full=True)

# F1 / NASCAR
probe("jolpica_results", "https://api.jolpi.ca/ergast/f1/current/results.json?limit=100", full=True)
probe("jolpica_2025_results", "https://api.jolpi.ca/ergast/f1/2025/results.json?limit=100", full=True)
probe("openf1_sessions", "https://api.openf1.org/v1/sessions?year=2026&session_type=Race", full=True)
nas = probe("nascar_races_2026", "https://cf.nascar.com/cacher/2026/1/race_list_basic.json", full=True)
try:
    done = [r for r in nas if r.get("winner_driver_id")]
    rid = done[-1]["race_id"]
    probe("nascar_weekend", f"https://cf.nascar.com/cacher/2026/1/{rid}/weekend-feed.json", full=True)
    probe("nascar_loopstats", f"https://cf.nascar.com/loopstats/prod/2026/1/{rid}.json", full=True)
except Exception as e:
    print("nascar err", e)
probe("nascar_drivers", "https://cf.nascar.com/cacher/drivers.json")

# NFL (nflverse)
for tag in ["stats_player", "player_stats", "nextgen_stats", "pbp", "schedules", "rosters", "weekly_rosters", "pfr_advstats", "snap_counts", "players"]:
    probe(f"nflverse_rel_{tag}", f"https://api.github.com/repos/nflverse/nflverse-data/releases/tags/{tag}", {"User-Agent": UA}, full=True)
probe("nfldata_games_head", "https://raw.githubusercontent.com/nflverse/nfldata/master/data/games.csv")

# Tennis / misc
probe("sackmann_atp_2026", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2026.csv")
probe("sackmann_atp_2025", "https://raw.githubusercontent.com/JeffSackmann/tennis_atp/master/atp_matches_2025.csv")
probe("odds_api", "https://api.the-odds-api.com/v4/sports?apiKey=invalid")
probe("jsdelivr", "https://cdn.jsdelivr.net/gh/AjHy2003/sports-picks@main/README.md")

with open(f"{OUT}/summary.json", "w") as f:
    json.dump(summary, f, indent=1)
print("done", len(summary))
