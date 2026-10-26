import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { schema } from "@poker/shared";
import { buildLiveState } from "../services/live.js";
import { subscribeTournament } from "../services/realtime.js";

/**
 * Read-only live tournament state — same payload for the TD console, the TV
 * clock-display, and (later) the player app, since none of it is sensitive
 * beyond what's already public via /api/tournaments/:id.
 */
export default async function realtimeRoutes(fastify: FastifyInstance) {
  fastify.get("/api/tournaments/:id/live", async (request, reply) => {
    const { id } = request.params as { id: string };
    const [tournament] = await fastify.db.select().from(schema.tournaments).where(eq(schema.tournaments.id, id));
    if (!tournament) return reply.code(404).send({ error: "not found" });
    return buildLiveState(fastify.db, id);
  });

  fastify.get("/api/tournaments/:id/stream", (request, reply) => {
    const { id } = request.params as { id: string };

    // Tell Fastify we're taking over the raw response ourselves — without this
    // its own reply lifecycle (onSend hooks, the implicit empty-body send once
    // the handler returns) fights with our manual writes and nothing reaches
    // the client.
    reply.hijack();

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    let closed = false;
    const send = async () => {
      if (closed) return;
      const state = await buildLiveState(fastify.db, id);
      if (!state || closed) return;
      reply.raw.write(`data: ${JSON.stringify(state)}\n\n`);
    };

    // Initial snapshot, then one push per change. A comment every 20s keeps
    // proxies/browsers from timing out an idle connection.
    send();
    const unsubscribe = subscribeTournament(id, send);
    const keepAlive = setInterval(() => !closed && reply.raw.write(": ping\n\n"), 20_000);

    request.raw.on("close", () => {
      closed = true;
      clearInterval(keepAlive);
      unsubscribe();
    });
  });
}
