import type { FastifyInstance } from "fastify";
import { asc, eq } from "drizzle-orm";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { getClubStandings } from "../services/stats.js";

export default async function ratingRoutes(fastify: FastifyInstance) {
  fastify.get("/api/rating", async () => {
    const club = await getDefaultClub(fastify.db);
    const standings = await getClubStandings(fastify.db, club.id);

    const rankTiers = await fastify.db
      .select()
      .from(schema.rankTiers)
      .where(eq(schema.rankTiers.clubId, club.id))
      .orderBy(asc(schema.rankTiers.order));

    const ranked = standings.map((row, i) => ({ ...row, rank: i + 1 }));

    return {
      podium: ranked.slice(0, 3),
      standings: ranked,
      rankTiers,
    };
  });
}
