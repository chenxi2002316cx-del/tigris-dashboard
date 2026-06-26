import { DATA } from "../_data.js";
import { answerQuestion, trimDiscord } from "../_qa.js";

const InteractionType = {
  PING: 1,
  APPLICATION_COMMAND: 2
};

const InteractionResponseType = {
  PONG: 1,
  CHANNEL_MESSAGE_WITH_SOURCE: 4
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function hexToBytes(hex) {
  const clean = (hex || "").trim();
  if (!clean || clean.length % 2) return null;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  return out;
}

async function verifyDiscordRequest(request, publicKey) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const body = await request.text();
  if (!signature || !timestamp || !publicKey) return { ok: false, body };

  const keyBytes = hexToBytes(publicKey);
  const sigBytes = hexToBytes(signature);
  if (!keyBytes || !sigBytes) return { ok: false, body };

  const key = await crypto.subtle.importKey("raw", keyBytes, "Ed25519", false, ["verify"]);
  const data = new TextEncoder().encode(timestamp + body);
  const ok = await crypto.subtle.verify("Ed25519", key, sigBytes, data);
  return { ok, body };
}

function commandQuestion(interaction) {
  const options = interaction?.data?.options || [];
  const direct = options.find(o => o.name === "question" || o.name === "q");
  if (direct?.value) return direct.value;
  return options.map(o => o.value).filter(Boolean).join(" ").trim();
}

async function dataWithFreshQuotes(request) {
  const data = structuredClone(DATA);
  try {
    const url = new URL("/quotes.json", request.url);
    const r = await fetch(url.toString(), { cf: { cacheTtl: 30, cacheEverything: false } });
    if (r.ok) {
      const q = await r.json();
      if (q?.quotes) Object.keys(q.quotes).forEach(k => Object.assign(data.quotes[k] = data.quotes[k] || {}, q.quotes[k]));
      if (q?.quoteDate) data.quoteDate = q.quoteDate;
    }
  } catch {
    // Keep the embedded snapshot if live quotes are temporarily unavailable.
  }
  return data;
}

export async function onRequestPost({ request, env }) {
  if (!env.DISCORD_PUBLIC_KEY) return json({ error: "DISCORD_PUBLIC_KEY is not configured" }, 500);

  let verified;
  try {
    verified = await verifyDiscordRequest(request, env.DISCORD_PUBLIC_KEY);
  } catch (e) {
    return json({ error: "signature verification failed" }, 401);
  }
  if (!verified.ok) return json({ error: "invalid request signature" }, 401);

  const interaction = JSON.parse(verified.body);
  if (interaction.type === InteractionType.PING) return json({ type: InteractionResponseType.PONG });

  if (interaction.type !== InteractionType.APPLICATION_COMMAND) {
    return json({ error: "unsupported interaction type" }, 400);
  }

  const question = commandQuestion(interaction);
  const data = await dataWithFreshQuotes(request);
  const content = trimDiscord(answerQuestion(question, data));

  return json({
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content,
      allowed_mentions: { parse: [] }
    }
  });
}

export function onRequestGet() {
  return json({
    ok: true,
    name: "Tigris Discord Q&A",
    usage: "Configure this URL as the Discord Interactions Endpoint, then register /tigris."
  });
}
