import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDefaultClub } from "../services/club.js";
import { requireOwner } from "../services/staff.js";
import { sendBroadcast } from "../services/telegram-broadcast.js";

const bodySchema = z.object({ text: z.string().trim().min(1).max(2000) });

// Owner-only club news/announcements — a message blast to every member,
// separate from the automatic tournament-reminder DMs (packages/bot/src/jobs/reminders.ts).
export default async function tdBroadcastRoutes(fastify: FastifyInstance) {
  fastify.post("/api/td/broadcast", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const owner = await requireOwner(request, reply, fastify.db, club.id);
    if (!owner) return;

    const { text } = bodySchema.parse(request.body);

    try {
      return await sendBroadcast(fastify.db, club.id, text);
    } catch (err) {
      return reply.code(500).send({ error: (err as Error).message });
    }
  });
}
