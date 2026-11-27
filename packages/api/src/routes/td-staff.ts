import type { FastifyInstance } from "fastify";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { schema, buildPlayerRosterExport, importPlayerRoster } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireOwner, requireStaff } from "../services/staff.js";

export default async function tdStaffRoutes(fastify: FastifyInstance) {
  fastify.get("/api/td/staff", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const rows = await fastify.db
      .select({
        telegramId: schema.staffAccounts.telegramId,
        role: schema.staffAccounts.role,
        createdAt: schema.staffAccounts.createdAt,
        nickname: schema.players.nickname,
        avatarUrl: schema.players.avatarUrl,
      })
      .from(schema.staffAccounts)
      .leftJoin(schema.players, eq(schema.players.telegramId, schema.staffAccounts.telegramId))
      .where(eq(schema.staffAccounts.clubId, club.id));

    return rows;
  });

  fastify.post("/api/td/staff", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { telegramId, role } = z
      .object({ telegramId: z.string().min(1), role: z.enum(["owner", "td", "floor"]) })
      .parse(request.body);

    await fastify.db
      .insert(schema.staffAccounts)
      .values({ clubId: club.id, telegramId, role })
      .onConflictDoUpdate({
        target: [schema.staffAccounts.clubId, schema.staffAccounts.telegramId],
        set: { role },
      });

    return { telegramId, role };
  });

  fastify.delete("/api/td/staff/:telegramId", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { telegramId } = request.params as { telegramId: string };

    const [target] = await fastify.db
      .select()
      .from(schema.staffAccounts)
      .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.telegramId, telegramId)));
    if (!target) return reply.code(404).send({ error: "not found" });

    if (target.role === "owner") {
      const owners = await fastify.db
        .select({ telegramId: schema.staffAccounts.telegramId })
        .from(schema.staffAccounts)
        .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.role, "owner")));
      if (owners.length <= 1) {
        return reply.code(409).send({ error: "cannot remove the last owner" });
      }
    }

    await fastify.db
      .delete(schema.staffAccounts)
      .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.telegramId, telegramId)));

    return { removed: true };
  });

  // Finds an existing player by nickname — used both by the owner-only
  // "grant staff access" picker and, at any staff level, by check-in/
  // registration to find someone instead of creating a new walk-in. Only
  // finds people who have already opened the bot (or were mirrored onto
  // this device — see the roster export/import below).
  fastify.get("/api/td/players/search", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { q } = z.object({ q: z.string().min(1) }).parse(request.query);

    const rows = await fastify.db
      .select({
        id: schema.players.id,
        telegramId: schema.players.telegramId,
        nickname: schema.players.nickname,
        avatarUrl: schema.players.avatarUrl,
      })
      .from(schema.players)
      .where(ilike(schema.players.nickname, `%${q}%`))
      .limit(20);

    return rows;
  });

  // ---- full player roster mirror (cloud -> local offline launcher) ----
  // The local stack otherwise only ever learns about a player once they're
  // pulled in as part of a specific tournament's registrations — these two
  // routes let the offline launcher mirror the WHOLE club roster onto the
  // laptop instead, so the TD can find and add an existing bot user by
  // nickname during check-in even when that person never registered for
  // this tournament online. Owner-only, matching every other sync route.

  fastify.get("/api/td/players/export-roster", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    return buildPlayerRosterExport(fastify.db, club.id);
  });

  fastify.post("/api/td/players/import-roster", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    try {
      return await importPlayerRoster(fastify.db, club.id, request.body);
    } catch (err) {
      return reply.code(400).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });
}
