import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

declare module "fastify" {
  interface FastifyRequest {
    playerId: string | null;
    telegramId: string | null;
    // Set when the request is authenticated via the TD-panel admin password
    // (browser access with no Telegram identity at all) rather than a
    // Telegram player session — see services/staff.ts requireStaff.
    adminClubId: string | null;
  }
}

interface PlayerSessionPayload {
  playerId: string;
  telegramId: string;
}

interface AdminSessionPayload {
  adminClubId: string;
}

type SessionPayload = PlayerSessionPayload | AdminSessionPayload;

function extractSession(request: FastifyRequest, jwtSecret: string): SessionPayload | null {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice("Bearer ".length), jwtSecret) as SessionPayload;
  } catch {
    return null;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is not set");

  fastify.decorateRequest("playerId", null);
  fastify.decorateRequest("telegramId", null);
  fastify.decorateRequest("adminClubId", null);
  fastify.addHook("onRequest", async (request) => {
    const session = extractSession(request, jwtSecret);
    request.playerId = (session as PlayerSessionPayload)?.playerId ?? null;
    request.telegramId = (session as PlayerSessionPayload)?.telegramId ?? null;
    request.adminClubId = (session as AdminSessionPayload)?.adminClubId ?? null;
  });
});

export function requireAuth(request: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
  if (!request.playerId) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}
