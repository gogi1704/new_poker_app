import type { FastifyInstance } from "fastify";
import { and, asc, eq, ne, notInArray, sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";
import { publishTournamentUpdate } from "../services/realtime.js";

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

    const [tournament] = await fastify.db
      .select()
      .from(schema.tournaments)
      .where(and(eq(schema.tournaments.id, id), eq(schema.tournaments.clubId, club.id)));
    if (!tournament) return reply.code(404).send({ error: "not found" });
    if (tournament.status !== "scheduled" && tournament.status !== "registering") {
      return reply.code(409).send({ error: "registration is closed for this tournament" });
    }

    const [existing] = await fastify.db
      .select()
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), eq(schema.registrations.playerId, playerId)));

    if (existing && existing.status !== "cancelled") {
      return { status: existing.status };
    }

    const [{ seatsFilled }] = await fastify.db
      .select({ seatsFilled: sql<number>`count(*)` })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.tournamentId, id), ne(schema.registrations.status, "cancelled")));
    if (Number(seatsFilled) >= tournament.maxSeats) {
      return reply.code(409).send({ error: "tournament is full" });
    }

    if (existing) {
      await fastify.db
        .update(schema.registrations)
        .set({ status: "registered", registeredAt: new Date() })
        .where(eq(schema.registrations.id, existing.id));
    } else {
      await fastify.db.insert(schema.registrations).values({ tournamentId: id, playerId });
    }

    publishTournamentUpdate(id);
    return { status: "registered" };
  });
}
