import { eq, inArray } from "drizzle-orm";
import type { Database } from "../db/client.js";
import * as schema from "../db/schema.js";

export interface TournamentExportPlayer {
  localId: string;
  telegramId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface TournamentExportData {
  exportedAt: string;
  tournament: typeof schema.tournaments.$inferSelect;
  blindLevels: (typeof schema.blindLevels.$inferSelect)[];
  // Null when the tournament never started (no row exists until /start).
  // Carrying this is what lets a destination pick up a running tournament
  // at roughly the right blind level/time instead of restarting at level 1.
  clockState: typeof schema.tournamentClockState.$inferSelect | null;
  // Carried so seat/table layout survives a sync too — registrations below
  // still reference these by the *source* database's table id, which the
  // import side remaps via tableNo (see tournamentImport.ts), exactly like
  // player ids get remapped via telegramId.
  tables: (typeof schema.tables.$inferSelect)[];
  players: TournamentExportPlayer[];
  registrations: (typeof schema.registrations.$inferSelect)[];
  results: (typeof schema.tournamentResults.$inferSelect)[];
  knockouts: (typeof schema.knockouts.$inferSelect)[];
  rebuys: (typeof schema.rebuyAddonTransactions.$inferSelect)[];
  rpsLedger: (typeof schema.rpsLedger.$inferSelect)[];
}

/**
 * Gathers everything importTournamentExport() needs to recreate a finished
 * tournament elsewhere: the tournament itself, its blind structure, and every
 * record referencing it, plus the (by-local-id) players those records point
 * at — the import side remaps those ids to real cloud players, matched by
 * telegramId. Shared by the offline → cloud CLI scripts and the owner-only
 * HTTP export route, so this collection logic exists exactly once.
 */
export async function buildTournamentExport(db: Database, tournamentId: string): Promise<TournamentExportData> {
  const [tournament] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, tournamentId));
  if (!tournament) throw new Error(`Tournament ${tournamentId} not found`);

  const blindLevels = await db.select().from(schema.blindLevels).where(eq(schema.blindLevels.tournamentId, tournamentId));
  const tables = await db.select().from(schema.tables).where(eq(schema.tables.tournamentId, tournamentId));
  const registrations = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.tournamentId, tournamentId));
  const results = await db
    .select()
    .from(schema.tournamentResults)
    .where(eq(schema.tournamentResults.tournamentId, tournamentId));
  const knockouts = await db.select().from(schema.knockouts).where(eq(schema.knockouts.tournamentId, tournamentId));
  const rebuys = await db
    .select()
    .from(schema.rebuyAddonTransactions)
    .where(eq(schema.rebuyAddonTransactions.tournamentId, tournamentId));
  const rpsLedger = await db.select().from(schema.rpsLedger).where(eq(schema.rpsLedger.tournamentId, tournamentId));
  const [clockState] = await db
    .select()
    .from(schema.tournamentClockState)
    .where(eq(schema.tournamentClockState.tournamentId, tournamentId));

  const playerIds = new Set<string>();
  for (const r of registrations) playerIds.add(r.playerId);
  for (const r of results) playerIds.add(r.playerId);
  for (const k of knockouts) {
    playerIds.add(k.eliminatedPlayerId);
    if (k.eliminatedByPlayerId) playerIds.add(k.eliminatedByPlayerId);
  }
  for (const r of rebuys) playerIds.add(r.playerId);
  for (const l of rpsLedger) playerIds.add(l.playerId);

  const players = playerIds.size
    ? await db.select().from(schema.players).where(inArray(schema.players.id, [...playerIds]))
    : [];

  return {
    exportedAt: new Date().toISOString(),
    tournament,
    blindLevels,
    clockState: clockState ?? null,
    tables,
    players: players.map((p) => ({
      localId: p.id,
      telegramId: p.telegramId,
      nickname: p.nickname,
      avatarUrl: p.avatarUrl,
    })),
    registrations,
    results,
    knockouts,
    rebuys,
    rpsLedger,
  };
}
