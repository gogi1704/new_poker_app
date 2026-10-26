import fp from "fastify-plugin";
import type { FastifyInstance, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";

declare module "fastify" {
  interface FastifyRequest {
    playerId: string | null;
    telegramId: string | null;
  }
}

interface SessionPayload {
  playerId: string;
  telegramId: string;
}

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
  fastify.addHook("onRequest", async (request) => {
    const session = extractSession(request, jwtSecret);
    request.playerId = session?.playerId ?? null;
    request.telegramId = session?.telegramId ?? null;
  });
});

export function requireAuth(request: FastifyRequest, reply: { code: (n: number) => { send: (b: unknown) => void } }) {
  if (!request.playerId) {
    reply.code(401).send({ error: "unauthorized" });
    return false;
  }
  return true;
}
