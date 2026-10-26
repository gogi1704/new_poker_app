import type { FastifyInstance } from "fastify";
import { and, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireOwner } from "../services/staff.js";

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

  // Lets the TD grant access by nickname instead of needing someone's raw
  // numeric Telegram ID — only finds people who have already opened the bot.
  fastify.get("/api/td/players/search", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
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
}
