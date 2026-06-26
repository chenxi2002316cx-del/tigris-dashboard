const SLBL = { bull: "看多/核心仓", bear: "看空", trade: "波段/事件" };
const VS = { hit: "已验证", part: "部分/进行中", miss: "未达成", watch: "观察中" };

function norm(s) {
  return (s || "").toString().toLowerCase();
}

function textCut(s, n = 180) {
  s = (s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n) + "..." : s;
}

function sourceLabel(k) {
  return k === "subs" ? "订阅专享" :
    k === "art" ? "周报/长文" :
    k === "ticker" ? "标的卡" :
    k === "action" ? "行动线索" :
    k === "theme" ? "方法论" : "公开";
}

function judge(t, data) {
  const q = data.quotes[t.tk] || {};
  const v = t.verdict || {};
  const p = q.p;
  if (!p) return { s: "watch", txt: v.note || "暂无最新行情快照，先按观点库观察。" };
  if (v.type === "range") {
    if (p >= v.lo && p <= v.hi) return { s: "hit", txt: `进入目标区 ${v.lo}-${v.hi}，现价 ${p}` };
    if (p > v.hi) return { s: "hit", txt: `超出目标区上沿 ${v.hi}，现价 ${p}${v.bull ? `，bull情景 ${v.bull}` : ""}` };
    const gap = ((v.lo / p - 1) * 100).toFixed(0);
    if (v.entry && p > v.entry) return { s: "part", txt: `方向正确，距目标区 ${v.lo} 还差约 ${gap}%` };
    return { s: "miss", txt: `未达目标区 ${v.lo}-${v.hi}，现价 ${p}` };
  }
  if (v.type === "band") {
    if (p >= v.mid && p <= v.hi) return { s: "hit", txt: `${v.lo}买入到${v.mid}目标已兑现，现价 ${p} 处于 ${v.mid}-${v.hi}` };
    if (p > v.hi) return { s: "part", txt: `现价 ${p} 突破其 ${v.hi} 上限判断` };
    return { s: "part", txt: `现价 ${p}，回落至 ${v.mid} 目标下方` };
  }
  if (v.type === "mcap") {
    const m = q.mcap;
    if (m && m >= v.target) return { s: "hit", txt: `市值约 ${m} 万亿，达到其 ${v.target} 万亿框架` };
    return { s: "part", txt: m ? `市值约 ${m} 万亿，距 ${v.target} 万亿仍有空间` : v.note || "按估值框架继续观察" };
  }
  if (v.type === "done") return { s: "hit", txt: v.note || "事件已兑现" };
  if (v.type === "event") return { s: "part", txt: v.note || "事件驱动观察中" };
  return { s: "watch", txt: v.note || "观察中" };
}

function qaCorpus(data) {
  const docs = [];
  data.posts.forEach(p => {
    const art = data.articles.find(a => a.id === p.id);
    docs.push({
      kind: p.k,
      id: p.id,
      dt: "2026-" + p.dt,
      title: sourceLabel(p.k),
      text: p.t + (art ? "\n" + art.title + "\n" + art.text : ""),
      url: "https://x.com/tig88411109/status/" + p.id
    });
  });
  data.tickers.forEach(t => {
    const j = judge(t, data);
    const q = data.quotes[t.tk] || {};
    docs.push({
      kind: "ticker",
      id: t.tk,
      dt: data.quoteDate,
      title: "$" + t.tk + " · " + t.name,
      text: [
        "$" + t.tk, t.name, SLBL[t.stance], VS[j.s], j.txt, ...(t.calls || []),
        ...(t.events || []).map(e => e.d + " " + e.t),
        q.p ? "现价 " + q.p + " 涨跌 " + q.chg + "%" : ""
      ].join("\n")
    });
  });
  data.actions.forEach(a => docs.push({
    kind: "action",
    id: a.tk || "macro",
    dt: a.src,
    title: (a.tk && a.tk !== "宏观" && a.tk !== "纪律" ? "$" + a.tk + " " : "") + "行动线索",
    text: [a.cond, a.act, a.src].join("\n")
  }));
  data.themes.forEach(t => docs.push({
    kind: "theme",
    id: t.id,
    dt: "方法论",
    title: t.label,
    text: t.label + "\n" + t.info + "\n" + (t.links || []).join(" ")
  }));
  return docs;
}

function qaTerms(q, data) {
  const out = new Set();
  const raw = q.trim();
  (raw.match(/\$?[A-Za-z]{2,6}/g) || []).forEach(x => out.add(x.replace("$", "").toLowerCase()));
  data.tickers.forEach(t => {
    if (raw.includes(t.name) || raw.toUpperCase().includes(t.tk)) {
      out.add(t.tk.toLowerCase());
      out.add(t.name.toLowerCase());
    }
  });
  raw.replace(/[A-Za-z0-9_$\s]/g, "").split(/[，。！？、：；（）()]/).filter(Boolean).forEach(seg => {
    if (seg.length <= 4) out.add(seg);
    for (let i = 0; i < seg.length - 1; i++) out.add(seg.slice(i, i + 2));
  });
  ["AI", "泡沫", "核心仓", "战术仓", "现金", "风险", "财报", "利率", "PCE", "FOMC"].forEach(k => {
    if (raw.toUpperCase().includes(k.toUpperCase())) out.add(k.toLowerCase());
  });
  return [...out].filter(x => x.length > 1);
}

function scoreDoc(doc, terms, q) {
  const hay = norm(doc.title + "\n" + doc.text);
  const qq = norm(q);
  let s = 0;
  terms.forEach(t => { if (hay.includes(norm(t))) s += t.length > 3 ? 5 : 2; });
  if (hay.includes(qq)) s += 10;
  if (doc.kind === "ticker" && terms.some(t => doc.id.toLowerCase() === t)) s += 14;
  if (doc.kind === "action" && terms.some(t => doc.id.toLowerCase() === t)) s += 8;
  if (doc.kind === "art") s += 1;
  return s;
}

function findTicker(q, data) {
  const up = q.toUpperCase();
  return data.tickers.find(t => up.includes("$" + t.tk) || up.split(/[^A-Z]/).includes(t.tk) || q.includes(t.name));
}

function topDocs(q, data, limit = 5) {
  const terms = qaTerms(q, data);
  return qaCorpus(data).map(d => ({ ...d, _s: scoreDoc(d, terms, q) }))
    .filter(d => d._s > 0).sort((a, b) => b._s - a._s).slice(0, limit);
}

function actionLines(tk, data) {
  return data.actions.filter(a => !tk || a.tk === tk).slice(0, 3)
    .map(a => `- ${a.cond} -> ${a.act}`).join("\n");
}

function answerTicker(t, docs, data) {
  const q = data.quotes[t.tk] || {};
  const j = judge(t, data);
  const posts = data.posts.filter(p => p.t.includes("$" + t.tk) || p.t.includes(t.name)).slice(0, 2);
  const lines = [];
  lines.push(`**$${t.tk} · ${t.name}**`);
  lines.push(`老师立场：${SLBL[t.stance]}；验证状态：${VS[j.s]}。`);
  if (q.p) lines.push(`当前：${q.p}，${q.chg >= 0 ? "+" : ""}${q.chg}%（${data.quoteDate}）。`);
  lines.push(`判断：${j.txt}`);
  (t.calls || []).slice(0, 3).forEach(x => lines.push(`- ${x}`));
  const acts = actionLines(t.tk, data);
  if (acts) lines.push(`\n行动线索：\n${acts}`);
  if (posts.length) lines.push(`\n相关原文：\n${posts.map(p => `- 2026-${p.dt}：${textCut(p.t, 90)}`).join("\n")}`);
  return lines.join("\n");
}

function answerGeneral(q, docs) {
  if (!docs.length) return "没有找到足够依据。可以换一个更具体的问题，或带上标的代码、事件名、关键词。";
  return [
    "**基于已收录材料的回答**",
    ...docs.slice(0, 4).map(d => `- **${d.title}**：${textCut(d.text, 120)}`)
  ].join("\n");
}

function renderSources(docs) {
  if (!docs.length) return "";
  return "\n\n依据：\n" + docs.slice(0, 3).map(d => {
    const link = d.url ? ` ${d.url}` : "";
    return `- ${sourceLabel(d.kind)} ${d.dt || ""}${link}`;
  }).join("\n");
}

export function answerQuestion(question, data) {
  const q = (question || "").trim();
  if (!q) return "先输入一个问题，例如：MU 财报后怎么看？";
  const docs = topDocs(q, data, 6);
  const ticker = findTicker(q, data);
  const body = ticker ? answerTicker(ticker, docs, data) : answerGeneral(q, docs);
  return [
    body,
    "\n我的整理：这是对老师已收录观点的检索归纳，不是新增原话；不构成投资建议，具体操作需要你自己决策。",
    renderSources(docs)
  ].join("");
}

export function trimDiscord(content, limit = 1900) {
  if (content.length <= limit) return content;
  return content.slice(0, limit - 86).trim() + "\n\n内容较长，已截断；完整观点请看 https://tigris-dashboard.pages.dev/";
}
