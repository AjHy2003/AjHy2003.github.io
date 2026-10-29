import { api, pickcenterOdds, standingsTable, scheduleResults, parseProps, loadGamelogs, pool } from "../espn.js";
import { MARKETS } from "../sports.js";
import * as M from "../model.js";
import { esc, loading, errorBox, setTitle, pct, fx, signed, fmtDate, fmtTime, cmpRow, toast } from "../ui.js";
import { addPick } from "../store.js";
import { loadDeep, deepGamePanel } from "../deep.js";
import { marketsFor, opponentFactor, runProp, playedGames } from "../props.js";

// Games of shrinkage toward league average for team scoring rates.
const TEAM_REGRESS = { basketball: 8, football: 3, baseball: 20, hockey: 10, soccer: 6 };
const DEFAULT_AVG = { nba: 114, wnba: 82, ncaab: 72, ncaaw: 66, nfl: 22.5, ncaaf: 28, mlb: 4.4, nhl: 3.05 };

export async function renderGame(ctx, L, ev, q) {
  const { app } = ctx;
  app.innerHTML = loading("Loading matchup…");
  let sum;
  try {
    sum = await api.summary(L, ev);
  } catch (e) {
    if (ctx.alive()) app.innerHTML = errorBox(e);
    return;
  }
  const comp = sum.header?.competitions?.[0];
  if (!comp) { app.innerHTML = errorBox("No game data"); return; }
  const home = comp.competitors.find((c) => c.homeAway === "home");
  const away = comp.competitors.find((c) => c.homeAway === "away");
  const status = comp.status?.type || {};
  const fam = L.markets;

  const [standings, schedH, schedA, deep, propsAll] = await Promise.all([
    api.standings(L).then(standingsTable).catch(() => null),
    api.schedule(L, home.team.id).catch(() => null),
    api.schedule(L, away.team.id).catch(() => null),
    loadDeep(L).catch(() => null),
    status.state !== "post" ? api.propBets(L, ev).then(parseProps).catch(() => null) : null,
  ]);
  if (!ctx.alive()) return;

  const resH = schedH ? scheduleResults(schedH, home.team.id).filter((g) => new Date(g.date) < new Date(comp.date)) : [];
  const resA = schedA ? scheduleResults(schedA, away.team.id).filter((g) => new Date(g.date) < new Date(comp.date)) : [];
  // Pre-game box score carries season per-game stats for some leagues (NFL).
  const boxStand = (team, res) => {
    const t = (sum.boxscore?.teams || []).find((x) => String(x.team?.id) === String(team.id));
    const val = (n) => parseFloat(t?.statistics?.find((x) => x.name === n)?.displayValue);
    const pf = val("totalPointsPerGame"), pa = val("totalPointsPerGameAllowed");
    const rec = comp.competitors.find((c) => String(c.team.id) === String(team.id))?.record?.[0]?.summary;
    const gp = rec ? rec.split("-").reduce((s, x) => s + (Number(x) || 0), 0) : res.length;
    return isFinite(pf) && isFinite(pa) && gp ? { pf, pa, gp } : null;
  };
  const standH = standings?.teams?.[home.team.id] || boxStand(home.team, resH);
  const standA = standings?.teams?.[away.team.id] || boxStand(away.team, resA);
  const lg = standings?.leagueAvg || DEFAULT_AVG[L.id] || avgFromResults(resH, resA) || 1;
  const rating = (stand, res) => teamRating(stand, res, lg, TEAM_REGRESS[fam] || 8);
  const rH = rating(standH, resH);
  const rA = rating(standA, resA);
  const minGames = Math.min(standH?.gp ?? resH.length, standA?.gp ?? resA.length);
  // Weight on our model vs the no-vig market: game lines are sharp, so the model only nudges.
  const wModel = minGames >= 4 ? 0.35 : 0.2;

  const odds = pickcenterOdds(sum.pickcenter?.[0]) || {};
  const params = M.gameParams(L.espn.split("/")[1], fam === "soccer" ? "soccer" : L.espn.split("/")[1]);
  const isSoccer = fam === "soccer";
  const st = {
    spreadHome: q.sp != null ? Number(q.sp) : odds.spreadHome,
    spreadHomeOdds: odds.spreadHomeOdds ?? -110, spreadAwayOdds: odds.spreadAwayOdds ?? -110,
    total: q.t != null ? Number(q.t) : odds.total,
    overOdds: odds.overOdds ?? -110, underOdds: odds.underOdds ?? -110,
    mlHome: odds.mlHome, mlAway: odds.mlAway, draw: odds.draw,
  };

  const H = home.team, A = away.team;
  setTitle(`${A.abbreviation} @ ${H.abbreviation}`);
  const logo = (t) => t.logos?.[0]?.href || t.logo || "";
  const rec = (c) => (c.record || c.records || [])[0]?.summary || "";
  const scoreLine = status.state !== "pre" ? `${away.score ?? ""} – ${home.score ?? ""} · ${esc(status.shortDetail || status.detail || "")}` : `${fmtDate(comp.date, { weekday: "long", month: "short", day: "numeric" })} · ${fmtTime(comp.date)}`;

  app.innerHTML = `
    <div class="crumbs"><a href="#/">Home</a> › <a href="#/l/${L.id}">${esc(L.name)}</a> › ${esc(A.abbreviation)} @ ${esc(H.abbreviation)}</div>
    <div class="card">
      <div class="row" style="justify-content:space-between;gap:16px">
        <div class="row"><img src="${esc(logo(A))}" alt="" style="width:46px;height:46px"/><div><h2 style="margin:0">${esc(A.displayName)}</h2><div class="muted small">${esc(rec(away))} · Away</div></div></div>
        <div style="text-align:center"><div style="font-weight:800;font-size:18px">${scoreLine}</div><div class="muted small">${esc(sum.gameInfo?.venue?.fullName || "")}</div></div>
        <div class="row"><div style="text-align:right"><h2 style="margin:0">${esc(H.displayName)}</h2><div class="muted small">${esc(rec(home))} · Home</div></div><img src="${esc(logo(H))}" alt="" style="width:46px;height:46px"/></div>
      </div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card">
        <h3>Lines ${odds.provider ? `<span class="faint" style="text-transform:none;letter-spacing:0">· ${esc(odds.provider)}</span>` : ""}</h3>
        <div class="form-row">
          ${isSoccer ? "" : `<div class="field"><label>${esc(H.abbreviation)} spread</label><input id="g-sp" type="number" step="0.5"/></div>
          <div class="field"><label>${esc(H.abbreviation)} odds</label><input id="g-spo-h" type="number"/></div>
          <div class="field"><label>${esc(A.abbreviation)} odds</label><input id="g-spo-a" type="number"/></div>`}
        </div>
        <div class="form-row" style="margin-top:10px">
          <div class="field"><label>Total</label><input id="g-t" type="number" step="0.5"/></div>
          <div class="field"><label>Over odds</label><input id="g-oo" type="number"/></div>
          <div class="field"><label>Under odds</label><input id="g-uo" type="number"/></div>
        </div>
        <div class="form-row" style="margin-top:10px">
          <div class="field"><label>${esc(A.abbreviation)} ML</label><input id="g-mla" type="number"/></div>
          ${isSoccer ? `<div class="field"><label>Draw</label><input id="g-draw" type="number"/></div>` : ""}
          <div class="field"><label>${esc(H.abbreviation)} ML</label><input id="g-mlh" type="number"/></div>
        </div>
      </div>
      <div class="card" id="g-model"></div>
    </div>
    <div class="card" style="margin-top:14px"><h3>Team comparison</h3><div class="cmp" id="g-cmp"></div></div>
    <div id="g-deep"></div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><h3>${esc(A.abbreviation)} recent</h3><div class="table-wrap">${recentTable(resA)}</div></div>
      <div class="card"><h3>${esc(H.abbreviation)} recent</h3><div class="table-wrap">${recentTable(resH)}</div></div>
    </div>
    <div class="grid two" style="margin-top:14px">
      <div class="card"><h3>Injuries</h3>${injuries(sum)}</div>
      <div class="card"><h3>Head to head</h3>${h2h(sum, resH, A)}</div>
    </div>
    <div class="card" style="margin-top:14px" id="g-props"></div>`;

  const $ = (s) => app.querySelector(s);
  const setv = (sel, v) => { const el = $(sel); if (el) el.value = v ?? ""; };
  setv("#g-sp", st.spreadHome); setv("#g-spo-h", st.spreadHomeOdds); setv("#g-spo-a", st.spreadAwayOdds);
  setv("#g-t", st.total); setv("#g-oo", st.overOdds); setv("#g-uo", st.underOdds);
  setv("#g-mla", st.mlAway); setv("#g-mlh", st.mlHome); setv("#g-draw", st.draw);
  const binds = { "#g-sp": "spreadHome", "#g-spo-h": "spreadHomeOdds", "#g-spo-a": "spreadAwayOdds", "#g-t": "total", "#g-oo": "overOdds", "#g-uo": "underOdds", "#g-mla": "mlAway", "#g-mlh": "mlHome", "#g-draw": "draw" };
  for (const [sel, key] of Object.entries(binds)) $(sel)?.addEventListener("input", (e) => { st[key] = e.target.value === "" ? null : Number(e.target.value); renderModel(); });

  const deepHtml = deep ? deepGamePanel(L, deep, H, A) : "";
  $("#g-deep").innerHTML = deepHtml || "";

  const unit = { basketball: "PPG", football: "PPG", baseball: "Runs/G", hockey: "Goals/G", soccer: "Goals/G" }[fam] || "PPG";
  const statRows = [];
  statRows.push(cmpRow(`${unit} (season)`, rA.pfSeason, rH.pfSeason));
  statRows.push(cmpRow(`${unit} allowed`, rA.paSeason, rH.paSeason, { higherIsBetter: false }));
  statRows.push(cmpRow(`${unit} last 5`, rA.pf5, rH.pf5));
  statRows.push(cmpRow(`Allowed last 5`, rA.pa5, rH.pa5, { higherIsBetter: false }));
  statRows.push(cmpRow("Avg margin", rA.margin, rH.margin, { fmt: (v) => signed(v) }));
  // Pre-game season stats ESPN attaches to the box score (NFL: yards for/allowed).
  const bt = (sum.boxscore?.teams || []);
  const bH = bt.find((t) => String(t.team?.id) === String(H.id));
  const bA = bt.find((t) => String(t.team?.id) === String(A.id));
  if (bH && bA && status.state === "pre") {
    for (const s of bH.statistics || []) {
      if (/PointsPerGame/.test(s.name)) continue;
      const o = (bA.statistics || []).find((x) => x.name === s.name);
      if (!o) continue;
      const a = parseFloat(o.displayValue), h = parseFloat(s.displayValue);
      if (!isFinite(a) || !isFinite(h)) continue;
      statRows.push(cmpRow(s.label || s.displayName || s.name, a, h, { higherIsBetter: !/Allowed/i.test(s.name) }));
    }
  }
  $("#g-cmp").innerHTML = `<div class="a"><b>${esc(A.abbreviation)}</b></div><div class="lbl"></div><div class="b"><b>${esc(H.abbreviation)}</b></div>${statRows.join("")}`;

  function renderModel() {
    const g = M.analyzeGame({ pf: rH.pf, pa: rH.pa }, { pf: rA.pf, pa: rA.pa }, lg, params, { spreadHome: st.spreadHome, total: st.total });
    const pred = sum.predictor;
    const rows = [];
    // Two-way market: model prob for side A (pushes excluded), anchored to the book.
    const twoWay = (pA, pB, push, oA, oB, labels) => {
      oA = oA ?? -110; oB = oB ?? -110;
      const dec = pA / (pA + pB);
      const fin = M.anchor(dec, oA, oB, wModel);
      const a = fin * (1 - push), b = (1 - fin) * (1 - push);
      return { v: M.makeVerdict(a, b, push, oA, oB, M.expectedValue(a, push, oA), M.expectedValue(b, push, oB), minGames, labels), model: dec, fin };
    };
    if (g.spread) {
      const r = twoWay(g.spread.home, g.spread.away, g.spread.push, st.spreadHomeOdds, st.spreadAwayOdds, [`${H.abbreviation} ${fmtSpread(st.spreadHome)}`, `${A.abbreviation} ${fmtSpread(-st.spreadHome)}`]);
      rows.push(["Spread", r.v, `${H.abbreviation} covers: model ${pct(r.model)} → blended ${pct(r.fin)}`]);
    }
    if (g.totalP) {
      const r = twoWay(g.totalP.over, g.totalP.under, g.totalP.push, st.overOdds, st.underOdds, [`Over ${st.total}`, `Under ${st.total}`]);
      rows.push(["Total", r.v, `Over: model ${pct(r.model)} → blended ${pct(r.fin)}`]);
    }
    if (isSoccer && st.mlHome != null && st.mlAway != null) {
      let opts = [[`${H.abbreviation} win`, g.pHome, st.mlHome], ["Draw", g.pDraw, st.draw], [`${A.abbreviation} win`, g.pAway, st.mlAway]].filter((o) => o[2] != null);
      if (opts.length === 3) {
        const imp = opts.map((o) => M.impliedProb(o[2]));
        const tot = imp.reduce((x, y) => x + y, 0);
        opts = opts.map((o, i) => [o[0], wModel * o[1] + (1 - wModel) * (imp[i] / tot), o[2]]);
      }
      const best = opts.map(([lbl, p, o]) => ({ lbl, p, o, ev: M.expectedValue(p, 0, o), edge: p - M.impliedProb(o) })).sort((a, b) => b.ev - a.ev)[0];
      const grade = best.edge >= 0.08 ? "A" : best.edge >= 0.05 ? "B" : best.edge >= 0.025 ? "C" : "PASS";
      rows.push(["Result (1X2)", { side: grade === "PASS" ? null : best.lbl, lean: best.lbl, edge: best.edge, ev: best.ev, grade, prob: best.p }, `${H.abbreviation} ${pct(g.pHome)} · Draw ${pct(g.pDraw)} · ${A.abbreviation} ${pct(g.pAway)}`]);
    } else if (st.mlHome != null && st.mlAway != null) {
      const r = twoWay(g.pHome, g.pAway, 0, st.mlHome, st.mlAway, [`${H.abbreviation} ML`, `${A.abbreviation} ML`]);
      rows.push(["Moneyline", r.v, `${H.abbreviation} wins: model ${pct(r.model)} → blended ${pct(r.fin)}`]);
    }
    const dec = isSoccer || fam === "hockey" || fam === "baseball" ? 2 : 1;
    $("#g-model").innerHTML = `
      <h3>Model</h3>
      <div class="kpis" style="margin-top:0">
        <div class="kpi"><div class="k">${esc(A.abbreviation)}</div><div class="v">${fx(g.projAway, dec)}</div></div>
        <div class="kpi"><div class="k">${esc(H.abbreviation)}</div><div class="v">${fx(g.projHome, dec)}</div></div>
        <div class="kpi"><div class="k">Margin (H)</div><div class="v">${signed(g.margin, dec)}</div></div>
        <div class="kpi"><div class="k">Total</div><div class="v">${fx(g.total, dec)}</div></div>
      </div>
      <table style="margin-top:12px"><thead><tr><th>Market</th><th>Pick</th><th class="r">Prob</th><th class="r">Edge</th><th class="r">Grade</th><th></th></tr></thead><tbody>
      ${rows.map(([mk, v, info], i) => `<tr><td>${mk}<div class="faint small">${esc(info)}</div></td><td><b>${esc(v.side || `lean ${v.lean}`)}</b></td><td class="r">${pct(v.prob, 1)}</td><td class="r ${v.edge > 0 ? "pos" : "neg"}">${signed(v.edge * 100, 1)}</td><td class="r"><b>${v.grade}</b></td><td><button class="btn ghost sm" data-save="${i}">★</button></td></tr>`).join("") || `<tr><td colspan="6" class="muted">Enter a spread or total to evaluate.</td></tr>`}
      </tbody></table>
      ${pred?.homeTeam?.gameProjection ? `<p class="small muted" style="margin:10px 0 0">ESPN Matchup Predictor: ${esc(H.abbreviation)} ${fx(Number(pred.homeTeam.gameProjection))}% to win.</p>` : ""}
      <details class="explain" style="margin-top:8px"><summary>How this is calculated</summary>
        <p>Each team's scoring rate = season ${unit} shrunk toward the league average (${fx(lg, dec)}) by sample size, blended 70/30 with the last 5 games. Projected score = team offense × opponent defense ÷ league average, plus ${fx(params.hfa, 2)} home edge. ${params.kind === "poisson" ? "Scores are modelled as Poisson, so low-scoring sports get real draw/one-goal probabilities." : `Margin SD ${params.sdMargin}, total SD ${params.sdTotal}.`} Because game lines are very efficient, the final probability is ${Math.round(wModel * 100)}% this model and ${Math.round((1 - wModel) * 100)}% the sportsbook's no-vig price, so a grade only appears when the stats disagree with the market by a lot. The model doesn't know about injuries, rest or weather.</p>
      </details>`;
    $("#g-model").querySelectorAll("[data-save]").forEach((b) => b.addEventListener("click", () => {
      const [mk, v] = rows[Number(b.dataset.save)];
      const side = v.side || v.lean;
      addPick({ league: L.id, eventId: ev, eventDate: comp.date, athlete: `${A.abbreviation} @ ${H.abbreviation}`, marketLabel: mk, market: mk.toLowerCase(), side, prob: v.prob, grade: v.grade, game: true, homeId: H.id, awayId: A.id, homeAbbr: H.abbreviation, awayAbbr: A.abbreviation, line: mk === "Total" ? st.total : mk === "Spread" ? st.spreadHome : null, odds: oddsForSide(mk, side, st, H, A) });
      toast(`Saved: ${side}`);
    }));
  }
  renderModel();
  renderPropsBoard(ctx, L, ev, comp, H, A, propsAll, standings, deep);
}

function oddsForSide(mk, side, st, H, A) {
  if (mk === "Spread") return side.startsWith(H.abbreviation) ? st.spreadHomeOdds : st.spreadAwayOdds;
  if (mk === "Total") return side.startsWith("Over") ? st.overOdds : st.underOdds;
  if (mk === "Moneyline") return side.startsWith(H.abbreviation) ? st.mlHome : st.mlAway;
  if (side === "Draw") return st.draw;
  return side.startsWith(H.abbreviation) ? st.mlHome : st.mlAway;
}

const fmtSpread = (s) => (s == null || !isFinite(s) ? "" : s > 0 ? `+${s}` : `${s}`);

function avgFromResults(a, b) {
  const all = [...a, ...b];
  return all.length ? M.mean(all.map((g) => g.pf)) : null;
}

// Blend season (shrunk to league average) with last-5 form.
function teamRating(stand, res, lg, k) {
  const gp = stand?.gp || res.length;
  const pfS = stand?.pf ?? (res.length ? M.mean(res.map((g) => g.pf)) : lg);
  const paS = stand?.pa ?? (res.length ? M.mean(res.map((g) => g.pa)) : lg);
  const shrink = (v) => (gp * v + k * lg) / (gp + k);
  const last5 = res.slice(0, 5);
  const pf5 = last5.length ? M.mean(last5.map((g) => g.pf)) : NaN;
  const pa5 = last5.length ? M.mean(last5.map((g) => g.pa)) : NaN;
  const blend = (s, r) => (last5.length >= 3 ? 0.7 * shrink(s) + 0.3 * shrink(r) : shrink(s));
  return {
    pfSeason: pfS, paSeason: paS, pf5, pa5,
    margin: res.length ? M.mean(res.slice(0, 10).map((g) => g.pf - g.pa)) : NaN,
    pf: blend(pfS, pf5), pa: blend(paS, pa5),
  };
}

function recentTable(res) {
  if (!res.length) return `<div class="muted small">No completed games this season.</div>`;
  return `<table><thead><tr><th>Date</th><th>Opp</th><th class="r">Score</th><th class="r">Margin</th></tr></thead><tbody>
    ${res.slice(0, 8).map((g) => `<tr><td>${fmtDate(g.date)}</td><td>${g.home ? "vs" : "@"} ${esc(g.opp)}</td><td class="r ${g.win ? "o" : "u"}">${g.win ? "W" : "L"} ${g.pf}-${g.pa}</td><td class="r">${signed(g.pf - g.pa, 0)}</td></tr>`).join("")}
  </tbody></table>`;
}

function injuries(sum) {
  const teams = sum.injuries || [];
  const rows = teams.flatMap((t) => (t.injuries || []).map((i) => ({ team: t.team?.abbreviation, name: i.athlete?.displayName, pos: i.athlete?.position?.abbreviation, status: i.status, type: i.type?.description || i.details?.type || "" })));
  if (!rows.length) return `<div class="muted small">No injuries reported.</div>`;
  return `<div class="table-wrap"><table><tbody>${rows.slice(0, 30).map((r) => `<tr><td>${esc(r.team)}</td><td>${esc(r.name)} <span class="faint">${esc(r.pos || "")}</span></td><td class="${/out/i.test(r.status) ? "neg" : ""}">${esc(r.status)}</td></tr>`).join("")}</tbody></table></div>`;
}

function h2h(sum, resH, A) {
  const meetings = resH.filter((g) => String(g.oppId) === String(A.id));
  const series = sum.seasonseries?.[0];
  const lines = [];
  if (series?.summary) lines.push(`<p class="small">${esc(series.summary)}</p>`);
  if (!meetings.length) return lines.join("") + `<div class="muted small">No meetings yet this season.</div>`;
  return lines.join("") + recentTable(meetings);
}

// ---------- props board ----------
async function renderPropsBoard(ctx, L, ev, comp, H, A, propsAll, standings, deep) {
  const box = ctx.app.querySelector("#g-props");
  if (!propsAll || !propsAll.size) {
    box.innerHTML = `<h3>Player props</h3><div class="muted small">No player prop lines posted for this game yet. Open any player from search to analyze your own line.</div>`;
    return;
  }
  box.innerHTML = `<h3>Player props</h3>${loading("Loading rosters…")}`;
  const people = new Map();
  await Promise.all([H, A].map(async (t) => {
    try {
      const r = await api.roster(L, t.id);
      const groups = Array.isArray(r.athletes?.[0]?.items) ? r.athletes.flatMap((g) => g.items) : r.athletes || [];
      for (const p of groups) people.set(String(p.id), { name: p.displayName, pos: p.position?.abbreviation, team: t, img: p.headshot?.href });
    } catch { /* roster unavailable */ }
  }));
  if (!ctx.alive()) return;

  const fam = L.markets;
  const allMarkets = MARKETS[fam] || [];
  const rows = [];
  for (const [aid, mk] of propsAll) {
    for (const [key, p] of Object.entries(mk)) {
      const m = allMarkets.find((x) => x.key === key);
      if (!m) continue;
      const who = people.get(aid) || { name: `Player ${aid}`, team: null };
      rows.push({ aid, key, m, p, who });
    }
  }
  const draw = () => {
    rows.sort((a, b) => (b.edge ?? -9) - (a.edge ?? -9) || a.who.name.localeCompare(b.who.name));
    box.innerHTML = `
      <div class="row" style="justify-content:space-between"><h3 style="margin:0">Player props · DraftKings</h3>
        <button class="btn sm" id="scan">${rows.some((r) => r.res) ? "Re-scan" : "Scan all props"}</button></div>
      <p class="small muted">Scan runs the full model on every posted line (game logs for each player, so it takes a few seconds) and sorts by edge.</p>
      <div class="table-wrap"><table><thead><tr><th>Player</th><th>Market</th><th class="r">Line</th><th class="r">Over</th><th class="r">Under</th><th class="r">Proj</th><th class="r">P(over)</th><th>Pick</th><th class="r">Edge</th><th class="r">Grade</th><th></th></tr></thead><tbody>
      ${rows.map((r) => {
        const v = r.res?.verdict;
        return `<tr class="${v && v.grade !== "PASS" ? "hl" : ""}"><td>${esc(r.who.name)} <span class="faint">${esc(r.who.team?.abbreviation || "")} ${esc(r.who.pos || "")}</span></td><td>${esc(r.m.label)}</td>
        <td class="r">${r.p.line}</td><td class="r">${M.fmtOdds(r.p.over)}</td><td class="r">${M.fmtOdds(r.p.under)}</td>
        <td class="r">${r.res ? fx(r.res.projection) : r.err ? "—" : ""}</td><td class="r">${r.res ? pct(r.res.pOver) : ""}</td>
        <td>${v ? `<b class="${v.lean === "OVER" ? "pos" : "neg"}">${v.lean}</b>` : ""}</td><td class="r">${v ? signed(v.edge * 100, 1) : ""}</td><td class="r"><b>${v ? v.grade : ""}</b></td>
        <td><a class="btn ghost sm" href="#/l/${L.id}/p/${r.aid}?m=${r.key}&line=${r.p.line}${r.p.over != null ? `&oo=${r.p.over}` : ""}${r.p.under != null ? `&uo=${r.p.under}` : ""}">Analyze ›</a></td></tr>`;
      }).join("")}</tbody></table></div>`;
    box.querySelector("#scan").addEventListener("click", scan);
  };
  async function scan() {
    const btn = box.querySelector("#scan");
    btn.disabled = true;
    const ids = [...new Set(rows.map((r) => r.aid))];
    let done = 0;
    btn.textContent = `Scanning 0/${ids.length}…`;
    const logs = new Map();
    await pool(ids, 4, async (aid) => {
      try { logs.set(aid, await loadGamelogs(L, aid, fam)); } catch { logs.set(aid, null); }
      done++;
      if (ctx.alive()) btn.textContent = `Scanning ${done}/${ids.length}…`;
    });
    if (!ctx.alive()) return;
    for (const r of rows) {
      const log = logs.get(r.aid);
      if (!log) { r.err = true; continue; }
      const games = playedGames(log);
      const fam2 = log.family;
      const ok = marketsFor(fam2, games).some((x) => x.key === r.key);
      if (!ok && !games.length) { r.err = true; continue; }
      const myTeamIsHome = r.who.team && String(r.who.team.id) === String(H.id);
      const next = r.who.team ? { oppId: myTeamIsHome ? A.id : H.id, opp: myTeamIsHome ? A.abbreviation : H.abbreviation, home: myTeamIsHome, date: comp.date } : null;
      const opp = opponentFactor({ L, fam: fam2, m: r.m, next, standings, deep, athlete: { id: r.aid, position: { abbreviation: r.who.pos } } });
      const { res } = runProp(fam2, r.m, games, { line: r.p.line, oddsOver: r.p.over, oddsUnder: r.p.under, opp });
      if (res.n) { r.res = res; r.edge = res.verdict?.edge; }
    }
    draw();
  }
  draw();
}
