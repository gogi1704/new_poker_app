import { and, asc, eq } from "drizzle-orm";
import { schema, type Database } from "@poker/shared";
import { computeClock } from "./clock.js";

export async function buildLiveState(db: Database, tournamentId: string) {
  // These six queries are independent of each other, and each round-trip to a
  // remote Postgres (Neon) costs real latency — running them sequentially made
  // the first SSE push take 4-5s. Firing them concurrently cuts that to the
  // slowest single query instead of the sum of all of them.
  const [tournament, blindLevels, clockRow, registrations, tableRows, knockoutRows] = await Promise.all([
    db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, tournamentId))
      .then((rows) => rows[0]),
    db
      .select()
      .from(schema.blindLevels)
      .where(eq(schema.blindLevels.tournamentId, tournamentId))
      .orderBy(asc(schema.blindLevels.levelNumber)),
    db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, tournamentId))
      .then((rows) => rows[0]),
    db
      .select({
        playerId: schema.registrations.playerId,
        status: schema.registrations.status,
        seatTableId: schema.registrations.seatTableId,
        seatNo: schema.registrations.seatNo,
        nickname: schema.players.nickname,
        avatarUrl: schema.players.avatarUrl,
      })
      .from(schema.registrations)
      .innerJoin(schema.players, eq(schema.players.id, schema.registrations.playerId))
      .where(eq(schema.registrations.tournamentId, tournamentId)),
    db
      .select()
      .from(schema.tables)
      .where(and(eq(schema.tables.tournamentId, tournamentId), eq(schema.tables.isActive, true)))
      .orderBy(asc(schema.tables.tableNo)),
    db
      .select({
        eliminatedPlayerId: schema.knockouts.eliminatedPlayerId,
        eliminatedByPlayerId: schema.knockouts.eliminatedByPlayerId,
        levelNumber: schema.knockouts.levelNumber,
        createdAt: schema.knockouts.createdAt,
      })
      .from(schema.knockouts)
      .where(eq(schema.knockouts.tournamentId, tournamentId))
      .orderBy(asc(schema.knockouts.createdAt)),
  ]);

  if (!tournament) return null;

  const clock = clockRow
    ? {
        ...computeClock(clockRow),
        level: blindLevels.find((l) => l.levelNumber === clockRow.currentLevelNumber) ?? null,
        nextLevel: blindLevels.find((l) => l.levelNumber === clockRow.currentLevelNumber + 1) ?? null,
      }
    : null;

  const tables = tableRows.map((t) => ({
    tableNo: t.tableNo,
    maxSeats: t.maxSeats,
    seats: registrations
      .filter((r) => r.seatTableId === t.id && r.status === "active")
      .map((r) => ({ seatNo: r.seatNo, playerId: r.playerId, nickname: r.nickname, avatarUrl: r.avatarUrl }))
      .sort((a, b) => (a.seatNo ?? 0) - (b.seatNo ?? 0)),
  }));

  const checkedIn = registrations.filter((r) => r.status === "checked_in").length;
  const activeCount = registrations.filter((r) => r.status === "active").length;
  const eliminatedCount = registrations.filter((r) => r.status === "eliminated").length;
  const fieldSize = activeCount + eliminatedCount;

  const nicknameByPlayerId = new Map(registrations.map((r) => [r.playerId, r.nickname]));
  const eliminations = knockoutRows.map((k, i) => ({
    playerId: k.eliminatedPlayerId,
    nickname: nicknameByPlayerId.get(k.eliminatedPlayerId) ?? "?",
    eliminatedByNickname: k.eliminatedByPlayerId ? (nicknameByPlayerId.get(k.eliminatedByPlayerId) ?? null) : null,
    place: fieldSize - i,
    levelNumber: k.levelNumber,
    at: k.createdAt,
  }));

  const checkinList = registrations
    .filter((r) => r.status === "registered" || r.status === "checked_in")
    .map((r) => ({ playerId: r.playerId, nickname: r.nickname, status: r.status }));

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      buyIn: tournament.buyIn,
      startingStack: tournament.startingStack,
      maxSeats: tournament.maxSeats,
      reentryAllowedUntilLevel: tournament.reentryAllowedUntilLevel,
      reentryPrice: tournament.reentryPrice,
      addonPrice: tournament.addonPrice,
      addonStack: tournament.addonStack,
    },
    clock,
    counts: { checkedIn, active: activeCount, eliminated: eliminatedCount, fieldSize, tablesActive: tables.length },
    tables,
    eliminations: eliminations.reverse(),
    checkinList,
  };
}

export type LiveState = NonNullable<Awaited<ReturnType<typeof buildLiveState>>>;
