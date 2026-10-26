import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";

const blindLevelSchema = z.object({
  levelNumber: z.number().int().min(1),
  smallBlind: z.number().int().min(0),
  bigBlind: z.number().int().min(0),
  ante: z.number().int().min(0).default(0),
  durationMinutes: z.number().int().min(1),
  isBreak: z.boolean().default(false),
});

const tournamentSchema = z.object({
  name: z.string().min(1),
  format: z.enum(["freezeout", "reentry", "knockout", "reentry_knockout"]),
  status: z.enum(["scheduled", "registering"]).default("scheduled"),
  scheduledAt: z.string().datetime().or(z.string().min(1)),
  buyIn: z.number().min(0),
  startingStack: z.number().int().min(1),
  maxSeats: z.number().int().min(2),
  maxSeatsPerTable: z.number().int().min(2).max(10).default(9),
  lateRegUntilLevel: z.number().int().min(1).nullable().optional(),
  reentryAllowedUntilLevel: z.number().int().min(1).nullable().optional(),
  reentryPrice: z.number().min(0).nullable().optional(),
  addonPrice: z.number().min(0).nullable().optional(),
  addonStack: z.number().int().min(0).nullable().optional(),
  addonAvailableLevel: z.number().int().min(1).nullable().optional(),
  addonMaxCount: z.number().int().min(1).nullable().optional(),
  arriveBonusStack: z.number().int().min(0).default(0),
  rpsFormulaParams: z.object({ knockoutPoints: z.number().int().min(0) }).default({ knockoutPoints: 50 }),
  blindLevels: z.array(blindLevelSchema).min(1),
});

function toNumericString(value: number | null | undefined): string | null | undefined {
  if (value === null || value === undefined) return value;
  return String(value);
}

export default async function tdTournamentsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/td/me", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;
    return { club: { id: club.id, name: club.name }, staff: { role: staff.role } };
  });

  fastify.get("/api/td/tournaments", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const rows = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(eq(schema.tournaments.clubId, club.id))
      .orderBy(desc(schema.tournaments.scheduledAt));
    return rows;
  });

  fastify.get("/api/td/tournaments/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [tournament] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id));
    if (!tournament) return reply.code(404).send({ error: "not found" });

    const blindLevels = await fastify.db
      .select()
      .from(schema.blindLevels)
      .where(eq(schema.blindLevels.tournamentId, id))
      .orderBy(asc(schema.blindLevels.levelNumber));

    return { ...tournament, blindLevels };
  });

  fastify.post("/api/td/tournaments", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const body = tournamentSchema.parse(request.body);

    const [tournament] = await fastify.db
      .insert(schema.tournaments)
      .values({
        clubId: club.id,
        name: body.name,
        format: body.format,
        status: body.status,
        scheduledAt: new Date(body.scheduledAt),
        buyIn: String(body.buyIn),
        startingStack: body.startingStack,
        maxSeats: body.maxSeats,
        maxSeatsPerTable: body.maxSeatsPerTable,
        lateRegUntilLevel: body.lateRegUntilLevel,
        reentryAllowedUntilLevel: body.reentryAllowedUntilLevel,
        reentryPrice: toNumericString(body.reentryPrice),
        addonPrice: toNumericString(body.addonPrice),
        addonStack: body.addonStack,
        addonAvailableLevel: body.addonAvailableLevel,
        addonMaxCount: body.addonMaxCount ?? 1,
        arriveBonusStack: body.arriveBonusStack,
        rpsFormulaParams: body.rpsFormulaParams,
      })
      .returning();

    await fastify.db
      .insert(schema.blindLevels)
      .values(body.blindLevels.map((l) => ({ ...l, tournamentId: tournament.id })));

    return reply.code(201).send({ id: tournament.id });
  });

  fastify.put("/api/td/tournaments/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id));
    if (!existing) return reply.code(404).send({ error: "not found" });
    if (existing.status === "finished" || existing.status === "running") {
      return reply.code(409).send({ error: "cannot edit a tournament that is running or finished" });
    }

    const body = tournamentSchema.parse(request.body);

    await fastify.db
      .update(schema.tournaments)
      .set({
        name: body.name,
        format: body.format,
        status: body.status,
        scheduledAt: new Date(body.scheduledAt),
        buyIn: String(body.buyIn),
        startingStack: body.startingStack,
        maxSeats: body.maxSeats,
        maxSeatsPerTable: body.maxSeatsPerTable,
        lateRegUntilLevel: body.lateRegUntilLevel,
        reentryAllowedUntilLevel: body.reentryAllowedUntilLevel,
        reentryPrice: toNumericString(body.reentryPrice),
        addonPrice: toNumericString(body.addonPrice),
        addonStack: body.addonStack,
        addonAvailableLevel: body.addonAvailableLevel,
        addonMaxCount: body.addonMaxCount ?? 1,
        arriveBonusStack: body.arriveBonusStack,
        rpsFormulaParams: body.rpsFormulaParams,
      })
      .where(eq(schema.tournaments.id, id));

    await fastify.db.delete(schema.blindLevels).where(eq(schema.blindLevels.tournamentId, id));
    await fastify.db.insert(schema.blindLevels).values(body.blindLevels.map((l) => ({ ...l, tournamentId: id })));

    return { id };
  });

  fastify.post("/api/td/tournaments/:id/cancel", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [existing] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    await fastify.db.update(schema.tournaments).set({ status: "cancelled" }).where(eq(schema.tournaments.id, id));
    return { id, status: "cancelled" };
  });
}
