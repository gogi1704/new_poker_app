import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";
import { buildLiveState } from "../services/live.js";
import { publishTournamentUpdate } from "../services/realtime.js";
import { dealInitialSeats, rebalanceTables, firstFreeSeat } from "../services/seating.js";
import { computeFinalStandings, suggestPayouts } from "../services/standings.js";
import { setAnnouncement } from "../services/announcements.js";

async function requireStaffAndTournament(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const club = await getDefaultClub(fastify.db);
  const staff = await requireStaff(request, reply, fastify.db, club.id);
  if (!staff) return null;

  const { id } = request.params as { id: string };
  const [tournament] = await fastify.db
    .select()
    .from(schema.tournaments)
    .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
  if (!tournament) {
    reply.code(404).send({ error: "not found" });
    return null;
  }
  return { tournament };
}

async function respond(fastify: FastifyInstance, tournamentId: string) {
  publishTournamentUpdate(tournamentId);
  return buildLiveState(fastify.db, tournamentId);
}

/**
 * Deals every checked-in player into fresh tables via dealInitialSeats.
 * Shared by draw-seats (the pre-start preview the TD can then rearrange) and
 * start (when the TD skipped drawing and clicked start directly). Returns
 * false if there weren't enough checked-in players to deal.
 */
async function dealSeatsForTournament(
  fastify: FastifyInstance,
  tournamentId: string,
  tournament: { startingStack: number; maxSeatsPerTable: number },
): Promise<boolean> {
  const checkedIn = await fastify.db
    .select({ playerId: schema.registrations.playerId })
    .from(schema.registrations)
    .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.status, "checked_in")));

  if (checkedIn.length < 2) return false;

  const seats = dealInitialSeats(checkedIn.map((c) => c.playerId), tournament.maxSeatsPerTable);
  const tableNos = [...new Set(seats.map((s) => s.tableNo))];

  const insertedTables = await fastify.db
    .insert(schema.tables)
    .values(tableNos.map((tableNo) => ({ tournamentId, tableNo, maxSeats: tournament.maxSeatsPerTable })))
    .returning();
  const tableIdByNo = new Map(insertedTables.map((t) => [t.tableNo, t.id]));

  for (const seat of seats) {
    await fastify.db
      .update(schema.registrations)
      .set({
        status: "active",
        seatTableId: tableIdByNo.get(seat.tableNo),
        seatNo: seat.seatNo,
        currentStack: tournament.startingStack,
      })
      .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.playerId, seat.playerId)));
  }

  return true;
}

/**
 * Seats a player at the least-full active table, creating a new one if every
 * active table is full. Shared by re-entry (rebuy handler) and undo-knockout,
 * which both need to put a player who isn't currently seated back onto the
 * floor without the TD having to pick a specific seat.
 */
async function seatPlayerIntoActiveTable(
  fastify: FastifyInstance,
  tournamentId: string,
  playerId: string,
  maxSeatsPerTable: number,
) {
  const tableRows = await fastify.db
    .select()
    .from(schema.tables)
    .where(and(eq(schema.tables.tournamentId, tournamentId), eq(schema.tables.isActive, true)));

  const occupancy = await Promise.all(
    tableRows.map(async (t) => {
      const seated = await fastify.db
        .select({ seatNo: schema.registrations.seatNo })
        .from(schema.registrations)
        .where(and(eq(schema.registrations.seatTableId, t.id), eq(schema.registrations.status, "active")));
      return { table: t, takenSeats: new Set(seated.map((s) => s.seatNo).filter((n): n is number => n != null)) };
    }),
  );
  occupancy.sort((a, b) => a.takenSeats.size - b.takenSeats.size);

  let target = occupancy[0];
  if (!target || target.takenSeats.size >= maxSeatsPerTable) {
    const [newTable] = await fastify.db
      .insert(schema.tables)
      .values({ tournamentId, tableNo: tableRows.length + 1, maxSeats: maxSeatsPerTable })
      .returning();
    target = { table: newTable, takenSeats: new Set() };
  }

  const seatNo = firstFreeSeat(target.takenSeats);
  await fastify.db
    .update(schema.registrations)
    .set({ status: "active", seatTableId: target.table.id, seatNo })
    .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.playerId, playerId)));
}

export default async function tdLiveRoutes(fastify: FastifyInstance) {
  // ---- check-in ----

  fastify.post("/api/td/tournaments/:id/checkin", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { playerId, checkedIn } = z.object({ playerId: z.string().uuid(), checkedIn: z.boolean() }).parse(
      request.body,
    );

    await fastify.db
      .update(schema.registrations)
      .set({ status: checkedIn ? "checked_in" : "registered" })
      .where(
        and(
          eq(schema.registrations.tournamentId, id),
          eq(schema.registrations.playerId, playerId),
          sql`${schema.registrations.status} in ('registered', 'checked_in')`,
        ),
      );

    return respond(fastify, id);
  });

  fastify.post("/api/td/tournaments/:id/checkin-all", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };

    await fastify.db
      .update(schema.registrations)
      .set({ status: "checked_in" })
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "registered")));

    return respond(fastify, id);
  });

  // ---- pre-start seating draft: TD can see & manually rearrange "who sits
  // where" before the clock starts, instead of a random shuffle happening
  // the instant they click start. /start below skips dealing if this already
  // ran. One-shot only (409 if tables already exist) — further adjustments
  // go through the existing move-seat/rebalance tools, which already work on
  // "active" players regardless of whether the tournament clock is running.

  fastify.post("/api/td/tournaments/:id/draw-seats", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    if (tournament.status === "running" || tournament.status === "finished") {
      return reply.code(409).send({ error: "tournament already started" });
    }

    const [existingTable] = await fastify.db.select().from(schema.tables).where(eq(schema.tables.tournamentId, id));
    if (existingTable) return reply.code(409).send({ error: "seats already drawn" });

    const dealt = await dealSeatsForTournament(fastify, id, tournament);
    if (!dealt) return reply.code(409).send({ error: "need at least 2 checked-in players" });

    return respond(fastify, id);
  });

  // ---- start tournament: seat checked-in players (unless already drawn via
  // draw-seats above), start the clock ----

  fastify.post("/api/td/tournaments/:id/start", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    if (tournament.status === "running") return reply.code(409).send({ error: "already running" });

    const [existingTable] = await fastify.db.select().from(schema.tables).where(eq(schema.tables.tournamentId, id));
    if (existingTable) {
      const [{ active }] = await fastify.db
        .select({ active: sql<number>`count(*)` })
        .from(schema.registrations)
        .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "active")));
      if (Number(active) < 2) return reply.code(409).send({ error: "need at least 2 seated players to start" });
    } else {
      const dealt = await dealSeatsForTournament(fastify, id, tournament);
      if (!dealt) return reply.code(409).send({ error: "need at least 2 checked-in players to start" });
    }

    await fastify.db
      .insert(schema.tournamentClockState)
      .values({ tournamentId: id, currentLevelNumber: 1, levelStartedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.tournamentClockState.tournamentId,
        set: { currentLevelNumber: 1, levelStartedAt: new Date(), pausedAt: null, elapsedPauseSeconds: 0 },
      });

    await fastify.db.update(schema.tournaments).set({ status: "running" }).where(eq(schema.tournaments.id, id));

    return respond(fastify, id);
  });

  // ---- clock control ----

  fastify.post("/api/td/tournaments/:id/clock/pause", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };

    await fastify.db
      .update(schema.tournamentClockState)
      .set({ pausedAt: new Date() })
      .where(and(eq(schema.tournamentClockState.tournamentId, id), isNull(schema.tournamentClockState.pausedAt)));

    return respond(fastify, id);
  });

  fastify.post("/api/td/tournaments/:id/clock/resume", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };

    const [clock] = await fastify.db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, id));

    if (clock?.pausedAt) {
      const pausedSeconds = Math.round((Date.now() - clock.pausedAt.getTime()) / 1000);
      await fastify.db
        .update(schema.tournamentClockState)
        .set({ pausedAt: null, elapsedPauseSeconds: clock.elapsedPauseSeconds + pausedSeconds })
        .where(eq(schema.tournamentClockState.tournamentId, id));
    }

    return respond(fastify, id);
  });

  fastify.post("/api/td/tournaments/:id/clock/level", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const body = z
      .union([
        z.object({ direction: z.enum(["next", "prev"]) }),
        z.object({ levelNumber: z.number().int().min(1) }),
      ])
      .parse(request.body);

    const [clock] = await fastify.db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, id));
    if (!clock) return reply.code(409).send({ error: "tournament has not started" });

    const nextLevel =
      "levelNumber" in body
        ? body.levelNumber
        : Math.max(1, clock.currentLevelNumber + (body.direction === "next" ? 1 : -1));
    await fastify.db
      .update(schema.tournamentClockState)
      .set({ currentLevelNumber: nextLevel, levelStartedAt: new Date(), pausedAt: null, elapsedPauseSeconds: 0 })
      .where(eq(schema.tournamentClockState.tournamentId, id));

    return respond(fastify, id);
  });

  // ---- knockout ----

  fastify.post("/api/td/tournaments/:id/knockout", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { eliminatedPlayerId, eliminatedByPlayerId } = z
      .object({ eliminatedPlayerId: z.string().uuid(), eliminatedByPlayerId: z.string().uuid().nullable().optional() })
      .parse(request.body);

    const [reg] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.tournamentId, id),
          eq(schema.registrations.playerId, eliminatedPlayerId),
          eq(schema.registrations.status, "active"),
        ),
      );
    if (!reg) return reply.code(404).send({ error: "player is not active in this tournament" });

    const [clock] = await fastify.db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, id));

    await fastify.db
      .update(schema.registrations)
      .set({ status: "eliminated", seatTableId: null, seatNo: null })
      .where(eq(schema.registrations.id, reg.id));

    await fastify.db.insert(schema.knockouts).values({
      tournamentId: id,
      eliminatedPlayerId,
      eliminatedByPlayerId: eliminatedByPlayerId ?? null,
      levelNumber: clock?.currentLevelNumber ?? 1,
    });

    // Deactivate a table that just lost its last active player.
    if (reg.seatTableId) {
      const [{ remaining }] = await fastify.db
        .select({ remaining: sql<number>`count(*)` })
        .from(schema.registrations)
        .where(and(eq(schema.registrations.seatTableId, reg.seatTableId), eq(schema.registrations.status, "active")));
      if (Number(remaining) === 0) {
        await fastify.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.id, reg.seatTableId));
      }
    }

    return respond(fastify, id);
  });

  // ---- rebalance tables ----

  fastify.post("/api/td/tournaments/:id/rebalance", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    const tableRows = await fastify.db
      .select()
      .from(schema.tables)
      .where(and(eq(schema.tables.tournamentId, id), eq(schema.tables.isActive, true)));

    const activeRegs = await fastify.db
      .select({
        playerId: schema.registrations.playerId,
        seatTableId: schema.registrations.seatTableId,
        seatNo: schema.registrations.seatNo,
      })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "active")));

    const occupancy = tableRows.map((t) => ({
      tableNo: t.tableNo,
      seats: activeRegs
        .filter((r) => r.seatTableId === t.id)
        .map((r) => ({ playerId: r.playerId, seatNo: r.seatNo ?? 0 })),
    }));

    const { moves, brokenTableNos } = rebalanceTables(occupancy, tournament.maxSeatsPerTable);
    const tableIdByNo = new Map(tableRows.map((t) => [t.tableNo, t.id]));

    for (const move of moves) {
      await fastify.db
        .update(schema.registrations)
        .set({ seatTableId: tableIdByNo.get(move.toTableNo), seatNo: move.seatNo })
        .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, move.playerId)));
    }

    for (const tableNo of brokenTableNos) {
      const tableId = tableIdByNo.get(tableNo);
      if (tableId) await fastify.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.id, tableId));
    }

    return respond(fastify, id);
  });

  // ---- re-entry / add-on ----

  fastify.post("/api/td/tournaments/:id/rebuy", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };
    const { playerId, type } = z.object({ playerId: z.string().uuid(), type: z.enum(["reentry", "addon"]) }).parse(
      request.body,
    );

    const [clock] = await fastify.db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, id));
    const levelNumber = clock?.currentLevelNumber ?? 1;

    const [reg] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));
    if (!reg) return reply.code(404).send({ error: "player is not registered for this tournament" });

    if (type === "reentry") {
      if (reg.status !== "eliminated") {
        return reply.code(409).send({ error: "only an eliminated player can re-enter" });
      }
      if (tournament.reentryAllowedUntilLevel && levelNumber > tournament.reentryAllowedUntilLevel) {
        return reply.code(409).send({ error: "re-entry window has closed" });
      }

      await fastify.db.insert(schema.rebuyAddonTransactions).values({
        tournamentId: id,
        playerId,
        type: "reentry",
        amount: tournament.reentryPrice ?? tournament.buyIn,
        stackGranted: tournament.startingStack,
        levelNumberAtPurchase: levelNumber,
      });

      await seatPlayerIntoActiveTable(fastify, id, playerId, tournament.maxSeatsPerTable);
      await fastify.db
        .update(schema.registrations)
        .set({ currentStack: tournament.startingStack })
        .where(eq(schema.registrations.id, reg.id));
    } else {
      if (reg.status !== "active") {
        return reply.code(409).send({ error: "only an active player can take an add-on" });
      }
      const addonStack = tournament.addonStack ?? 0;
      await fastify.db.insert(schema.rebuyAddonTransactions).values({
        tournamentId: id,
        playerId,
        type: "addon",
        amount: tournament.addonPrice ?? "0",
        stackGranted: addonStack,
        levelNumberAtPurchase: levelNumber,
      });
      await fastify.db
        .update(schema.registrations)
        .set({ currentStack: sql`coalesce(${schema.registrations.currentStack}, 0) + ${addonStack}` })
        .where(eq(schema.registrations.id, reg.id));
    }

    return respond(fastify, id);
  });

  // ---- manual stack correction (TD walks the room, counts chips) ----

  fastify.post("/api/td/tournaments/:id/stack", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { playerId, currentStack } = z
      .object({ playerId: z.string().uuid(), currentStack: z.number().int().min(0) })
      .parse(request.body);

    await fastify.db
      .update(schema.registrations)
      .set({ currentStack })
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));

    return respond(fastify, id);
  });

  // ---- manual seat move (player asked to move, TD override) ----

  fastify.post("/api/td/tournaments/:id/move-seat", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { playerId, tableNo, seatNo } = z
      .object({ playerId: z.string().uuid(), tableNo: z.number().int(), seatNo: z.number().int().min(1) })
      .parse(request.body);

    const [table] = await fastify.db
      .select()
      .from(schema.tables)
      .where(and(eq(schema.tables.tournamentId, id), eq(schema.tables.tableNo, tableNo), eq(schema.tables.isActive, true)));
    if (!table) return reply.code(404).send({ error: "table not found" });

    const [occupant] = await fastify.db
      .select({ playerId: schema.registrations.playerId })
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.seatTableId, table.id),
          eq(schema.registrations.seatNo, seatNo),
          eq(schema.registrations.status, "active"),
        ),
      );
    if (occupant && occupant.playerId !== playerId) {
      return reply.code(409).send({ error: "seat is occupied" });
    }

    await fastify.db
      .update(schema.registrations)
      .set({ seatTableId: table.id, seatNo })
      .where(
        and(
          eq(schema.registrations.tournamentId, id),
          eq(schema.registrations.playerId, playerId),
          eq(schema.registrations.status, "active"),
        ),
      );

    return respond(fastify, id);
  });

  // ---- undo last knockout (TD mis-clicked / it wasn't a real elimination) ----

  fastify.post("/api/td/tournaments/:id/undo-knockout", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    const [lastKnockout] = await fastify.db
      .select()
      .from(schema.knockouts)
      .where(eq(schema.knockouts.tournamentId, id))
      .orderBy(desc(schema.knockouts.createdAt))
      .limit(1);
    if (!lastKnockout) return reply.code(409).send({ error: "no knockout to undo" });

    await fastify.db.delete(schema.knockouts).where(eq(schema.knockouts.id, lastKnockout.id));
    // The eliminated player's old seat was cleared at elimination time, so
    // there's nothing to restore to — reseat fresh, same as a re-entry.
    await seatPlayerIntoActiveTable(fastify, id, lastKnockout.eliminatedPlayerId, tournament.maxSeatsPerTable);

    return respond(fastify, id);
  });

  // ---- manual table add/close ----

  fastify.post("/api/td/tournaments/:id/tables/add", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    const existing = await fastify.db
      .select({ tableNo: schema.tables.tableNo })
      .from(schema.tables)
      .where(eq(schema.tables.tournamentId, id));
    const nextTableNo = existing.length > 0 ? Math.max(...existing.map((t) => t.tableNo)) + 1 : 1;

    await fastify.db
      .insert(schema.tables)
      .values({ tournamentId: id, tableNo: nextTableNo, maxSeats: tournament.maxSeatsPerTable });

    return respond(fastify, id);
  });

  fastify.post("/api/td/tournaments/:id/tables/:tableNo/close", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id, tableNo } = request.params as { id: string; tableNo: string };

    const [table] = await fastify.db
      .select()
      .from(schema.tables)
      .where(and(eq(schema.tables.tournamentId, id), eq(schema.tables.tableNo, Number(tableNo))));
    if (!table) return reply.code(404).send({ error: "table not found" });

    const [{ seated }] = await fastify.db
      .select({ seated: sql<number>`count(*)` })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.seatTableId, table.id), eq(schema.registrations.status, "active")));
    if (Number(seated) > 0) {
      return reply.code(409).send({ error: "move players out before closing this table" });
    }

    await fastify.db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.id, table.id));

    return respond(fastify, id);
  });

  // ---- push a transient announcement to the public board ----

  fastify.post("/api/td/tournaments/:id/announce", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { text, durationSeconds } = z
      .object({ text: z.string().min(1).max(200), durationSeconds: z.number().int().min(5).max(600).default(60) })
      .parse(request.body);

    setAnnouncement(id, text, durationSeconds);

    return respond(fastify, id);
  });

  // ---- QR check-in: player's "My QR" scanned by TD ----

  fastify.post("/api/td/tournaments/:id/checkin-by-qr", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { token } = z.object({ token: z.string().min(1) }).parse(request.body);

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return reply.code(500).send({ error: "server misconfigured" });

    let payload: { playerId: string; purpose: string };
    try {
      payload = jwt.verify(token, jwtSecret) as typeof payload;
    } catch {
      return reply.code(400).send({ error: "invalid or expired QR code" });
    }
    if (payload.purpose !== "checkin") {
      return reply.code(400).send({ error: "invalid QR code" });
    }

    const [reg] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, payload.playerId)));
    if (!reg) return reply.code(404).send({ error: "player is not registered for this tournament" });
    if (reg.status !== "registered" && reg.status !== "checked_in") {
      return reply.code(409).send({ error: `player is already ${reg.status}` });
    }

    await fastify.db
      .update(schema.registrations)
      .set({ status: "checked_in" })
      .where(eq(schema.registrations.id, reg.id));

    return respond(fastify, id);
  });

  // ---- publish results ----

  fastify.get("/api/td/tournaments/:id/standings-preview", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };

    const standings = await computeFinalStandings(fastify.db, id);
    if (!standings) {
      return { ready: false };
    }
    return { ready: true, ...standings, suggestedPayouts: suggestPayouts(standings) };
  });

  fastify.post("/api/td/tournaments/:id/publish", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    if (tournament.status !== "running") {
      return reply.code(409).send({ error: "tournament is not running" });
    }

    const standings = await computeFinalStandings(fastify.db, id);
    if (!standings) {
      return reply.code(409).send({ error: "tournament still has more than one active player" });
    }

    const { payouts } = z.object({ payouts: z.record(z.string(), z.number()) }).parse(request.body);

    for (const row of standings.rows) {
      const payout = payouts[row.playerId];
      await fastify.db.insert(schema.tournamentResults).values({
        tournamentId: id,
        playerId: row.playerId,
        place: row.place,
        rpsAwarded: row.rpsAwarded,
        knockoutsCount: row.knockoutsCount,
        bountyPoints: row.bountyPoints,
        payout: payout !== undefined ? String(payout) : null,
      });

      await fastify.db.insert(schema.rpsLedger).values({
        playerId: row.playerId,
        clubId: tournament.clubId,
        tournamentId: id,
        delta: row.rpsAwarded,
        reason: `${tournament.name}: место ${row.place}`,
      });
    }

    await fastify.db.update(schema.tournaments).set({ status: "finished" }).where(eq(schema.tournaments.id, id));

    publishTournamentUpdate(id);
    return { published: true, standings: standings.rows };
  });
}
