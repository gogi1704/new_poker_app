import type { Bot } from "grammy";
import { InlineKeyboard } from "grammy";
import { buildWebLoginLink } from "../lib/webLogin.js";

export function registerStartCommand(bot: Bot, webAppUrl: string) {
  bot.command("start", async (ctx) => {
    const keyboard = new InlineKeyboard().webApp("🃏 Войти в клуб", webAppUrl);

    // Same destination, reached outside Telegram's WebView (a normal browser
    // tab) — for players who'd rather use the site directly, e.g. on
    // desktop. Mini App button above stays the primary, unchanged entry
    // point (see Phase 12 plan — kept as an alternative, not replaced).
    if (ctx.from) {
      const nickname = ctx.from.username ?? [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ");
      try {
        const link = buildWebLoginLink(webAppUrl, String(ctx.from.id), nickname);
        keyboard.row().url("🌐 Открыть сайт", link);
      } catch (err) {
        console.error("Failed to build web login link:", err);
      }
    }

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
