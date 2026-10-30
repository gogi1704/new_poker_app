import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { schema } from "@poker/shared";
import { getDefaultClub } from "../services/club.js";
import { requireOwner } from "../services/staff.js";
import { publishClubBoardUpdate } from "../services/realtime.js";

const boardBlockSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum(schema.BOARD_BLOCK_TYPES),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(100),
  width: z.number().min(1).max(100),
  height: z.number().min(1).max(100),
  text: z.string().max(200).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontWeight: z.union([z.literal(500), z.literal(700), z.literal(800)]).optional(),
  fontFamily: z.string().max(80).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  italic: z.boolean().optional(),
  progressStyle: z.enum(["bar", "thick", "ring"]).optional(),
});

const boardSettingsSchema = z.object({
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  soundEnabled: z.boolean(),
  soundVolume: z.number().min(0).max(1),
  backgroundUrl: z.string().max(3_000_000).nullable(),
  layout: z.array(boardBlockSchema).max(40),
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

    // Club name/logo/board settings are all rendered on every open /clock/:id
    // TV stream — push them a fresh snapshot now instead of leaving an
    // already-open board stale until its next unrelated tournament event.
    publishClubBoardUpdate();

    return { ...updated, boardSettings: schema.normalizeBoardSettings(updated.boardSettings) };
  });
}
