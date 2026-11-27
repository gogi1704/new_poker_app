import { and, eq } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";
import type { TournamentExportData } from "./tournamentExport.js";
import { upsertPlayerByTelegramId } from "./playerRoster.js";

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
  // Older export files (before table/seat layout was added to the sync
  // payload) simply don't have this field — tolerated as "no tables",
  // unlike the fields above which have always been required.
  if (data.tables !== undefined && !Array.isArray(data.tables)) {
    throw new Error(`Это не файл экспорта турнира (поле "tables" повреждено)`);
  }
}

export interface TournamentImportOptions {
  /**
   * "archive" (default): one-time import — skips (does not duplicate) a
   * tournament already present, matched by name + scheduledAt, regardless of
   * its status. Only correct for a destination that could never already
   * have a row for this tournament under any status (e.g. the standalone
   * offline → cloud CLI script, run against a DB that was never the
   * tournament's origin). Used by the offline → cloud CLI script.
   *
   * "sync": the pre-event cloud → local push (the "Загрузить из файла"
   * button) and the bot's post-event offline → cloud import — meant to be
   * re-run repeatedly, but only while the destination hasn't actually
   * started yet (status "scheduled"/"registering"). Refuses to touch one
   * that's already running/paused/finished/cancelled there, so a stray
   * re-run can never clobber real played results.
   *
   * "mirror": the offline-launcher's background auto-pull (cloud → local,
   * while online) — the whole point is to keep a close copy of a
   * tournament that's already running, so unlike "sync" it keeps updating
   * through running/paused too. Only refuses a destination that's already
   * "finished"/"cancelled", i.e. genuinely closed out — never resurrected
   * or corrupted by a late pull.
   */
  mode?: "archive" | "sync" | "mirror";
}

/**
 * Recreates a tournament exported by buildTournamentExport() in this
 * database: matches each referenced player by telegramId, inserting a new
 * player/membership for any that don't exist yet (every walk-in, plus any
 * real player not yet seen in this DB), then re-inserts the tournament and
 * everything under it with fresh ids, copying `rpsAwarded`/ledger deltas
 * as-is rather than recomputing them. See TournamentImportOptions for the
 * two idempotency modes.
 */
export async function importTournamentExport(
  db: Database,
  clubId: string,
  raw: unknown,
  options: TournamentImportOptions = {},
): Promise<TournamentImportResult> {
  assertExportShape(raw);
  const { tournament, blindLevels, clockState, players, registrations, results, knockouts, rebuys, rpsLedger } = raw;
  const tables = raw.tables ?? [];
  const mode = options.mode ?? "archive";

  const scheduledAt = new Date(tournament.scheduledAt);
  // "archive" (one-shot cross-club CLI transplant, no identity relationship
  // between source/destination) still matches by name+scheduledAt, same as
  // always. "sync"/"mirror" match by the source tournament's own id instead
  // — see tournamentExport.ts/Phase 14 of the plan: preserving the id across
  // repeated cloud<->local imports is what lets a single tournament be
  // addressed the same way regardless of which backend answers the request.
  const [existingTournament] =
    mode === "archive"
      ? await db
          .select()
          .from(schema.tournaments)
          .where(
            and(
              eq(schema.tournaments.clubId, clubId),
              eq(schema.tournaments.name, tournament.name),
              eq(schema.tournaments.scheduledAt, scheduledAt),
            ),
          )
      : await db
          .select()
          .from(schema.tournaments)
          .where(and(eq(schema.tournaments.clubId, clubId), eq(schema.tournaments.id, tournament.id)));

  if (existingTournament && mode === "archive") {
    return {
      imported: false,
      tournamentId: existingTournament.id,
      name: tournament.name,
      counts: { players: 0, results: 0, knockouts: 0, rpsLedger: 0 },
    };
  }

  if (existingTournament && mode === "sync" && !["scheduled", "registering"].includes(existingTournament.status)) {
    return {
      imported: false,
      tournamentId: existingTournament.id,
      name: tournament.name,
      counts: { players: 0, results: 0, knockouts: 0, rpsLedger: 0 },
    };
  }

  if (existingTournament && mode === "mirror" && ["finished", "cancelled"].includes(existingTournament.status)) {
    return {
      imported: false,
      tournamentId: existingTournament.id,
      name: tournament.name,
      counts: { players: 0, results: 0, knockouts: 0, rpsLedger: 0 },
    };
  }

  const playerIdMap = new Map<string, string>();
  for (const p of players) {
    const playerId = await upsertPlayerByTelegramId(db, clubId, {
      telegramId: p.telegramId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
    });
    playerIdMap.set(p.localId, playerId);
  }

  const tournamentValues = {
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
  };

  let newTournament: typeof schema.tournaments.$inferSelect;
  if (existingTournament) {
    // mode === "sync" and already validated above as not yet started.
    [newTournament] = await db
      .update(schema.tournaments)
      .set(tournamentValues)
      .where(eq(schema.tournaments.id, existingTournament.id))
      .returning();
    await db.delete(schema.blindLevels).where(eq(schema.blindLevels.tournamentId, newTournament.id));
    await db.delete(schema.registrations).where(eq(schema.registrations.tournamentId, newTournament.id));
    await db.delete(schema.tables).where(eq(schema.tables.tournamentId, newTournament.id));
    // These four were previously only ever inserted, never cleared — a
    // repeated re-import of the same already-existing tournament (the whole
    // point of "mirror" mode, re-run every minute by the offline-launcher's
    // auto-pull against a tournament that's still running) duplicated every
    // knockout/rebuy/result/ledger row on every single cycle instead of
    // replacing them.
    await db.delete(schema.knockouts).where(eq(schema.knockouts.tournamentId, newTournament.id));
    await db.delete(schema.rebuyAddonTransactions).where(eq(schema.rebuyAddonTransactions.tournamentId, newTournament.id));
    await db.delete(schema.tournamentResults).where(eq(schema.tournamentResults.tournamentId, newTournament.id));
    await db.delete(schema.rpsLedger).where(eq(schema.rpsLedger.tournamentId, newTournament.id));
  } else {
    // Preserve the source id on first insert too (sync/mirror only) — so a
    // tournament mirrored for the very first time already matches by id on
    // any later pull/push, not just from the second sync onward.
    [newTournament] = await db
      .insert(schema.tournaments)
      .values({ clubId, ...(mode !== "archive" ? { id: tournament.id } : {}), ...tournamentValues })
      .returning();
  }

  // Tables are matched/remapped by tableNo (not id, same reasoning as player
  // identity): the source and destination databases hand out independent
  // table ids, so a registration's seatTableId below has to be translated
  // through tableNo, not copied as-is.
  const tableIdBySourceId = new Map<string, string>();
  if (tables.length) {
    const insertedTables = await db
      .insert(schema.tables)
      .values(
        tables.map((t) => ({
          tournamentId: newTournament.id,
          tableNo: t.tableNo,
          maxSeats: t.maxSeats,
          isActive: t.isActive,
          label: t.label,
        })),
      )
      .returning();
    const destTableIdByTableNo = new Map(insertedTables.map((t) => [t.tableNo, t.id]));
    for (const t of tables) {
      const destId = destTableIdByTableNo.get(t.tableNo);
      if (destId) tableIdBySourceId.set(t.id, destId);
    }
  }

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
        seatTableId: r.seatTableId ? tableIdBySourceId.get(r.seatTableId) ?? null : null,
        seatNo: r.seatNo,
        currentStack: r.currentStack,
        arrivedBeforeLateReg: r.arrivedBeforeLateReg,
        registeredAt: new Date(r.registeredAt),
      })),
    );
  }

  // Carries over the blind-clock position so a destination picking up a
  // tournament that's already running (e.g. the offline laptop taking over
  // from the cloud mid-event) starts near the right level/time instead of
  // level 1. Table/seat layout is carried too (see tables/tableIdBySourceId
  // above), so players land at the same table/box they were at on the source.
  await db.delete(schema.tournamentClockState).where(eq(schema.tournamentClockState.tournamentId, newTournament.id));
  if (clockState) {
    await db.insert(schema.tournamentClockState).values({
      tournamentId: newTournament.id,
      currentLevelNumber: clockState.currentLevelNumber,
      levelStartedAt: clockState.levelStartedAt ? new Date(clockState.levelStartedAt) : null,
      pausedAt: clockState.pausedAt ? new Date(clockState.pausedAt) : null,
      elapsedPauseSeconds: clockState.elapsedPauseSeconds,
    });
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
        // Older export files (before per-knockout bounty points existed)
        // simply don't have this field — tolerated as "no override", same
        // as a knockout marked today without picking a custom amount.
        bountyPoints: k.bountyPoints ?? null,
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
