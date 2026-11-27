import { and, eq } from "drizzle-orm";
import { Bot } from "grammy";
import { schema, type Database } from "@poker/shared";

export interface BroadcastResult {
  sent: number;
  failed: number;
}

/**
 * The api process has no running bot (that's a separate container) — grammY's
 * `.api` is just a thin HTTP client over Bot API, so a bare `Bot` instance
 * works fine here for one-off sends with no polling/webhook involved. Lazy
 * singleton: constructed on first use, not at module load, so a missing
 * BOT_TOKEN only breaks broadcasting, not every route.
 */
let bot: Bot | null = null;
function getBot(): Bot {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error("BOT_TOKEN is not set");
  if (!bot) bot = new Bot(token);
  return bot;
}

/**
 * Sends a club-news message to every member, respecting the same
 * telegram_dm opt-out toggle the tournament reminder job already honors (see
 * jobs/reminders.ts in packages/bot — no row = never touched the toggle =
 * default on). A blocked/deleted chat for one player doesn't abort the rest.
 */
export async function sendBroadcast(db: Database, clubId: string, text: string): Promise<BroadcastResult> {
  const members = await db
    .select({ telegramId: schema.players.telegramId, playerId: schema.players.id })
    .from(schema.clubMemberships)
    .innerJoin(schema.players, eq(schema.players.id, schema.clubMemberships.playerId))
    .where(eq(schema.clubMemberships.clubId, clubId));

  const telegramBot = getBot();
  let sentCount = 0;
  let failedCount = 0;

  for (const member of members) {
    const [sub] = await db
      .select()
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.playerId, member.playerId), eq(schema.pushSubscriptions.type, "telegram_dm")));
    if (sub && !sub.enabled) continue;

    try {
      await telegramBot.api.sendMessage(member.telegramId, text);
      sentCount += 1;
    } catch (err) {
      console.error(`Broadcast failed for ${member.telegramId}:`, err);
      failedCount += 1;
    }
  }

  return { sent: sentCount, failed: failedCount };
}

/**
 * One-off DM to a single player (e.g. "you've been moved off the waitlist
 * into the tournament"), same opt-out check as sendBroadcast. Never throws —
 * callers fire this from inside a mutation that must succeed regardless of
 * whether Telegram delivery does (missing BOT_TOKEN, blocked bot, synthetic
 * local-* walk-in identity with no real chat behind it, etc.).
 */
export async function sendDirectMessage(db: Database, playerId: string, text: string): Promise<boolean> {
  const [player] = await db.select({ telegramId: schema.players.telegramId }).from(schema.players).where(eq(schema.players.id, playerId));
  if (!player) return false;

  const [sub] = await db
    .select()
    .from(schema.pushSubscriptions)
    .where(and(eq(schema.pushSubscriptions.playerId, playerId), eq(schema.pushSubscriptions.type, "telegram_dm")));
  if (sub && !sub.enabled) return false;

  try {
    await getBot().api.sendMessage(player.telegramId, text);
    return true;
  } catch (err) {
    console.error(`DM failed for player ${playerId}:`, err);
    return false;
  }
}
