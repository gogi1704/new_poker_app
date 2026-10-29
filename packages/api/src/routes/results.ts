import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";

export default async function resultsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/results", async () => {
    const club = await getDefaultClub(fastify.db);

    const tournaments = await fastify.db
      .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        format: schema.tournaments.format,
        scheduledAt: schema.tournaments.scheduledAt,
        buyIn: schema.tournaments.buyIn,
      })
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.clubId, club.id), eq(schema.tournaments.status, "finished")))
      .orderBy(desc(schema.tournaments.scheduledAt));

    const list = await Promise.all(
      tournaments.map(async (t) => {
        const standings = await fastify.db
          .select({
            place: schema.tournamentResults.place,
            rpsAwarded: schema.tournamentResults.rpsAwarded,
            knockoutsCount: schema.tournamentResults.knockoutsCount,
            bountyPoints: schema.tournamentResults.bountyPoints,
            playerId: schema.tournamentResults.playerId,
            nickname: schema.players.nickname,
            avatarUrl: schema.players.avatarUrl,
          })
          .from(schema.tournamentResults)
          .innerJoin(schema.players, eq(schema.players.id, schema.tournamentResults.playerId))
          .where(eq(schema.tournamentResults.tournamentId, t.id))
          .orderBy(asc(schema.tournamentResults.place));

        const winner = standings.find((r) => r.place === 1) ?? null;
        const totalKnockouts = standings.reduce((sum, r) => sum + r.knockoutsCount, 0);

        return {
          ...t,
          playersCount: standings.length,
          winner: winner ? { nickname: winner.nickname, avatarUrl: winner.avatarUrl } : null,
          totalKnockouts,
          standings,
        };
      }),
    );

    const [{ totalParticipants }] = await fastify.db
      .select({ totalParticipants: sql<number>`count(*)` })
      .from(schema.clubMemberships)
      .where(eq(schema.clubMemberships.clubId, club.id));

    const [leader] = await fastify.db
      .select({
        nickname: schema.players.nickname,
        totalRps: sql<number>`coalesce(sum(${schema.rpsLedger.delta}), 0)`,
      })
      .from(schema.rpsLedger)
      .innerJoin(schema.players, eq(schema.players.id, schema.rpsLedger.playerId))
      .where(eq(schema.rpsLedger.clubId, club.id))
      .groupBy(schema.players.id, schema.players.nickname)
      .orderBy(desc(sql`coalesce(sum(${schema.rpsLedger.delta}), 0)`))
      .limit(1);

    return {
      totalTournaments: tournaments.length,
      totalParticipants: Number(totalParticipants),
      rpsLeader: leader ? { nickname: leader.nickname, totalRps: Number(leader.totalRps) } : null,
      tournaments: list,
    };
  });
}
