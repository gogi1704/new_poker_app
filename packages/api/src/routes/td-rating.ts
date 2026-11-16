import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireOwner } from "../services/staff.js";

const rankTierSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(60),
  order: z.number().int(),
  thresholdType: z.enum(["rps", "games"]),
  thresholdValue: z.number().int().min(0),
  badgeIcon: z.string().trim().max(10).nullable().optional(),
});

const achievementSchema = z.object({
  id: z.string().uuid().optional(),
  key: z.string().trim().min(1).max(60),
  name: z.string().trim().min(1).max(80),
  thresholdType: z.enum(["cashes", "rps", "streak", "games"]),
  thresholdValue: z.number().int().min(0),
});

// Rank-tier/achievement management (previously only editable by hand in the
// DB — see offline-mode Phase 11 plan) plus a manual rating correction tool.
// All owner-only, same as club/staff/board settings in td-club.ts/td-staff.ts.
export default async function tdRatingRoutes(fastify: FastifyInstance) {
  fastify.get("/api/td/rank-tiers", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;
    return fastify.db
      .select()
      .from(schema.rankTiers)
      .where(eq(schema.rankTiers.clubId, club.id))
      .orderBy(schema.rankTiers.order);
  });

  fastify.post("/api/td/rank-tiers", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const body = rankTierSchema.parse(request.body);
    const values = {
      name: body.name,
      order: body.order,
      thresholdType: body.thresholdType,
      thresholdValue: body.thresholdValue,
      badgeIcon: body.badgeIcon ?? null,
    };

    if (body.id) {
      const [updated] = await fastify.db
        .update(schema.rankTiers)
        .set(values)
        .where(and(eq(schema.rankTiers.id, body.id), eq(schema.rankTiers.clubId, club.id)))
        .returning();
      if (!updated) return reply.code(404).send({ error: "not found" });
      return updated;
    }

    const [created] = await fastify.db
      .insert(schema.rankTiers)
      .values({ clubId: club.id, ...values })
      .returning();
    return created;
  });

  fastify.delete("/api/td/rank-tiers/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;
    const { id } = request.params as { id: string };
    await fastify.db.delete(schema.rankTiers).where(and(eq(schema.rankTiers.id, id), eq(schema.rankTiers.clubId, club.id)));
    return { removed: true };
  });

  fastify.get("/api/td/achievements", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;
    return fastify.db.select().from(schema.achievements).where(eq(schema.achievements.clubId, club.id));
  });

  fastify.post("/api/td/achievements", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const body = achievementSchema.parse(request.body);
    const values = {
      key: body.key,
      name: body.name,
      thresholdType: body.thresholdType,
      thresholdValue: body.thresholdValue,
    };

    if (body.id) {
      const [updated] = await fastify.db
        .update(schema.achievements)
        .set(values)
        .where(and(eq(schema.achievements.id, body.id), eq(schema.achievements.clubId, club.id)))
        .returning();
      if (!updated) return reply.code(404).send({ error: "not found" });
      return updated;
    }

    const [existing] = await fastify.db
      .select({ id: schema.achievements.id })
      .from(schema.achievements)
      .where(and(eq(schema.achievements.clubId, club.id), eq(schema.achievements.key, body.key)));
    if (existing) return reply.code(409).send({ error: "achievement with this key already exists" });

    const [created] = await fastify.db
      .insert(schema.achievements)
      .values({ clubId: club.id, ...values })
      .returning();
    return created;
  });

  fastify.delete("/api/td/achievements/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;
    const { id } = request.params as { id: string };
    await fastify.db
      .delete(schema.achievements)
      .where(and(eq(schema.achievements.id, id), eq(schema.achievements.clubId, club.id)));
    return { removed: true };
  });

  // Manual rating correction (dispute, scoring mistake after publish) —
  // appends one rpsLedger row, same append-only model every other RPS award
  // already uses; tournamentId is null since this isn't tied to one game.
  fastify.post("/api/td/players/:playerId/rps-adjust", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { playerId } = request.params as { playerId: string };
    const { delta, reason } = z
      .object({ delta: z.number().int(), reason: z.string().trim().min(1).max(200) })
      .parse(request.body);

    await fastify.db.insert(schema.rpsLedger).values({ playerId, clubId: club.id, tournamentId: null, delta, reason });
    return { ok: true };
  });
}
