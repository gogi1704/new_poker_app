import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireStaff } from "../services/staff.js";

const levelSchema = z.object({
  levelNumber: z.number().int().min(1),
  smallBlind: z.number().int().min(0),
  bigBlind: z.number().int().min(0),
  ante: z.number().int().min(0),
  durationMinutes: z.number().int().min(1),
  isBreak: z.boolean(),
});

const saveSchema = z.object({
  name: z.string().trim().min(1).max(60),
  levels: z.array(levelSchema).min(1).max(60),
});

// Club-wide reusable blind structures (any staff role can save/use one —
// this is tournament-setup convenience, not a club-settings concern like
// StaffSettings/BoardSettings, which stay owner-only).
export default async function tdBlindTemplatesRoutes(fastify: FastifyInstance) {
  fastify.get("/api/td/blind-templates", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;
    return club.blindStructureTemplates;
  });

  fastify.post("/api/td/blind-templates", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { name, levels } = saveSchema.parse(request.body);

    // Saving under a name that already exists replaces it, so re-saving
    // after a tweak doesn't pile up duplicates.
    const existing = club.blindStructureTemplates.filter(
      (t) => t.name.toLowerCase() !== name.toLowerCase(),
    );
    const templates = [...existing, { id: randomUUID(), name, levels }];

    await fastify.db
      .update(schema.clubs)
      .set({ blindStructureTemplates: templates })
      .where(eq(schema.clubs.id, club.id));

    return templates;
  });

  fastify.delete("/api/td/blind-templates/:id", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireStaff(request, reply, fastify.db, club.id);
    if (!staff) return;

    const { id } = request.params as { id: string };
    const templates = club.blindStructureTemplates.filter((t) => t.id !== id);

    await fastify.db
      .update(schema.clubs)
      .set({ blindStructureTemplates: templates })
      .where(eq(schema.clubs.id, club.id));

    return templates;
  });
}
