# Discord Q&A Bot

This dashboard exposes a Cloudflare Pages Function for Discord slash-command Q&A.

## Endpoint

Use this as the Discord Interactions Endpoint URL:

```text
https://tigris-dashboard.pages.dev/api/discord
```

## Cloudflare environment variable

Set this secret in Cloudflare Pages:

```text
DISCORD_PUBLIC_KEY=<Discord Developer Portal public key>
```

Because the dashboard is protected by Cloudflare Access, `/api/discord` must be public or bypassed for Discord. In Cloudflare Zero Trust, add a bypass/public rule for:

```text
tigris-dashboard.pages.dev/api/discord
```

Keep the dashboard pages protected; only the Discord interaction endpoint needs to be reachable by Discord.

## Register the command

Register `/tigris` with:

```bash
DISCORD_APPLICATION_ID=... DISCORD_BOT_TOKEN=... node scripts/register-discord-command.js
```

For faster testing in one server, add:

```bash
DISCORD_GUILD_ID=...
```

The command option is `question`, with Chinese localization as `问题`.

## Keep data in sync

When the dashboard `DATA` block in `index.html` changes, refresh the bot data module:

```bash
node scripts/sync-discord-data.js
```

Then commit `index.html` and `functions/_data.js` together.

Runtime quote updates still read `/quotes.json`, so market prices can update without rebuilding the function.
