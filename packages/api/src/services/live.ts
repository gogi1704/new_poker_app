import { and, asc, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@poker/shared";
import { computeClock } from "./clock.js";
import { suggestPayouts } from "./standings.js";
import { getAnnouncement } from "./announcements.js";

export async function buildLiveState(db: Database, tournamentId: string) {
  // These queries are independent of each other, and each round-trip to a
  // remote Postgres (Neon) costs real latency — running them sequentially made
  // the first SSE push take 4-5s. Firing them concurrently cuts that to the
  // slowest single query instead of the sum of all of them.
  const [tournament, blindLevels, clockRow, registrations, tableRows, knockoutRows, rebuyTotalRow, winnerRow, clubRow] =
    await Promise.all([
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
          currentStack: schema.registrations.currentStack,
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
      db
        .select({ total: sql<string>`coalesce(sum(${schema.rebuyAddonTransactions.amount}), 0)` })
        .from(schema.rebuyAddonTransactions)
        .where(eq(schema.rebuyAddonTransactions.tournamentId, tournamentId))
        .then((rows) => rows[0]),
      db
        .select({ nickname: schema.players.nickname })
        .from(schema.tournamentResults)
        .innerJoin(schema.players, eq(schema.players.id, schema.tournamentResults.playerId))
        .where(and(eq(schema.tournamentResults.tournamentId, tournamentId), eq(schema.tournamentResults.place, 1)))
        .then((rows) => rows[0]),
      // Single-club launch (see getDefaultClub) — board branding/settings live
      // on the one club row, not per-tournament.
      db
        .select()
        .from(schema.clubs)
        .limit(1)
        .then((rows) => rows[0]),
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
      .map((r) => ({
        seatNo: r.seatNo,
        playerId: r.playerId,
        nickname: r.nickname,
        avatarUrl: r.avatarUrl,
        currentStack: r.currentStack,
      }))
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

  const activeWithStacks = registrations.filter((r) => r.status === "active" && r.currentStack != null);
  const chipLeader = activeWithStacks.length
    ? activeWithStacks.reduce((best, r) => (r.currentStack! > best.currentStack! ? r : best))
    : null;

  // Live preview only — not the final payout (computed separately once the
  // tournament actually ends, by computeFinalStandings/suggestPayouts in
  // standings.ts). The frontend must show this per-place, never as a single
  // total: the club's tournaments aren't played for money, so no aggregate
  // "pool" figure belongs on the public board.
  const rebuyTotal = Number(rebuyTotalRow?.total ?? 0);
  const prizePool = fieldSize * Number(tournament.buyIn) + rebuyTotal;
  const payoutPreview = fieldSize > 0 ? suggestPayouts({ fieldSize, prizePool, rows: [] }) : {};

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
    blindLevels: blindLevels.map((l) => ({
      levelNumber: l.levelNumber,
      smallBlind: l.smallBlind,
      bigBlind: l.bigBlind,
      ante: l.ante,
      durationMinutes: l.durationMinutes,
      isBreak: l.isBreak,
    })),
    tables,
    eliminations: eliminations.reverse(),
    checkinList,
    chipLeader: chipLeader ? { playerId: chipLeader.playerId, nickname: chipLeader.nickname, stack: chipLeader.currentStack! } : null,
    payoutPreview,
    announcement: getAnnouncement(tournamentId),
    winner: winnerRow ? { nickname: winnerRow.nickname } : null,
    board: clubRow
      ? { clubName: clubRow.name, logoUrl: clubRow.logoUrl, settings: schema.normalizeBoardSettings(clubRow.boardSettings) }
      : null,
  };
}

export type LiveState = NonNullable<Awaited<ReturnType<typeof buildLiveState>>>;
