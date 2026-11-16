import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { TournamentExportData } from "./tournamentExport.js";

export interface TournamentImportResult {
  imported: boolean;
  tournamentId: string;
  name: string;
  counts: { players: number; results: number; knockouts: number; rpsLedger: number };
}

/**
 * Throws a plain, human-readable error for anything that isn't shaped like a
 * file buildTournamentExport() produced, rather than letting a malformed
 * upload (e.g. a Telegram-forwarded unrelated .json) crash deep inside the
 * insert logic below.
 */
function assertExportShape(raw: unknown): asserts raw is TournamentExportData {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Это не файл экспорта турнира (ожидался JSON-объект)");
  }
  const data = raw as Record<string, unknown>;
  const tournament = data.tournament as Record<string, unknown> | undefined;
  if (typeof tournament !== "object" || tournament === null || typeof tournament.name !== "string") {
    throw new Error("Это не файл экспорта турнира (нет данных турнира)");
  }
  for (const key of ["blindLevels", "players", "registrations", "results", "knockouts", "rebuys", "rpsLedger"]) {
    if (!Array.isArray(data[key])) {
      throw new Error(`Это не файл экспорта турнира (отсутствует поле "${key}")`);
    }
  }
}

/**
 * Recreates a tournament exported by buildTournamentExport() in this (cloud)
 * database: matches each referenced player by telegramId, inserting a new
 * player/membership for any that don't exist yet (every walk-in, plus any
 * real player not yet seen in this DB), then re-inserts the tournament and
 * everything under it with fresh ids, copying `rpsAwarded`/ledger deltas
 * as-is rather than recomputing them. Idempotent: skips (does not duplicate)
 * a tournament already imported, matched by name + scheduledAt. Shared by
 * the offline → cloud CLI script and the bot's document-upload handler.
 */
export async function importTournamentExport(db: Database, clubId: string, raw: unknown): Promise<TournamentImportResult> {
  assertExportShape(raw);
  const { tournament, blindLevels, players, registrations, results, knockouts, rebuys, rpsLedger } = raw;

  const scheduledAt = new Date(tournament.scheduledAt);
  const [existingTournament] = await db
    .select()
    .from(schema.tournaments)
    .where(
      and(
        eq(schema.tournaments.clubId, clubId),
        eq(schema.tournaments.name, tournament.name),
        eq(schema.tournaments.scheduledAt, scheduledAt),
      ),
    );
  if (existingTournament) {
    return {
      imported: false,
      tournamentId: existingTournament.id,
      name: tournament.name,
      counts: { players: 0, results: 0, knockouts: 0, rpsLedger: 0 },
    };
  }

  const playerIdMap = new Map<string, string>();
  for (const p of players) {
    const [existingPlayer] = await db.select().from(schema.players).where(eq(schema.players.telegramId, p.telegramId));
    let player = existingPlayer;
    if (!player) {
      [player] = await db
        .insert(schema.players)
        .values({
          telegramId: p.telegramId,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          derivedEmail: p.telegramId.startsWith("local-")
            ? `local_${crypto.randomUUID()}@local.user`
            : `telegram_${p.telegramId}@telegram.user`,
        })
        .returning();
    }
    playerIdMap.set(p.localId, player.id);

    const [membership] = await db
      .select()
      .from(schema.clubMemberships)
      .where(and(eq(schema.clubMemberships.clubId, clubId), eq(schema.clubMemberships.playerId, player.id)));
    if (!membership) {
      await db.insert(schema.clubMemberships).values({ clubId, playerId: player.id, cardId: crypto.randomUUID() });
    }
  }

  const [newTournament] = await db
    .insert(schema.tournaments)
    .values({
      clubId,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      archived: tournament.archived,
      scheduledAt,
      buyIn: tournament.buyIn,
      startingStack: tournament.startingStack,
      maxSeats: tournament.maxSeats,
      maxSeatsPerTable: tournament.maxSeatsPerTable,
      lateRegUntilLevel: tournament.lateRegUntilLevel,
      reentryAllowedUntilLevel: tournament.reentryAllowedUntilLevel,
      reentryPrice: tournament.reentryPrice,
      addonPrice: tournament.addonPrice,
      addonStack: tournament.addonStack,
      addonAvailableLevel: tournament.addonAvailableLevel,
      addonMaxCount: tournament.addonMaxCount,
      arriveBonusStack: tournament.arriveBonusStack,
      rpsFormulaParams: tournament.rpsFormulaParams,
    })
    .returning();

  if (blindLevels.length) {
    await db.insert(schema.blindLevels).values(
      blindLevels.map((l) => ({
        tournamentId: newTournament.id,
        levelNumber: l.levelNumber,
        smallBlind: l.smallBlind,
        bigBlind: l.bigBlind,
        ante: l.ante,
        durationMinutes: l.durationMinutes,
        isBreak: l.isBreak,
      })),
    );
  }

  if (registrations.length) {
    await db.insert(schema.registrations).values(
      registrations.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        status: r.status,
        currentStack: r.currentStack,
        arrivedBeforeLateReg: r.arrivedBeforeLateReg,
        registeredAt: new Date(r.registeredAt),
      })),
    );
  }

  if (results.length) {
    await db.insert(schema.tournamentResults).values(
      results.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        place: r.place,
        rpsAwarded: r.rpsAwarded,
        knockoutsCount: r.knockoutsCount,
        bountyPoints: r.bountyPoints,
        payout: r.payout,
        publishedAt: new Date(r.publishedAt),
      })),
    );
  }

  if (knockouts.length) {
    await db.insert(schema.knockouts).values(
      knockouts.map((k) => ({
        tournamentId: newTournament.id,
        eliminatedPlayerId: playerIdMap.get(k.eliminatedPlayerId)!,
        eliminatedByPlayerId: k.eliminatedByPlayerId ? playerIdMap.get(k.eliminatedByPlayerId)! : null,
        levelNumber: k.levelNumber,
        createdAt: new Date(k.createdAt),
      })),
    );
  }

  if (rebuys.length) {
    await db.insert(schema.rebuyAddonTransactions).values(
      rebuys.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        type: r.type,
        amount: r.amount,
        stackGranted: r.stackGranted,
        levelNumberAtPurchase: r.levelNumberAtPurchase,
        createdAt: new Date(r.createdAt),
      })),
    );
  }

  if (rpsLedger.length) {
    await db.insert(schema.rpsLedger).values(
      rpsLedger.map((l) => ({
        playerId: playerIdMap.get(l.playerId)!,
        clubId,
        tournamentId: newTournament.id,
        delta: l.delta,
        reason: l.reason,
        createdAt: new Date(l.createdAt),
      })),
    );
  }

  return {
    imported: true,
    tournamentId: newTournament.id,
    name: tournament.name,
    counts: {
      players: players.length,
      results: results.length,
      knockouts: knockouts.length,
      rpsLedger: rpsLedger.length,
    },
  };
}
