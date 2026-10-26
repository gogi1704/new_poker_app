import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env.local") });

import { createServer } from "node:http";
import { Bot, webhookCallback } from "grammy";
import { createDb } from "@poker/shared";
import { registerStartCommand } from "./commands/start.js";
import { registerTdCommand } from "./commands/td.js";
import { startReminderJob } from "./jobs/reminders.js";

const botToken = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_PLAYER_PUBLIC_URL;
const webTdUrl = process.env.WEB_TD_PUBLIC_URL;
const databaseUrl = process.env.DATABASE_URL;

if (!botToken) throw new Error("BOT_TOKEN is not set");
if (!webAppUrl) throw new Error("WEB_PLAYER_PUBLIC_URL is not set (HTTPS tunnel required by Telegram)");
if (!databaseUrl) throw new Error("DATABASE_URL is not set");

const bot = new Bot(botToken);
const db = createDb(databaseUrl);

registerStartCommand(bot, webAppUrl);
startReminderJob(bot, db);
if (webTdUrl) {
  registerTdCommand(bot, db, webTdUrl);
} else {
  console.warn("WEB_TD_PUBLIC_URL not set — /td command disabled");
}

bot.catch((err) => console.error("Bot error:", err));

// Local dev always uses long polling (no public URL needed). Production sets
// BOT_WEBHOOK_URL (the public HTTPS address Telegram should POST updates to)
// to switch modes instead — the two are mutually exclusive on Telegram's side
// (setWebhook disables getUpdates), so this never runs both at once.
const webhookUrl = process.env.BOT_WEBHOOK_URL;

if (webhookUrl) {
  const port = Number(process.env.BOT_WEBHOOK_PORT ?? 3002);
  // The webhook endpoint is public once behind the reverse proxy, so a secret
  // token is required — grammY checks it against Telegram's
  // X-Telegram-Bot-Api-Secret-Token header and rejects anything else (e.g. a
  // random POST from the internet trying to inject fake updates).
  const webhookSecret = process.env.BOT_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("BOT_WEBHOOK_SECRET is not set (required when BOT_WEBHOOK_URL is set)");

  // grammY's "http" adapter JSON.parses the request body inside a raw
  // `req.once("end", ...)` listener, not inside the promise it hands back —
  // a throw there (e.g. a GET with no body) becomes a genuine uncaught
  // exception that bypasses any try/catch around the handler call and
  // crashes the whole process. Confirmed in production: a plain GET to the
  // public webhook URL took the bot down. The POST-only check below avoids
  // this for anything Telegram wouldn't send in the first place; this
  // process-level handler is the last-resort net for whatever that check
  // doesn't catch.
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception in webhook server:", err);
  });

  await bot.init();
  await bot.api.setWebhook(webhookUrl, { secret_token: webhookSecret });

  // bot.catch() does not reliably stop a processing error from rejecting the
  // promise webhookCallback's own request handler returns — confirmed by
  // testing locally: an update that fails mid-handler (e.g. a transient
  // Telegram API error) became an *unhandled* rejection and crashed the whole
  // process. Wrapping the handler here is the actual safety net: any error
  // gets logged and we still ack 200 to Telegram so it doesn't endlessly retry
  // the same update, instead of taking the bot offline.
  const rawHandler = webhookCallback(bot, "http", { secretToken: webhookSecret });
  const server = createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(200).end();
      return;
    }
    try {
      await rawHandler(req, res);
    } catch (err) {
      console.error("Webhook handler error:", err);
      if (!res.headersSent) res.writeHead(200).end();
    }
  });
  server.listen(port, () => {
    console.log(`Bot listening for webhook updates on :${port}, registered as ${webhookUrl}`);
  });
} else {
  await bot.api.deleteWebhook().catch(() => {});
  bot.start();
  console.log("Bot started (long polling)");
}
