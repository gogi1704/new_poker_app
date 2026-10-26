import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { requireAuth } from "../plugins/auth.js";

const bodySchema = z.object({ enabled: z.boolean() });

export default async function settingsRoutes(fastify: FastifyInstance) {
  fastify.get("/api/settings/notifications", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;

    const [sub] = await fastify.db
      .select()
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.playerId, playerId), eq(schema.pushSubscriptions.type, "telegram_dm")));

    // No row yet means the player hasn't touched the toggle — default to on.
    return { enabled: sub ? sub.enabled : true };
  });

  fastify.post("/api/settings/notifications", async (request, reply) => {
    if (!requireAuth(request, reply)) return;
    const playerId = request.playerId!;
    const { enabled } = bodySchema.parse(request.body);

    const [existing] = await fastify.db
      .select()
      .from(schema.pushSubscriptions)
      .where(and(eq(schema.pushSubscriptions.playerId, playerId), eq(schema.pushSubscriptions.type, "telegram_dm")));

    if (existing) {
      await fastify.db
        .update(schema.pushSubscriptions)
        .set({ enabled })
        .where(eq(schema.pushSubscriptions.id, existing.id));
    } else {
      await fastify.db.insert(schema.pushSubscriptions).values({ playerId, type: "telegram_dm", enabled });
    }

    return { enabled };
  });
}
