import { asc, eq } from "drizzle-orm";
import { schema, type Database, calculateRps } from "@poker/shared";

export interface FinalStandingRow {
  playerId: string;
  nickname: string;
  place: number;
  knockoutsCount: number;
  bountyPoints: number;
  rpsAwarded: number;
}

export interface FinalStandings {
  fieldSize: number;
  prizePool: number;
  rows: FinalStandingRow[];
}

/**
 * Reconstructs the final table from live-play data: the one remaining active
 * player takes 1st, everyone else's place comes from elimination order
 * (most recent elimination = next place up). Returns null when the
 * tournament isn't actually down to a winner yet.
 */
export async function computeFinalStandings(db: Database, tournamentId: string): Promise<FinalStandings | null> {
  const [tournament] = await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, tournamentId));
  if (!tournament) return null;

  const registrations = await db
    .select({
      playerId: schema.registrations.playerId,
      status: schema.registrations.status,
      nickname: schema.players.nickname,
    })
    .from(schema.registrations)
    .innerJoin(schema.players, eq(schema.players.id, schema.registrations.playerId))
    .where(eq(schema.registrations.tournamentId, tournamentId));

  const activePlayers = registrations.filter((r) => r.status === "active");
  if (activePlayers.length !== 1) return null;

  const knockoutRows = await db
    .select({
      eliminatedPlayerId: schema.knockouts.eliminatedPlayerId,
      eliminatedByPlayerId: schema.knockouts.eliminatedByPlayerId,
      createdAt: schema.knockouts.createdAt,
    })
    .from(schema.knockouts)
    .where(eq(schema.knockouts.tournamentId, tournamentId))
    .orderBy(asc(schema.knockouts.createdAt));

  const fieldSize = activePlayers.length + knockoutRows.length;
  const nicknameByPlayerId = new Map(registrations.map((r) => [r.playerId, r.nickname]));

  const knockoutsByPlayer = new Map<string, number>();
  for (const k of knockoutRows) {
    if (!k.eliminatedByPlayerId) continue;
    knockoutsByPlayer.set(k.eliminatedByPlayerId, (knockoutsByPlayer.get(k.eliminatedByPlayerId) ?? 0) + 1);
  }

  const params = tournament.rpsFormulaParams;
  const rowFor = (playerId: string, place: number): FinalStandingRow => {
    const knockoutsCount = knockoutsByPlayer.get(playerId) ?? 0;
    return {
      playerId,
      nickname: nicknameByPlayerId.get(playerId) ?? "?",
      place,
      knockoutsCount,
      bountyPoints: knockoutsCount * params.knockoutPoints,
      rpsAwarded: calculateRps({ place, fieldSize, knockouts: knockoutsCount, params }),
    };
  };

  const rows: FinalStandingRow[] = [rowFor(activePlayers[0].playerId, 1)];
  // Most-recently-eliminated player is the highest remaining place.
  for (let i = knockoutRows.length - 1; i >= 0; i--) {
    rows.push(rowFor(knockoutRows[i].eliminatedPlayerId, rows.length + 1));
  }

  const rebuys = await db
    .select({ amount: schema.rebuyAddonTransactions.amount })
    .from(schema.rebuyAddonTransactions)
    .where(eq(schema.rebuyAddonTransactions.tournamentId, tournamentId));
  const rebuyTotal = rebuys.reduce((sum, r) => sum + Number(r.amount), 0);
  const prizePool = fieldSize * Number(tournament.buyIn) + rebuyTotal;

  return { fieldSize, prizePool, rows };
}

/** Simple decreasing-weight payout curve: top ~15% of the field gets paid. */
export function suggestPayouts(standings: FinalStandings): Record<number, number> {
  const paidPlaces = Math.max(1, Math.round(standings.fieldSize * 0.15));
  const weights: number[] = [];
  for (let place = 1; place <= paidPlaces; place++) weights.push(paidPlaces - place + 1);
  const weightSum = weights.reduce((a, b) => a + b, 0);

  const payouts: Record<number, number> = {};
  for (let place = 1; place <= paidPlaces; place++) {
    payouts[place] = Math.round((standings.prizePool * weights[place - 1]) / weightSum);
  }
  return payouts;
}
