import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireOwner } from "../services/staff.js";

const boardBlockSchema = z.object({
  type: z.enum(schema.BOARD_BLOCK_TYPES),
  zone: z.enum(["top", "center", "bottom"]),
  size: z.union([z.literal(1), z.literal(2)]),
});

const boardSettingsSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  soundEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  layout: z.array(boardBlockSchema).max(schema.BOARD_BLOCK_TYPES.length),
});

export default async function tdClubRoutes(fastify: FastifyInstance) {
  fastify.get("/api/td/club", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;
    return { ...club, boardSettings: schema.normalizeBoardSettings(club.boardSettings) };
  });

  fastify.put("/api/td/club", async (request, reply) => {
    const club = await getDefaultClub(fastify.db);
    const staff = await requireOwner(request, reply, fastify.db, club.id);
    if (!staff) return;

    const body = z
      .object({
        name: z.string().trim().min(1).max(60).optional(),
        logoUrl: z.string().max(500_000).nullable().optional(),
        boardSettings: boardSettingsSchema.optional(),
      })
      .parse(request.body);

    const [updated] = await fastify.db
      .update(schema.clubs)
      .set({
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.logoUrl !== undefined ? { logoUrl: body.logoUrl } : {}),
        ...(body.boardSettings !== undefined ? { boardSettings: body.boardSettings } : {}),
      })
      .where(eq(schema.clubs.id, club.id))
      .returning();

    return updated;
  });
}
