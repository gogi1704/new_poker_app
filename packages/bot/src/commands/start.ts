import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";

export function registerStartCommand(bot: Bot, webAppUrl: string) {
  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("🃏 Войти в клуб", webAppUrl);

    await ctx.reply(
      [
        "🏛 <b>ПОКЕР КЛУБ</b>",
        "",
        "👋 Добро пожаловать!",
        "",
        "🗓 Афиша турниров",
        "✍️ Запись в один тап",
        "👤 Личный профиль",
        "🏆 Клубный рейтинг",
        "📊 Игровая статистика",
      ].join("\n"),
      { parse_mode: "HTML", reply_markup: keyboard },
    );
  });
}
