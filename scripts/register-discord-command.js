#!/usr/bin/env node

const appId = process.env.DISCORD_APPLICATION_ID;
const botToken = process.env.DISCORD_BOT_TOKEN;
const guildId = process.env.DISCORD_GUILD_ID;

if (!appId || !botToken) {
  console.error("Missing DISCORD_APPLICATION_ID or DISCORD_BOT_TOKEN.");
  process.exit(1);
}

const command = {
  name: "tigris",
  description: "Ask the Tigris viewpoint dashboard",
  description_localizations: {
    "zh-CN": "向 Tigris 观点库提问"
  },
  options: [
    {
      type: 3,
      name: "question",
      name_localizations: {
        "zh-CN": "问题"
      },
      description: "Question to ask, for example: MU 财报后怎么看？",
      description_localizations: {
        "zh-CN": "要问的问题，例如：MU 财报后怎么看？"
      },
      required: true
    }
  ]
};

const route = guildId
  ? `applications/${appId}/guilds/${guildId}/commands`
  : `applications/${appId}/commands`;

fetch(`https://discord.com/api/v10/${route}`, {
  method: "POST",
  headers: {
    "Authorization": `Bot ${botToken}`,
    "Content-Type": "application/json"
  },
  body: JSON.stringify(command)
}).then(async r => {
  const text = await r.text();
  if (!r.ok) {
    console.error(`Discord API ${r.status}: ${text}`);
    process.exit(1);
  }
  console.log(guildId ? "Guild command registered." : "Global command registered.");
  console.log(text);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
