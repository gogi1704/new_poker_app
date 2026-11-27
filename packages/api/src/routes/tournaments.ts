import type { FastifyInstance } from "fastify";
import { and, asc, desc, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireAuth } from "../plugins/auth.js";
import { sendDirectMessage } from "../services/telegram-broadcast.js";

// Registrations in either of these statuses don't occupy a real seat — used
// everywhere "how full is this tournament" needs an answer (seat caps, the
// public seats-filled count).
const NON_SEAT_STATUSES: ("cancelled" | "waitlisted")[] = ["cancelled", "waitlisted"];

export default async function tournamentsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/tournaments", async (request) => {
    const club = await getDefaultClub(fastify.db);
    const mine = (request.query as { mine?: string }).mine === "true";

    // Table-qualify the correlation explicitly: a bare column reference here would
    // resolve against the subquery's own "registrations" alias (which also has an
    // "id" column) instead of the outer "tournaments" row, since Drizzle only
    // qualifies column names when the outer query itself has more than one table.
    const seatsFilledSubquery = sql<number>`(
      select count(*) from ${schema.registrations} r
      where r.tournament_id = tournaments.id and r.status not in ('cancelled', 'waitlisted')
    )`;

    const rows = await fastify.db
      .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        format: schema.tournaments.format,
        status: schema.tournaments.status,
        scheduledAt: schema.tournaments.scheduledAt,
        buyIn: schema.tournaments.buyIn,
        startingStack: schema.tournaments.startingStack,
        maxSeats: schema.tournaments.maxSeats,
        reentryPrice: schema.tournaments.reentryPrice,
        rpsFormulaParams: schema.tournaments.rpsFormulaParams,
        seatsFilled: seatsFilledSubquery.as("seats_filled"),
      })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.clubId, club.id),
          notInArray(schema.tournaments.status, ["finished", "cancelled"]),
        ),
      )
      .orderBy(asc(schema.tournaments.scheduledAt));

    let myRegisteredIds = new Set<string>();
    if (request.playerId) {
      const regs = await fastify.db
        .select({ tournamentId: schema.registrations.tournamentId })
        .from(schema.registrations)
        .where(
          and(eq(schema.registrations.playerId, request.playerId), ne(schema.registrations.status, "cancelled")),
        );
      myRegisteredIds = new Set(regs.map((r) => r.tournamentId));
    }

    const withMine = rows.map((t) => ({ ...t, isMine: myRegisteredIds.has(t.id) }));
    return mine ? withMine.filter((t) => t.isMine) : withMine;
  });

  fastify.get("/api/tournaments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };

    const [tournament] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id));
    if (!tournament) return reply.code(404).send({ error: "not found" });

    const blindLevels = await fastify.db
      .select()
      .from(schema.blindLevels)
      .where(eq(schema.blindLevels.tournamentId, id))
      .orderBy(asc(schema.blindLevels.levelNumber));

    const participantRows = await fastify.db
      .select({
        playerId: schema.registrations.playerId,
        status: schema.registrations.status,
        nickname: schema.players.nickname,
        avatarUrl: schema.players.avatarUrl,
      })
      .from(schema.registrations)
      .innerJoin(schema.players, eq(schema.players.id, schema.registrations.playerId))
      .where(and(eq(schema.registrations.tournamentId, id), notInArray(schema.registrations.status, NON_SEAT_STATUSES)));

    const waitlistRows = await fastify.db
      .select({
        playerId: schema.registrations.playerId,
        nickname: schema.players.nickname,
        avatarUrl: schema.players.avatarUrl,
        registeredAt: schema.registrations.registeredAt,
      })
      .from(schema.registrations)
      .innerJoin(schema.players, eq(schema.players.id, schema.registrations.playerId))
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.status, "waitlisted")))
      .orderBy(asc(schema.registrations.registeredAt));

    const playerIds = participantRows.map((p) => p.playerId);
    const rpsByPlayer = new Map<string, number>();
    if (playerIds.length) {
      const rpsRows = await fastify.db
        .select({
          playerId: schema.rpsLedger.playerId,
          totalRps: sql<number>`coalesce(sum(${schema.rpsLedger.delta}), 0)`,
        })
        .from(schema.rpsLedger)
        .where(and(inArray(schema.rpsLedger.playerId, playerIds), eq(schema.rpsLedger.clubId, tournament.clubId)))
        .groupBy(schema.rpsLedger.playerId);
      for (const r of rpsRows) rpsByPlayer.set(r.playerId, Number(r.totalRps));
    }

    const participants = participantRows
      .map((p) => ({ ...p, totalRps: rpsByPlayer.get(p.playerId) ?? 0 }))
      .sort((a, b) => b.totalRps - a.totalRps);

    let myRegistration: { status: string } | null = null;
    if (request.playerId) {
      const rows = await fastify.db
        .select({ status: schema.registrations.status })
        .from(schema.registrations)
        .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, request.playerId)));
      myRegistration = rows[0] ?? null;
    }

    const myWaitlistPosition =
      myRegistration?.status === "waitlisted"
        ? waitlistRows.findIndex((w) => w.playerId === request.playerId) + 1
        : null;

    return {
      ...tournament,
      blindLevels,
      seatsFilled: participants.length,
      participants,
      waitlist: waitlistRows,
      myRegistration,
      myWaitlistPosition,
    };
  });

  fastify.post("/api/tournaments/:id/register", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;
    const { id } = request.params as { id: string };

    const [tournament] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id));
    if (!tournament) return reply.code(404).send({ error: "not found" });
    if (tournament.status !== "scheduled" && tournament.status !== "registering") {
      return reply.code(409).send({ error: "registration is closed for this tournament" });
    }

    const [existing] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));

    if (existing && existing.status !== "cancelled") {
      return { registration: existing, seatsFilled: await countSeats(fastify, id) };
    }

    const [{ seatsFilled }] = await fastify.db
      .select({ seatsFilled: sql<number>`count(*)` })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), notInArray(schema.registrations.status, NON_SEAT_STATUSES)));

    // Full tournament doesn't reject registration any more — it joins the
    // waitlist (FIFO by registeredAt) and gets auto-promoted the moment a
    // real seat frees up, see unregister below.
    const status = Number(seatsFilled) >= tournament.maxSeats ? "waitlisted" : "registered";

    const [registration] = existing
      ? await fastify.db
          .update(schema.registrations)
          .set({ status, registeredAt: new Date() })
          .where(eq(schema.registrations.id, existing.id))
          .returning()
      : await fastify.db.insert(schema.registrations).values({ tournamentId: id, playerId, status }).returning();

    return { registration, seatsFilled: await countSeats(fastify, id) };
  });

  fastify.post("/api/tournaments/:id/unregister", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;
    const { id } = request.params as { id: string };

    const [existing] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));

    if (existing && existing.status !== "cancelled") {
      const freedRealSeat = existing.status !== "waitlisted";
      await fastify.db
        .update(schema.registrations)
        .set({ status: "cancelled" })
        .where(eq(schema.registrations.id, existing.id));
      if (freedRealSeat) await promoteNextWaitlisted(fastify, id);
    }

    return { seatsFilled: await countSeats(fastify, id) };
  });
}

async function countSeats(fastify: FastifyInstance, tournamentId: string) {
  const [{ seatsFilled }] = await fastify.db
    .select({ seatsFilled: sql<number>`count(*)` })
    .from(schema.registrations)
    .where(and(eq(schema.registrations.tournamentId, tournamentId), notInArray(schema.registrations.status, NON_SEAT_STATUSES)));
  return Number(seatsFilled);
}

// Called whenever a real (non-waitlisted) seat frees up — moves the
// longest-waiting queued player into it and lets them know. The DM is
// best-effort (see sendDirectMessage) so a missing BOT_TOKEN or a blocked
// chat never stops the promotion itself from taking effect.
async function promoteNextWaitlisted(fastify: FastifyInstance, tournamentId: string) {
  const [next] = await fastify.db
    .select()
    .from(schema.registrations)
    .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.status, "waitlisted")))
    .orderBy(asc(schema.registrations.registeredAt))
    .limit(1);
  if (!next) return;

  await fastify.db.update(schema.registrations).set({ status: "registered" }).where(eq(schema.registrations.id, next.id));

  const [tournament] = await fastify.db
    .select({ name: schema.tournaments.name })
    .from(schema.tournaments)
    .where(eq(schema.tournaments.id, tournamentId));
  await sendDirectMessage(
    fastify.db,
    next.playerId,
    `🎉 Освободилось место в турнире «${tournament?.name ?? ""}» — вы переведены из очереди в число участников!`,
  );
}
