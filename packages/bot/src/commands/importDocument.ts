import type { Bot } from "grammy";
import { eq, and } from "drizzle-orm";
import { schema, type Database, importTournamentExport } from "@poker/shared";

/**
 * Owner-only offline → cloud sync: the TD exports a finished tournament as a
 * file from the local (offline) TD panel (the "Выгрузить" button, owner-only
 * — see docs/OFFLINE.md) and sends that file straight to this bot in a
 * private chat. No SSH/CLI step needed — same import logic as the
 * importTournament.ts script, just triggered by a Telegram document instead.
 */
export function registerImportDocumentHandler(bot: Bot, db: Database) {
  bot.on("message:document", async (ctx) => {
    if (ctx.chat.type !== "private") return;

    const doc = ctx.message.document;
    const looksLikeJson = doc.file_name?.toLowerCase().endsWith(".json") || doc.mime_type === "application/json";
    if (!looksLikeJson) return;

    const telegramId = String(ctx.from?.id ?? "");
    const [club] = await db.select().from(schema.clubs).limit(1);
    if (!club) return;

    const [staff] = await db
      .select()
      .from(schema.staffAccounts)
      .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.telegramId, telegramId)));

    // Not staff at all — stay silent, this is likely an unrelated file from
    // an ordinary player, not an attempt to use this feature.
    if (!staff) return;
    if (staff.role !== "owner") {
      await ctx.reply("⛔ Перенести результаты турнира в облако может только владелец клуба.");
      return;
    }

    await ctx.reply("⏳ Обрабатываю файл турнира…");
    try {
      const file = await ctx.getFile();
      const url = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`не удалось скачать файл у Telegram (${res.status})`);
      const raw = await res.json();

      const result = await importTournamentExport(db, club.id, raw);
      if (!result.imported) {
        await ctx.reply(`⚠️ Турнир «${result.name}» уже был перенесён ранее — пропускаю.`);
        return;
      }
      await ctx.reply(
        `✅ Турнир «${result.name}» перенесён в облако.\n` +
          `Игроков: ${result.counts.players}, результатов: ${result.counts.results}, ` +
          `нокаутов: ${result.counts.knockouts}, начислений рейтинга: ${result.counts.rpsLedger}.`,
      );
    } catch (err) {
      await ctx.reply(`❌ Не удалось перенести турнир: ${(err as Error).message}`);
    }
  });
}
