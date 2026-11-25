import type { FastifyInstance } from "fastify";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { validateTelegramInitData } from "../lib/telegram-init-data.js";
import { verifyAdminPassword } from "../lib/admin-password.js";
import { issueTelegramSession } from "../services/auth-session.js";
import { getDefaultClub } from "../services/club.js";

const bodySchema = z.object({ initData: z.string().min(1) });
const passwordSchema = z.object({ password: z.string().min(1) });
const magicLinkSchema = z.object({ token: z.string().min(1) });

interface WebLoginTicketPayload {
  tgId: string;
  nickname: string;
  purpose: "web-login";
}

export default async function authRoutes(fastify: FastifyInstance) {
  fastify.post("/api/auth/telegram", async (request, reply) => {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !process.env.JWT_SECRET) {
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
    // normalize to null (see issueTelegramSession for why undefined is unsafe here).
    const avatarUrl = validated.user.photo_url ?? null;

    return issueTelegramSession(fastify, { telegramId, nickname, avatarUrl });
  });

  // Standalone-site login (outside Telegram's WebView): the bot builds and
  // sends a short-lived ticket (packages/bot/src/lib/webLogin.ts) via a
  // plain URL button — this exchanges it for a normal session, exactly like
  // /api/auth/telegram above does once it knows "this is telegramId X".
  // Deliberately verifies the ticket itself rather than relying on
  // plugins/auth.ts's generic Bearer-token extraction, since a ticket is
  // intentionally NOT shaped like a session/admin token (see webLogin.ts).
  fastify.post("/api/auth/magic-link", async (request, reply) => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return reply.code(500).send({ error: "server misconfigured" });

    const { token } = magicLinkSchema.parse(request.body);

    let payload: WebLoginTicketPayload;
    try {
      payload = jwt.verify(token, jwtSecret) as WebLoginTicketPayload;
    } catch {
      return reply.code(401).send({ error: "ссылка недействительна или устарела" });
    }
    if (payload.purpose !== "web-login" || !payload.tgId) {
      return reply.code(401).send({ error: "ссылка недействительна" });
    }

    return issueTelegramSession(fastify, {
      telegramId: payload.tgId,
      nickname: payload.nickname || payload.tgId,
      avatarUrl: null,
    });
  });

  // Browser-only login path for the TD panel (no Telegram app involved): a
  // single club-wide password set via Club Settings. Produces an "admin"
  // session (see plugins/auth.ts) that requireStaff treats as a synthetic
  // owner — it's a master key, not tied to any one staff identity.
  fastify.post("/api/auth/admin-password", async (request, reply) => {
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) return reply.code(500).send({ error: "server misconfigured" });

    const club = await getDefaultClub(fastify.db);

    // Set only on the local/offline deployment (docker-compose.local.yml) —
    // that stack never leaves the laptop's closed LAN, so the password gate
    // is pure friction there, not a real protection like it is on the
    // public cloud deployment. Any request body (even {}) succeeds.
    if (process.env.DISABLE_ADMIN_AUTH !== "true") {
      const { password } = passwordSchema.parse(request.body);
      if (!club.adminPasswordHash || !verifyAdminPassword(password, club.adminPasswordHash)) {
        return reply.code(401).send({ error: "неверный пароль" });
      }
    }

    const token = jwt.sign({ adminClubId: club.id }, jwtSecret, { expiresIn: "24h" });
    return { token, club: { id: club.id, name: club.name } };
  });
}
