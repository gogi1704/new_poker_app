import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { eq, and } from "drizzle-orm";
import { schema, type Database } from "@poker/shared";

export function registerTdCommand(bot: Bot, db: Database, webTdUrl: string) {
  bot.command("td", async (ctx) => {
    const telegramId = String(ctx.from?.id ?? "");
    const [club] = await db.select().from(schema.clubs).limit(1);
    const [staff] = club
      ? await db
          .select()
          .from(schema.staffAccounts)
          .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.telegramId, telegramId)))
      : [];

    if (!staff) {
      await ctx.reply("⛔ У вас нет доступа к панели организатора.");
      return;
    }

    const keyboard = new InlineKeyboard().webApp("🛠 Открыть TD-панель", webTdUrl);
    await ctx.reply(`🛠 <b>Панель организатора</b>\nРоль: ${staff.role}`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  });
}
