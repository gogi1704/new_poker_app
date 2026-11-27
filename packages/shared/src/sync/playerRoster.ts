import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface PlayerRosterEntry {
  telegramId: string;
  nickname: string;
  avatarUrl: string | null;
}

/**
 * Finds or creates a player by telegramId, keeping nickname/avatar current
 * when they already exist — a re-sync should reflect a nickname change, not
 * freeze whatever was first seen — and ensures the club membership row.
 * Shared by the tournament import's player matching (tournamentImport.ts)
 * and the standalone player-roster mirror below.
 */
export async function upsertPlayerByTelegramId(
  db: Database,
  clubId: string,
  entry: PlayerRosterEntry,
): Promise<string> {
  const [player] = await db
    .insert(schema.players)
    .values({
      telegramId: entry.telegramId,
      nickname: entry.nickname,
      avatarUrl: entry.avatarUrl,
      derivedEmail: entry.telegramId.startsWith("local-")
        ? `local_${randomUUID()}@local.user`
        : `telegram_${entry.telegramId}@telegram.user`,
    })
    .onConflictDoUpdate({
      target: schema.players.telegramId,
      set: { nickname: entry.nickname, avatarUrl: entry.avatarUrl },
    })
    .returning();

  const [membership] = await db
    .select()
    .from(schema.clubMemberships)
    .where(and(eq(schema.clubMemberships.clubId, clubId), eq(schema.clubMemberships.playerId, player.id)));
  if (!membership) {
    await db.insert(schema.clubMemberships).values({ clubId, playerId: player.id, cardId: randomUUID() });
  }

  return player.id;
}

/**
 * The full list of a club's bot users (everyone who ever opened the bot and
 * has a membership here) — not scoped to any one tournament's registrations.
 * Exported as-is to the offline launcher so it can mirror the whole roster
 * onto the laptop while online, letting the TD find an existing player by
 * nickname during check-in even offline, instead of only ever being able to
 * create a brand-new synthetic walk-in identity for them.
 */
export async function buildPlayerRosterExport(db: Database, clubId: string): Promise<PlayerRosterEntry[]> {
  return db
    .select({
      telegramId: schema.players.telegramId,
      nickname: schema.players.nickname,
      avatarUrl: schema.players.avatarUrl,
    })
    .from(schema.players)
    .innerJoin(schema.clubMemberships, eq(schema.clubMemberships.playerId, schema.players.id))
    .where(eq(schema.clubMemberships.clubId, clubId));
}

export async function importPlayerRoster(db: Database, clubId: string, raw: unknown): Promise<{ count: number }> {
  if (!Array.isArray(raw)) throw new Error("Это не список игроков (ожидался массив)");
  for (const entry of raw) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof (entry as Record<string, unknown>).telegramId !== "string" ||
      typeof (entry as Record<string, unknown>).nickname !== "string"
    ) {
      throw new Error("Это не список игроков (повреждена запись)");
    }
    const e = entry as Record<string, unknown>;
    await upsertPlayerByTelegramId(db, clubId, {
      telegramId: e.telegramId as string,
      nickname: e.nickname as string,
      avatarUrl: typeof e.avatarUrl === "string" ? e.avatarUrl : null,
    });
  }
  return { count: raw.length };
}
