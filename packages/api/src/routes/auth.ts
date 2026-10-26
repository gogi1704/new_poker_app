import type { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { schema } from "@poker/shared";
import { validateTelegramInitData } from "../lib/telegram-init-data.js";

const bodySchema = z.object({ initData: z.string().min(1) });

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/telegram", async (request, reply) => {
    const botToken = process.env.BOT_TOKEN;
    const jwtSecret = process.env.JWT_SECRET;
    if (!botToken || !jwtSecret) {
      return reply.code(500).send({ error: "server misconfigured" });
    }

    const { initData } = bodySchema.parse(request.body);

    let validated;
    try {
      validated = validateTelegramInitData(initData, botToken);
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }

    const telegramId = String(validated.user.id);
    const nickname =
      validated.user.username ??
      [validated.user.first_name, validated.user.last_name].filter(Boolean).join(" ");
    // Telegram omits photo_url entirely when the user has no profile photo —
    // normalize to null (not undefined) since it gets interpolated into a
    // raw sql`` template below, and drizzle silently mis-renders undefined
    // params there (produces invalid SQL rather than binding NULL).
    const avatarUrl = validated.user.photo_url ?? null;

    const [player] = await fastify.db
      .insert(schema.players)
      .values({
        telegramId,
        nickname,
        avatarUrl,
        derivedEmail: `telegram_${telegramId}@telegram.user`,
      })
      .onConflictDoUpdate({
        target: schema.players.telegramId,
        // Logging in again after a 152-ФЗ data-deletion request is treated as
        // renewed consent — it un-deletes the account rather than leaving it
        // in a confusing half-deleted state the player can't recover from.
        // But for a normal, already-active account, nickname/avatar are now
        // player-editable (see /api/profile PUT) — re-authenticating on every
        // app open must NOT clobber a customized profile back to whatever
        // Telegram happens to have, so those two columns only get reset to
        // the fresh Telegram values when the row is actually coming back
        // from a deleted state.
        set: {
          nickname: sql`case when ${schema.players.deletedAt} is not null then ${nickname} else ${schema.players.nickname} end`,
          avatarUrl: sql`case when ${schema.players.deletedAt} is not null then ${avatarUrl} else ${schema.players.avatarUrl} end`,
          deletedAt: null,
        },
      })
      .returning();

    // Ensure membership in the single default club (multi-club comes later).
    const [club] = await fastify.db.select().from(schema.clubs).limit(1);
    if (club) {
      await fastify.db
        .insert(schema.clubMemberships)
        .values({
          clubId: club.id,
          playerId: player.id,
          cardId: randomUUID(),
        })
        .onConflictDoNothing();
    }

    const token = jwt.sign({ playerId: player.id, telegramId }, jwtSecret, {
      expiresIn: "24h",
    });

    return { token, player };
  });
}
