import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";
import { buildLiveState } from "../services/live.js";
import { publishTournamentUpdate } from "../services/realtime.js";
import { dealInitialSeats, rebalanceTables, MAX_SEATS_PER_TABLE } from "../services/seating.js";
import { computeFinalStandings, suggestPayouts } from "../services/standings.js";

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

  // ---- start tournament: seat checked-in players, start the clock ----

  fastify.post("/api/td/tournaments/:id/start", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    if (tournament.status === "running") return reply.code(409).send({ error: "already running" });

    const checkedIn = await fastify.db
      .select({ playerId: schema.registrations.playerId })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "checked_in")));

    if (checkedIn.length < 2) {
      return reply.code(409).send({ error: "need at least 2 checked-in players to start" });
    }

    const seats = dealInitialSeats(checkedIn.map((c) => c.playerId));
    const tableNos = [...new Set(seats.map((s) => s.tableNo))];

    const insertedTables = await fastify.db
      .insert(schema.tables)
      .values(tableNos.map((tableNo) => ({ tournamentId: id, tableNo, maxSeats: MAX_SEATS_PER_TABLE })))
      .returning();
    const tableIdByNo = new Map(insertedTables.map((t) => [t.tableNo, t.id]));

    for (const seat of seats) {
      await fastify.db
        .update(schema.registrations)
        .set({ status: "active", seatTableId: tableIdByNo.get(seat.tableNo), seatNo: seat.seatNo })
        .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, seat.playerId)));
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
    const { direction } = z.object({ direction: z.enum(["next", "prev"]) }).parse(request.body);

    const [clock] = await fastify.db
      .select()
      .from(schema.tournamentClockState)
      .where(eq(schema.tournamentClockState.tournamentId, id));
    if (!clock) return reply.code(409).send({ error: "tournament has not started" });

    const nextLevel = Math.max(1, clock.currentLevelNumber + (direction === "next" ? 1 : -1));
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

    const { moves, brokenTableNos } = rebalanceTables(occupancy);
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

      const tableRows = await fastify.db
        .select()
        .from(schema.tables)
        .where(and(eq(schema.tables.tournamentId, id), eq(schema.tables.isActive, true)));
      // Track occupied seat *numbers*, not just a count — after an elimination
      // leaves a gap (e.g. seat 3 frees up while 1,2,4,5 stay taken), "count+1"
      // would pick an already-occupied seat instead of reusing the gap.
      const occupancy = await Promise.all(
        tableRows.map(async (t) => {
          const seated = await fastify.db
            .select({ seatNo: schema.registrations.seatNo })
            .from(schema.registrations)
            .where(and(eq(schema.registrations.seatTableId, t.id), eq(schema.registrations.status, "active")));
          const takenSeats = new Set(seated.map((s) => s.seatNo));
          return { table: t, takenSeats };
        }),
      );
      occupancy.sort((a, b) => a.takenSeats.size - b.takenSeats.size);
      let target = occupancy[0];
      if (!target || target.takenSeats.size >= MAX_SEATS_PER_TABLE) {
        const [newTable] = await fastify.db
          .insert(schema.tables)
          .values({ tournamentId: id, tableNo: tableRows.length + 1, maxSeats: MAX_SEATS_PER_TABLE })
          .returning();
        target = { table: newTable, takenSeats: new Set() };
      }

      let seatNo = 1;
      while (target.takenSeats.has(seatNo)) seatNo += 1;

      await fastify.db
        .update(schema.registrations)
        .set({ status: "active", seatTableId: target.table.id, seatNo })
        .where(eq(schema.registrations.id, reg.id));
    } else {
      if (reg.status !== "active") {
        return reply.code(409).send({ error: "only an active player can take an add-on" });
      }
      await fastify.db.insert(schema.rebuyAddonTransactions).values({
        tournamentId: id,
        playerId,
        type: "addon",
        amount: tournament.addonPrice ?? "0",
        stackGranted: tournament.addonStack ?? 0,
        levelNumberAtPurchase: levelNumber,
      });
    }

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
