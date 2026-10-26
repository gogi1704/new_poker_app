import type { FastifyInstance } from "fastify";
import { and, asc, eq, ne } from "drizzle-orm";
import { schema, computeRankProgress, computeAchievementProgress } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { getPlayerClubStats, computeStreak } from "../services/stats.js";
import { requireAuth } from "../plugins/auth.js";

export default async function profileRoutes(fastify: FastifyInstance) {
  fastify.get("/api/profile", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;

    const club = await getDefaultClub(fastify.db);

    const [player] = await fastify.db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return reply.code(404).send({ error: "player not found" });

    const [membership] = await fastify.db
      .select()
      .from(schema.clubMemberships)
      .where(and(eq(schema.clubMemberships.clubId, club.id), eq(schema.clubMemberships.playerId, playerId)));

    const stats = await getPlayerClubStats(fastify.db, club.id, playerId);
    const streak = computeStreak(stats.recentPlaces);

    const rankTiers = await fastify.db
      .select()
      .from(schema.rankTiers)
      .where(eq(schema.rankTiers.clubId, club.id))
      .orderBy(asc(schema.rankTiers.order));

    const rankProgress = computeRankProgress(rankTiers, {
      totalRps: stats.totalRps,
      gamesPlayed: stats.gamesPlayed,
    });

    const achievementDefs = await fastify.db
      .select()
      .from(schema.achievements)
      .where(eq(schema.achievements.clubId, club.id));

    const achievementStats = {
      cashes: stats.top3Count,
      rps: stats.totalRps,
      streak,
      games: stats.gamesPlayed,
    };

    const achievements = achievementDefs.map((def) => ({
      ...def,
      ...computeAchievementProgress(def, achievementStats),
    }));

    const myTournaments = await fastify.db
      .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        scheduledAt: schema.tournaments.scheduledAt,
        status: schema.tournaments.status,
        registrationStatus: schema.registrations.status,
      })
      .from(schema.registrations)
      .innerJoin(schema.tournaments, eq(schema.tournaments.id, schema.registrations.tournamentId))
      .where(and(eq(schema.registrations.playerId, playerId), ne(schema.registrations.status, "cancelled")));

    return {
      player,
      membership,
      stats: { ...stats, winRate: stats.gamesPlayed ? Math.round((stats.wins / stats.gamesPlayed) * 100) : 0 },
      rankProgress,
      achievements,
      myTournaments,
    };
  });

  // 152-ФЗ self-service deletion: anonymize the player's display data rather
  // than hard-deleting the row, since tournament_results/rps_ledger reference
  // it and a club's historical standings are legitimate records to keep. The
  // numeric history stays; the name attached to it doesn't. Logging in again
  // later (auth.ts) clears deletedAt and restores a real nickname, treating
  // that as renewed consent instead of leaving the account unrecoverable.
  fastify.post("/api/profile/delete", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;

    await fastify.db
      .update(schema.players)
      .set({ nickname: "Игрок удалён", avatarUrl: null, deletedAt: new Date() })
      .where(eq(schema.players.id, playerId));

    return { deleted: true };
  });
}
