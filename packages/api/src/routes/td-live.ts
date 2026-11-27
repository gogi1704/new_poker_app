import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";
import { buildLiveState } from "../services/live.js";
import { publishTournamentUpdate } from "../services/realtime.js";
import { rebalanceTables } from "../services/seating.js";
import { seatPlayerIntoActiveTable, checkInAndSeat, undoCheckIn } from "../services/checkin.js";
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

export default async function tdLiveRoutes(fastify: FastifyInstance) {
  // ---- check-in: seats the player immediately (table + box), so the TD can
  // tell them on the spot where to sit instead of waiting for a later batch
  // seating step ----

  fastify.post("/api/td/tournaments/:id/checkin", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };
    const { playerId, checkedIn } = z.object({ playerId: z.string().uuid(), checkedIn: z.boolean() }).parse(
      request.body,
    );

    if (checkedIn) {
      await checkInAndSeat(fastify.db, id, tournament, playerId);
    } else {
      await undoCheckIn(fastify.db, id, playerId);
    }

    return respond(fastify, id);
  });

  // TD override: move someone off the waitlist into the tournament on the
  // spot, regardless of queue order (a no-show frees a seat, the TD knows
  // who's actually in the room). Automatic FIFO promotion on a real
  // cancellation already happens in tournaments.ts's /unregister — this is
  // only for the TD's own manual call.
  fastify.post("/api/td/tournaments/:id/promote-waitlist", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id } = request.params as { id: string };
    const { playerId } = z.object({ playerId: z.string().uuid() }).parse(request.body);

    const [reg] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));
    if (!reg || reg.status !== "waitlisted") {
      return reply.code(409).send({ error: "player is not on the waitlist" });
    }

    await fastify.db.update(schema.registrations).set({ status: "registered" }).where(eq(schema.registrations.id, reg.id));

    return respond(fastify, id);
  });

  // ---- start tournament: requires players to already be checked in (and
  // therefore already seated — check-in itself seats them, see
  // services/checkin.ts). There is deliberately no bulk "seat everyone
  // registered" fallback here: an online registration is not a confirmation
  // of physical presence, so only individually checked-in players ever take
  // a seat or count toward the field. ----

  fastify.post("/api/td/tournaments/:id/start", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { tournament } = ctx;
    const { id } = request.params as { id: string };

    if (tournament.status === "running") return reply.code(409).send({ error: "already running" });

    const [{ active }] = await fastify.db
      .select({ active: sql<number>`count(*)` })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "active")));
    if (Number(active) < 2) return reply.code(409).send({ error: "need at least 2 checked-in players to start" });

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
    const { eliminatedPlayerId, eliminatedByPlayerId, bountyPoints } = z
      .object({
        eliminatedPlayerId: z.string().uuid(),
        eliminatedByPlayerId: z.string().uuid().nullable().optional(),
        // Rating points this knockout is worth — the TD picks a preset
        // (50/100) or types a custom amount live, when marking it. Left
        // unset, it falls back to the tournament's flat default at
        // standings time (see standings.ts), matching the old behavior.
        bountyPoints: z.number().int().min(0).nullable().optional(),
      })
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
      bountyPoints: eliminatedByPlayerId ? bountyPoints ?? null : null,
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

      await seatPlayerIntoActiveTable(fastify.db, id, playerId, tournament.maxSeatsPerTable);
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

  // ---- custom table name (e.g. "Финальный стол") instead of just "Стол N" ----

  fastify.post("/api/td/tournaments/:id/tables/:tableNo/label", async (request, reply) => {
    const ctx = await requireStaffAndTournament(fastify, request, reply);
    if (!ctx) return;
    const { id, tableNo: tableNoParam } = request.params as { id: string; tableNo: string };
    const tableNo = Number(tableNoParam);
    const { label } = z.object({ label: z.string().trim().max(60).nullable() }).parse(request.body);

    const [table] = await fastify.db
      .select({ id: schema.tables.id })
      .from(schema.tables)
      .where(and(eq(schema.tables.tournamentId, id), eq(schema.tables.tableNo, tableNo), eq(schema.tables.isActive, true)));
    if (!table) return reply.code(404).send({ error: "table not found" });

    await fastify.db
      .update(schema.tables)
      .set({ label: label === "" ? null : label })
      .where(eq(schema.tables.id, table.id));

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
    await seatPlayerIntoActiveTable(fastify.db, id, lastKnockout.eliminatedPlayerId, tournament.maxSeatsPerTable);

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
    const { tournament } = ctx;
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

    const seat = await checkInAndSeat(fastify.db, id, tournament, payload.playerId);

    // SSE already pushes the full state to every connected view; this
    // response additionally carries the seat directly so the scanner UI can
    // show "Стол X, место Y" the instant the scan completes, with no need to
    // wait on/parse the next SSE push.
    return { ...(await respond(fastify, id)), seat };
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
