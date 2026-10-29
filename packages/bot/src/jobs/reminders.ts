import cron from "node-cron";
import { and, eq, gte, lt, ne } from "drizzle-orm";
import { InlineKeyboard, InputFile, type Bot } from "grammy";
import { schema, type Database } from "@poker/shared";
import { renderTournamentCardPng } from "../lib/tournamentCard.js";

const REMINDER_WINDOW_MINUTES = 60;
// Must match the cron interval below — each tournament's scheduledAt falls into
// exactly one 5-minute band as time passes, so this doubles as de-duplication
// without a separate "reminder sent" column.
const BAND_MINUTES = 5;

// Shared with any future notification that needs the same two buttons — the
// register/open choice depends on whether this specific recipient already
// has a seat, the club button never does.
function buildReminderKeyboard(webAppUrl: string, tournamentId: string, isRegistered: boolean) {
  return new InlineKeyboard()
    .webApp(isRegistered ? "Открыть турнир" : "Зарегистрироваться", `${webAppUrl}?tournament=${tournamentId}`)
    .row()
    .webApp("В клуб", webAppUrl);
}

export async function sendReminders(bot: Bot, db: Database, webAppUrl: string) {
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

    if (registered.length === 0) continue;

    let cardPng: Buffer;
    try {
      cardPng = renderTournamentCardPng({
        name: tournament.name,
        format: tournament.format,
        scheduledAt: tournament.scheduledAt,
        buyIn: tournament.buyIn,
        startingStack: tournament.startingStack,
        maxSeats: tournament.maxSeats,
        seatsFilled: registered.length,
        knockoutPoints: tournament.rpsFormulaParams.knockoutPoints,
      });
    } catch (err) {
      console.error(`Failed to render card image for tournament ${tournament.id}:`, err);
      continue;
    }
    const caption = `⏰ «${tournament.name}» стартует через час!\nНе забудьте занять место за столом.`;
    // Every recipient here came from the registrations query above, so the
    // keyboard always shows "Открыть турнир" — kept conditional (not hardcoded)
    // so this stays correct if this function is ever reused for a broader,
    // not-yet-registered audience.
    const keyboard = buildReminderKeyboard(webAppUrl, tournament.id, true);

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
        await bot.api.sendPhoto(player.telegramId, new InputFile(cardPng, "tournament.png"), {
          caption,
          reply_markup: keyboard,
        });
      } catch (err) {
        console.error(`Failed to send reminder to ${player.telegramId}:`, err);
      }
    }
  }
}

export function startReminderJob(bot: Bot, db: Database, webAppUrl: string) {
  cron.schedule(`*/${BAND_MINUTES} * * * *`, () => {
    sendReminders(bot, db, webAppUrl).catch((err) => console.error("Reminder job failed:", err));
  });
  console.log(`Reminder job scheduled (every ${BAND_MINUTES} min)`);
}
