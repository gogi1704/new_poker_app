import { sql } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { schema } from "@poker/shared";
import type { FastifyInstance } from "fastify";

export interface TelegramIdentity {
  telegramId: string;
  nickname: string;
  avatarUrl: string | null;
}

/**
 * Upserts the player row for a Telegram identity, ensures membership in the
 * single default club, and issues a session JWT. Shared by both login paths
 * (Mini App `initData` and the browser Login Widget) since everything past
 * "we know this is telegramId X" is identical.
 */
export async function issueTelegramSession(fastify: FastifyInstance, identity: TelegramIdentity) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is not set");

  const { telegramId, nickname, avatarUrl } = identity;

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
      // See routes/auth.ts history: only reset nickname/avatar from Telegram
      // when the row is coming back from a deleted state, so player-edited
      // profiles survive re-authentication.
      set: {
        nickname: sql`case when ${schema.players.deletedAt} is not null then ${nickname} else ${schema.players.nickname} end`,
        avatarUrl: sql`case when ${schema.players.deletedAt} is not null then ${avatarUrl} else ${schema.players.avatarUrl} end`,
        deletedAt: null,
      },
    })
    .returning();

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

  return {
    token,
    player,
    club: club ? { name: club.name, logoUrl: club.logoUrl } : null,
  };
}
