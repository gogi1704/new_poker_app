import { and, desc, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@poker/shared";

export interface ClubStandingRow {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  gamesPlayed: number;
  wins: number;
  totalRps: number;
}

/** Players ranked by total RPS within one club, highest first. */
export async function getClubStandings(db: Database, clubId: string): Promise<ClubStandingRow[]> {
  // Independent correlated subqueries per metric — joining results and ledger rows
  // directly would fan them out against each other and inflate the sums.
  const gamesPlayedSq = sql<number>`(
    select count(*) from ${schema.tournamentResults} tr
    inner join ${schema.tournaments} t on t.id = tr.tournament_id
    where tr.player_id = ${schema.clubMemberships.playerId} and t.club_id = ${clubId}
  )`;
  const winsSq = sql<number>`(
    select count(*) from ${schema.tournamentResults} tr
    inner join ${schema.tournaments} t on t.id = tr.tournament_id
    where tr.player_id = ${schema.clubMemberships.playerId} and t.club_id = ${clubId} and tr.place = 1
  )`;
  const totalRpsSq = sql<number>`(
    select coalesce(sum(rl.delta), 0) from ${schema.rpsLedger} rl
    where rl.player_id = ${schema.clubMemberships.playerId} and rl.club_id = ${clubId}
  )`;

  const rows = await db
    .select({
      playerId: schema.clubMemberships.playerId,
      nickname: schema.players.nickname,
      avatarUrl: schema.players.avatarUrl,
      gamesPlayed: gamesPlayedSq.as("games_played"),
      wins: winsSq.as("wins"),
      totalRps: totalRpsSq.as("total_rps"),
    })
    .from(schema.clubMemberships)
    .innerJoin(schema.players, eq(schema.players.id, schema.clubMemberships.playerId))
    .where(eq(schema.clubMemberships.clubId, clubId))
    .orderBy(desc(totalRpsSq));

  return rows.map((r) => ({
    ...r,
    gamesPlayed: Number(r.gamesPlayed),
    wins: Number(r.wins),
    totalRps: Number(r.totalRps),
  }));
}

export interface PlayerClubStats {
  gamesPlayed: number;
  wins: number;
  top3Count: number;
  totalRps: number;
  avgPlace: number | null;
  bestPlace: number | null;
  recentPlaces: number[];
}

export async function getPlayerClubStats(
  db: Database,
  clubId: string,
  playerId: string,
): Promise<PlayerClubStats> {
  const results = await db
    .select({
      place: schema.tournamentResults.place,
      publishedAt: schema.tournamentResults.publishedAt,
    })
    .from(schema.tournamentResults)
    .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.tournamentResults.tournamentId))
    .where(and(eq(schema.tournamentResults.playerId, playerId), eq(schema.tournaments.clubId, clubId)))
    .orderBy(desc(schema.tournamentResults.publishedAt));

  const [{ totalRps }] = await db
    .select({ totalRps: sql<number>`coalesce(sum(${schema.rpsLedger.delta}), 0)` })
    .from(schema.rpsLedger)
    .where(and(eq(schema.rpsLedger.playerId, playerId), eq(schema.rpsLedger.clubId, clubId)));

  const places = results.map((r) => r.place);
  const gamesPlayed = places.length;
  const wins = places.filter((p) => p === 1).length;
  const top3Count = places.filter((p) => p <= 3).length;
  const bestPlace = places.length ? Math.min(...places) : null;
  const avgPlace = places.length ? places.reduce((a, b) => a + b, 0) / places.length : null;

  return {
    gamesPlayed,
    wins,
    top3Count,
    totalRps: Number(totalRps),
    avgPlace,
    bestPlace,
    recentPlaces: places.slice(0, 10),
  };
}

/** Longest current streak of top-3 finishes, most recent tournament first. */
export function computeStreak(recentPlaces: number[]): number {
  let streak = 0;
  for (const place of recentPlaces) {
    if (place <= 3) streak += 1;
    else break;
  }
  return streak;
}
