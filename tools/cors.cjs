// Browser-side CORS matrix: which ESPN URLs can a page on localhost / github.io actually fetch?
const { chromium } = require("playwright");
const http = require("http");
const https = require("https");
const fs = require("fs");
const page = "<!doctype html><title>cors</title><body>cors</body>";
const handler = (req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(page); };
http.createServer(handler).listen(8765);
https.createServer({ key: fs.readFileSync("/tmp/k.pem"), cert: fs.readFileSync("/tmp/c.pem") }, handler).listen(443);
const S = "https://site.api.espn.com", W = "https://site.web.api.espn.com";
const paths = [
  "/apis/site/v2/sports/basketball/nba/scoreboard",
  "/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261029",
  "/apis/v2/sports/basketball/nba/standings",
  "/apis/site/v2/sports/basketball/nba/teams/20/schedule",
  "/apis/site/v2/sports/basketball/nba/teams/20/roster",
  "/apis/site/v2/sports/basketball/nba/summary?event=401909881",
  "/apis/site/v2/sports/football/nfl/scoreboard",
  "/apis/site/v2/sports/golf/pga/scoreboard",
];
const urls = [];
for (const p of paths) for (const h of [S, W]) { urls.push(h + p); urls.push(h + p + (p.includes("?") ? "&" : "?") + "_=" + Date.now()); }
urls.push(W + "/apis/common/v3/sports/basketball/nba/athletes/1966/gamelog", "https://sports.core.api.espn.com/v2/sports/basketball/leagues/nba/events/401909881/competitions/401909881/odds",
  "https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=basketball&league=nba", "https://cdn.espn.com/core/nba/scoreboard?xhr=1", "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/news");
(async () => {
  const b = await chromium.launch({ args: ["--host-resolver-rules=MAP ajhy2003.github.io 127.0.0.1"] });
  const ctx = await b.newContext({ ignoreHTTPSErrors: true });
  const out = {};
  for (const origin of ["http://localhost:8765/", "https://ajhy2003.github.io/"]) {
    const pg = await ctx.newPage();
    await pg.goto(origin);
    out[origin] = await pg.evaluate(async (urls) => {
      const res = {};
      for (const u of urls) {
        for (const attempt of [1, 2]) {
          try { const r = await fetch(u); res[`${u} #${attempt}`] = `${r.status} ok`; }
          catch (e) { res[`${u} #${attempt}`] = "BLOCKED " + e.message; }
        }
      }
      return res;
    }, urls);
    await pg.close();
  }
  // Raw response headers for the failing URL with different Origin values.
  const hdr = {};
  for (const o of [null, "http://localhost:8765", "https://ajhy2003.github.io"]) {
    for (const u of [S + paths[1], W + paths[1], S + paths[2]]) {
      const r = await fetch(u, { headers: o ? { Origin: o } : {} });
      hdr[`${o} ${u}`] = { status: r.status, acao: r.headers.get("access-control-allow-origin"), vary: r.headers.get("vary"), cache: r.headers.get("x-cache") || r.headers.get("cf-cache-status") || r.headers.get("age"), via: r.headers.get("via"), server: r.headers.get("server") };
    }
  }
  fs.mkdirSync("e2e-out", { recursive: true });
  fs.writeFileSync("e2e-out/cors.json", JSON.stringify({ browser: out, headers: hdr }, null, 1));
  console.log(JSON.stringify({ browser: out, headers: hdr }, null, 1));
  await b.close();
  process.exit(0);
})();
