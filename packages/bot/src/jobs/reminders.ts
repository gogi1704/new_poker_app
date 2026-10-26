import cron from "node-cron";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import type { Bot } from "grammy";
import { schema, type Database } from "@poker/shared";

const REMINDER_WINDOW_MINUTES = 60;
// Must match the cron interval below — each tournament's scheduledAt falls into
// exactly one 5-minute band as time passes, so this doubles as de-duplication
// without a separate "reminder sent" column.
const BAND_MINUTES = 5;

export async function sendReminders(bot: Bot, db: Database) {
  const now = new Date();
  const windowStart = new Date(now.getTime() + (REMINDER_WINDOW_MINUTES - BAND_MINUTES) * 60_000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MINUTES * 60_000);

  const tournaments = await db
    .select()
    .from(schema.tournaments)
    .where(
      and(
        gte(schema.tournaments.scheduledAt, windowStart),
        lt(schema.tournaments.scheduledAt, windowEnd),
        ne(schema.tournaments.status, "finished"),
        ne(schema.tournaments.status, "cancelled"),
      ),
    );

  for (const tournament of tournaments) {
    const registered = await db
      .select({
        telegramId: schema.players.telegramId,
        playerId: schema.players.id,
      })
      .from(schema.registrations)
      .innerJoin(schema.players, eq(schema.players.id, schema.registrations.playerId))
      .where(
        and(eq(schema.registrations.tournamentId, tournament.id), ne(schema.registrations.status, "cancelled")),
      );

    for (const player of registered) {
      const [sub] = await db
        .select()
        .from(schema.pushSubscriptions)
        .where(
          and(eq(schema.pushSubscriptions.playerId, player.playerId), eq(schema.pushSubscriptions.type, "telegram_dm")),
        );
      // No row yet = never touched the toggle = default on.
      if (sub && !sub.enabled) continue;

      try {
        await bot.api.sendMessage(
          player.telegramId,
          `⏰ «${tournament.name}» стартует через час!\nНе забудьте занять место за столом 🃏`,
        );
      } catch (err) {
        console.error(`Failed to send reminder to ${player.telegramId}:`, err);
      }
    }
  }
}

export function startReminderJob(bot: Bot, db: Database) {
  cron.schedule(`*/${BAND_MINUTES} * * * *`, () => {
    sendReminders(bot, db).catch((err) => console.error("Reminder job failed:", err));
  });
  console.log(`Reminder job scheduled (every ${BAND_MINUTES} min)`);
}
