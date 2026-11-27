import type { FastifyInstance } from "fastify";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";
import { publishTournamentUpdate } from "../services/realtime.js";
import { checkInAndSeat, type SeatResult } from "../services/checkin.js";

type RegisterResult = { ok: true; status: string } | { ok: false; code: number; error: string };

// Shared by register-player (existing player, picked from a search/scan) and
// register-walkin (brand-new player created on the spot) — everything past
// "we have a playerId" is identical: same seat-cap check, same idempotency.
async function registerPlayerInTournament(
  fastify: FastifyInstance,
  clubId: string,
  tournamentId: string,
  playerId: string,
): Promise<RegisterResult> {
  const [tournament] = await fastify.db
    .select()
    .from(schema.tournaments)
    .where(and(eq(schema.tournaments.id, tournamentId), eq(schema.tournaments.clubId, clubId)));
  if (!tournament) return { ok: false, code: 404, error: "not found" };
  if (tournament.status !== "scheduled" && tournament.status !== "registering") {
    return { ok: false, code: 409, error: "registration is closed for this tournament" };
  }

  const [existing] = await fastify.db
    .select()
    .from(schema.registrations)
    .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.playerId, playerId)));

  if (existing && existing.status !== "cancelled") {
    return { ok: true, status: existing.status };
  }

  const [{ seatsFilled }] = await fastify.db
    .select({ seatsFilled: sql<number>`count(*)` })
    .from(schema.registrations)
    .where(
      and(
        eq(schema.registrations.tournamentId, tournamentId),
        notInArray(schema.registrations.status, ["cancelled", "waitlisted"]),
      ),
    );

  // Full tournament doesn't reject registration any more — it joins the
  // waitlist, same as the player-facing self-service path in tournaments.ts.
  const status = Number(seatsFilled) >= tournament.maxSeats ? "waitlisted" : "registered";

  if (existing) {
    await fastify.db
      .update(schema.registrations)
      .set({ status, registeredAt: new Date() })
      .where(eq(schema.registrations.id, existing.id));
  } else {
    await fastify.db.insert(schema.registrations).values({ tournamentId, playerId, status });
  }

  publishTournamentUpdate(tournamentId);
  return { ok: true, status };
}

type RegisterAndSeatResult = { ok: true; status: string; seat: SeatResult | null } | { ok: false; code: number; error: string };

// Shared tail for the check-in desk: once we know a playerId — a brand-new
// walk-in, or an existing bot user found by nickname (see
// register-existing below) — register them for this tournament and
// immediately check them in. Either way they're standing at the desk right
// now, so there's no "register now, check in later" step the way there can
// be for a pre-event online registration.
async function registerAndSeat(
  fastify: FastifyInstance,
  clubId: string,
  tournamentId: string,
  playerId: string,
): Promise<RegisterAndSeatResult> {
  const result = await registerPlayerInTournament(fastify, clubId, tournamentId, playerId);
  if (!result.ok) return result;
  // Waitlisted means the tournament is already at capacity — nothing to seat
  // them at yet. The TD can promote them from the waitlist once a spot opens.
  if (result.status === "waitlisted") return { ok: true, status: result.status, seat: null };

  const [tournament] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, tournamentId));
  const seat = tournament ? await checkInAndSeat(fastify.db, tournamentId, tournament, playerId) : null;
  return { ok: true, status: result.status, seat };
}

/**
 * General-purpose walk-in desk: TD scans a player's "My QR" (same signed
 * token as the per-tournament checkin-by-qr in td-live.ts) without first
 * having to be inside one specific tournament's live console. Identifies
 * the player, then lists every open tournament annotated with that
 * player's registration status in it, so the TD can register them into
 * one on the spot or confirm attendance for one they already registered
 * for online.
 */
export default async function tdScanRoutes(fastify: FastifyInstance) {
  fastify.post("/api/td/scan", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

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

    const [player] = await fastify.db.select().from(schema.players).where(eq(schema.players.id, payload.playerId));
    if (!player) return reply.code(404).send({ error: "player not found" });

    const tournamentRows = await fastify.db
      .select({
        id: schema.tournaments.id,
        name: schema.tournaments.name,
        status: schema.tournaments.status,
        scheduledAt: schema.tournaments.scheduledAt,
      })
      .from(schema.tournaments)
      .where(
        and(
          eq(schema.tournaments.clubId, club.id),
          notInArray(schema.tournaments.status, ["finished", "cancelled"]),
          eq(schema.tournaments.archived, false),
        ),
      )
      .orderBy(asc(schema.tournaments.scheduledAt));

    const regRows = await fastify.db
      .select({ tournamentId: schema.registrations.tournamentId, status: schema.registrations.status })
      .from(schema.registrations)
      .where(eq(schema.registrations.playerId, player.id));
    const regByTournament = new Map(regRows.map((r) => [r.tournamentId, r.status]));

    return {
      player: { id: player.id, nickname: player.nickname, avatarUrl: player.avatarUrl },
      tournaments: tournamentRows.map((t) => ({ ...t, myStatus: regByTournament.get(t.id) ?? "none" })),
    };
  });

  // Staff-initiated registration — the player-facing /api/tournaments/:id/register
  // in tournaments.ts mirrors this same seat-cap/idempotency logic for self-service.
  fastify.post("/api/td/tournaments/:id/register-player", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const { playerId } = z.object({ playerId: z.string().uuid() }).parse(request.body);

    const result = await registerPlayerInTournament(fastify, club.id, id, playerId);
    if (!result.ok) return reply.code(result.code).send({ error: result.error });
    return { status: result.status };
  });

  // Offline/walk-in desk: creates a brand-new player with a synthetic identity
  // (no Telegram account needed — see docs/OFFLINE.md) and registers them in
  // one step. Used when the TD adds someone in person who has never opened the bot.
  fastify.post("/api/td/tournaments/:id/register-walkin", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const { nickname } = z.object({ nickname: z.string().trim().min(1).max(100) }).parse(request.body);

    const telegramId = `local-${randomUUID()}`;
    const [player] = await fastify.db
      .insert(schema.players)
      .values({ telegramId, nickname, derivedEmail: `local_${randomUUID()}@local.user` })
      .returning();

    await fastify.db
      .insert(schema.clubMemberships)
      .values({ clubId: club.id, playerId: player.id, cardId: randomUUID() })
      .onConflictDoNothing();

    const outcome = await registerAndSeat(fastify, club.id, id, player.id);
    if (!outcome.ok) return reply.code(outcome.code).send({ error: outcome.error });

    return {
      player: { id: player.id, nickname: player.nickname, avatarUrl: player.avatarUrl },
      status: outcome.status,
      seat: outcome.seat,
    };
  });

  // Offline/at-the-desk alternative to a brand-new walk-in: the person is an
  // EXISTING bot user (found via /api/td/players/search by nickname — on the
  // offline launcher this searches the full roster mirrored onto the laptop,
  // see playerRoster.ts) who just wasn't pre-registered for this tournament
  // online. Registers and seats them in one step, exactly like a walk-in,
  // but without creating a duplicate synthetic identity for someone who
  // already has a real one.
  fastify.post("/api/td/tournaments/:id/register-existing", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const { playerId } = z.object({ playerId: z.string().uuid() }).parse(request.body);

    const [player] = await fastify.db.select().from(schema.players).where(eq(schema.players.id, playerId));
    if (!player) return reply.code(404).send({ error: "player not found" });

    const outcome = await registerAndSeat(fastify, club.id, id, playerId);
    if (!outcome.ok) return reply.code(outcome.code).send({ error: outcome.error });

    return {
      player: { id: player.id, nickname: player.nickname, avatarUrl: player.avatarUrl },
      status: outcome.status,
      seat: outcome.seat,
    };
  });
}
