import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { schema, buildTournamentExport, importTournamentExport } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff, requireOwner } from "../services/staff.js";

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
  rpsFormulaParams: z
    .object({
      knockoutPoints: z.number().int().min(0),
      placementWeight: z.number().min(0).max(5).default(1),
    })
    .default({ knockoutPoints: 50, placementWeight: 1 }),
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

    const { includeArchived } = request.query as { includeArchived?: string };

    const rows = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(
        includeArchived === "true"
          ? eq(schema.tournaments.clubId, club.id)
          : and(eq(schema.tournaments.clubId, club.id), eq(schema.tournaments.archived, false)),
      )
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

  // Owner-only: the "Выгрузить" button. Two uses — on a finished tournament,
  // for syncing an offline-mode venue's results back into the cloud DB (the
  // TD sends the file to the bot); on a scheduled/registering tournament,
  // for the reverse pre-event sync (cloud settings + current registrations
  // down into the local offline stack via the import route below). See
  // docs/OFFLINE.md.
  fastify.get("/api/td/tournaments/:id/export", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const owner = await requireOwner(request, reply, fastify.db, club.id);
    if (!owner) return;

    const { id } = request.params as { id: string };
    const [tournament] = await fastify.db
      .select({ name: schema.tournaments.name, clubId: schema.tournaments.clubId })
      .from(schema.tournaments)
      .where(eq(schema.tournaments.id, id));
    if (!tournament || tournament.clubId !== club.id) return reply.code(404).send({ error: "not found" });

    const data = await buildTournamentExport(fastify.db, id);
    const slug = tournament.name.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "tournament";
    const date = new Date().toISOString().slice(0, 10);

    reply.header("Content-Disposition", `attachment; filename="${slug}-${date}.json"`);
    reply.type("application/json");
    return data;
  });

  // Owner-only: the "Загрузить из файла" button — the other end of the
  // pre-event sync above. Re-run-safe: updates (not duplicates) a local
  // tournament that hasn't started yet, matched by name + scheduledAt.
  fastify.post("/api/td/tournaments/import", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const owner = await requireOwner(request, reply, fastify.db, club.id);
    if (!owner) return;

    try {
      const result = await importTournamentExport(fastify.db, club.id, request.body, { mode: "sync" });
      return result;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Owner-only: used ONLY by the offline-launcher's background auto-pull
  // (never the "Загрузить из файла" button, which stays on the safer
  // "sync" mode) — keeps a local mirror continuously up to date with a
  // cloud tournament that's already running, not just one still
  // scheduled/registering. Refuses to touch a destination that's already
  // finished/cancelled there, so a late pull can never resurrect or
  // corrupt a genuinely closed-out event.
  fastify.post("/api/td/tournaments/mirror-import", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const owner = await requireOwner(request, reply, fastify.db, club.id);
    if (!owner) return;

    try {
      const result = await importTournamentExport(fastify.db, club.id, request.body, { mode: "mirror" });
      return result;
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
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

  // Works for a scheduled/registering tournament (never started) and for a
  // running one (emergency stop mid-event) alike — the only state it refuses
  // is "finished", since there's nothing meaningful to stop at that point.
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
    if (existing.status === "finished") return reply.code(409).send({ error: "tournament already finished" });

    await fastify.db.update(schema.tournaments).set({ status: "cancelled" }).where(eq(schema.tournaments.id, id));
    return { id, status: "cancelled" };
  });

  // Archiving is independent of status (a scheduled, running, finished or
  // cancelled tournament can all be archived) — it only hides the row from
  // the default list, nothing is touched or lost.
  fastify.post("/api/td/tournaments/:id/archive", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [existing] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    await fastify.db.update(schema.tournaments).set({ archived: true }).where(eq(schema.tournaments.id, id));
    return { id, archived: true };
  });

  fastify.post("/api/td/tournaments/:id/unarchive", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [existing] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    await fastify.db.update(schema.tournaments).set({ archived: false }).where(eq(schema.tournaments.id, id));
    return { id, archived: false };
  });

  // Hard delete. Cascades clean up everything tournament-scoped (blind
  // levels, tables, registrations, knockouts, rebuys, tournament_results),
  // but rps_ledger.tournament_id is ON DELETE SET NULL — a player's RPS they
  // already earned here is NOT erased, just unlinked from the now-gone
  // tournament, so deleting never silently changes anyone's rating total.
  fastify.delete("/api/td/tournaments/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [existing] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!existing) return reply.code(404).send({ error: "not found" });

    await fastify.db.delete(schema.tournaments).where(eq(schema.tournaments.id, id));
    return { deleted: true };
  });

  // "Заготовка": copies a tournament's settings + blind structure into a
  // brand-new scheduled tournament (no registrations/results carried over)
  // so the TD doesn't have to rebuild a recurring tournament from scratch
  // every time. Returns the new id so the frontend can open it straight in
  // the edit form to adjust the name/date before saving for real.
  fastify.post("/api/td/tournaments/:id/duplicate", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const [source] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!source) return reply.code(404).send({ error: "not found" });

    const sourceBlindLevels = await fastify.db
      .select()
      .from(schema.blindLevels)
      .where(eq(schema.blindLevels.tournamentId, id))
      .orderBy(asc(schema.blindLevels.levelNumber));

    const [copy] = await fastify.db
      .insert(schema.tournaments)
      .values({
        clubId: club.id,
        name: `${source.name} (копия)`,
        format: source.format,
        status: "scheduled",
        scheduledAt: source.scheduledAt,
        buyIn: source.buyIn,
        startingStack: source.startingStack,
        maxSeats: source.maxSeats,
        maxSeatsPerTable: source.maxSeatsPerTable,
        lateRegUntilLevel: source.lateRegUntilLevel,
        reentryAllowedUntilLevel: source.reentryAllowedUntilLevel,
        reentryPrice: source.reentryPrice,
        addonPrice: source.addonPrice,
        addonStack: source.addonStack,
        addonAvailableLevel: source.addonAvailableLevel,
        addonMaxCount: source.addonMaxCount,
        arriveBonusStack: source.arriveBonusStack,
        rpsFormulaParams: source.rpsFormulaParams,
      })
      .returning();

    if (sourceBlindLevels.length > 0) {
      await fastify.db.insert(schema.blindLevels).values(
        sourceBlindLevels.map((l) => ({
          tournamentId: copy.id,
          levelNumber: l.levelNumber,
          smallBlind: l.smallBlind,
          bigBlind: l.bigBlind,
          ante: l.ante,
          durationMinutes: l.durationMinutes,
          isBreak: l.isBreak,
        })),
      );
    }

    return reply.code(201).send({ id: copy.id });
  });
}
