// 盘中行情监控：拉取行情 → 检查穿越Tigris关键价位 → Discord提醒 → 更新quotes.json
// 由 GitHub Actions 定时运行（见 .github/workflows/monitor.yml）
const fs = require("fs");

const config = JSON.parse(fs.readFileSync("config.json", "utf8"));
const state = JSON.parse(fs.readFileSync("alert_state.json", "utf8"));

const UA = { headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" } };

async function getQuote(sym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=15m`;
  const r = await fetch(url, UA);
  if (!r.ok) throw new Error(`${sym} HTTP ${r.status}`);
  const j = await r.json();
  const meta = j?.chart?.result?.[0]?.meta;
  if (!meta || !meta.regularMarketPrice) throw new Error(`${sym} no meta`);
  const p = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose || meta.previousClose || p;
  return { p: +p.toFixed(2), chg: +(((p / prev) - 1) * 100).toFixed(2), t: meta.regularMarketTime || 0 };
}

(async () => {
  const quotes = {};
  let marketFresh = false;
  const now = Math.floor(Date.now() / 1000);

  for (const sym of config.tickers) {
    try {
      const q = await getQuote(sym);
      quotes[sym] = { p: q.p, chg: q.chg };
      if (config.mcap_keep && config.mcap_keep[sym]) quotes[sym].mcap = config.mcap_keep[sym];
      if (now - q.t < 30 * 60) marketFresh = true; // 30分钟内有成交=盘中
      await new Promise(res => setTimeout(res, 400));
    } catch (e) { console.log("quote fail:", e.message); }
  }
  if (Object.keys(quotes).length === 0) { console.log("no quotes, abort"); return; }

  // 穿越检查
  const hits = [];
  for (const [sym, conf] of Object.entries(config.levels)) {
    const cur = quotes[sym]?.p, last = state.lastPrices[sym];
    if (cur == null || last == null) continue;
    conf.lines.forEach((line, i) => {
      if ((last - line) * (cur - line) < 0) {
        const dir = cur > line ? "上穿" : "下破";
        hits.push(`**$${sym}** ${dir} **${line}**（${conf.labels[i]}）→ 现价 ${cur}`);
      }
    });
  }

  // Discord 推送（仅盘中数据新鲜时，避免休市误报）
  if (hits.length && marketFresh && config.discord_webhook) {
    const body = {
      username: "Tigris观点追踪",
      embeds: [{
        title: "🎯 行动点触发",
        description: hits.join("\n") + "\n\n含义见看板「行动清单」。博主观点记录，非投资建议。",
        color: 16763978
      }]
    };
    const r = await fetch(config.discord_webhook, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    console.log("discord:", r.status, hits.length, "hits");
  } else {
    console.log("no alerts. hits:", hits.length, "fresh:", marketFresh);
  }

  // 写 quotes.json（页面动态读取）与状态
  const bj = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 16);
  fs.writeFileSync("quotes.json", JSON.stringify({
    quoteDate: `${bj} 北京时间${marketFresh ? "（盘中）" : "（收盘）"}`, quotes
  }, null, 1));
  Object.assign(state.lastPrices, Object.fromEntries(Object.entries(quotes).map(([k, v]) => [k, v.p])));
  state.last_check = bj;
  fs.writeFileSync("alert_state.json", JSON.stringify(state, null, 1));
  console.log("updated", Object.keys(quotes).length, "quotes @", bj);
})();
