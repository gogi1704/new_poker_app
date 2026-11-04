import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateTelegramInitData } from "../lib/telegram-init-data.js";
import { validateTelegramLoginWidget, type TelegramLoginWidgetPayload } from "../lib/telegram-login-widget.js";
import { issueTelegramSession } from "../services/auth-session.js";

const bodySchema = z.object({ initData: z.string().min(1) });

const widgetSchema = z.object({
  id: z.number(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  photo_url: z.string().optional(),
  auth_date: z.number(),
  hash: z.string(),
});

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

  // Browser-only login path (no Telegram app involved): the Telegram Login
  // Widget on web-td's own login screen. Requires the bot's domain to be
  // registered via @BotFather's /setdomain. Produces the exact same session
  // shape as /api/auth/telegram — downstream role checks (requireStaff) don't
  // care which path was used.
  fastify.post("/api/auth/telegram-widget", async (request, reply) => {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken || !process.env.JWT_SECRET) {
      return reply.code(500).send({ error: "server misconfigured" });
    }

    const payload: TelegramLoginWidgetPayload = widgetSchema.parse(request.body);

    try {
      validateTelegramLoginWidget(payload, botToken);
    } catch (err) {
      return reply.code(401).send({ error: (err as Error).message });
    }

    const telegramId = String(payload.id);
    const nickname = payload.username ?? [payload.first_name, payload.last_name].filter(Boolean).join(" ");
    const avatarUrl = payload.photo_url ?? null;

    return issueTelegramSession(fastify, { telegramId, nickname, avatarUrl });
  });
}
