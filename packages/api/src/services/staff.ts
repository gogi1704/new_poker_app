import { and, eq } from "drizzle-orm";
import type { FastifyRequest, FastifyReply } from "fastify";
import { schema, type Database } from "@poker/shared";

export type StaffRole = "owner" | "td" | "floor";

export async function getStaffAccount(db: Database, clubId: string, telegramId: string) {
  const [account] = await db
    .select()
    .from(schema.staffAccounts)
    .where(and(eq(schema.staffAccounts.clubId, clubId), eq(schema.staffAccounts.telegramId, telegramId)));
  return account ?? null;
}

/**
 * Resolves the staff account for the current request and sends 401/403 if it's
 * missing. Returns the account (or null after already replying) so callers can
 * `if (!staff) return;` in one line.
 */
export async function requireStaff(
  request: FastifyRequest,
  reply: FastifyReply,
  db: Database,
  clubId: string,
) {
  if (!request.telegramId) {
    reply.code(401).send({ error: "unauthorized" });
    return null;
  }
  const account = await getStaffAccount(db, clubId, request.telegramId);
  if (!account) {
    reply.code(403).send({ error: "staff access required" });
    return null;
  }
  return account;
}

/** Granting/revoking staff access and editing club/board settings is owner-only. */
export async function requireOwner(
  request: FastifyRequest,
  reply: FastifyReply,
  db: Database,
  clubId: string,
) {
  const account = await requireStaff(request, reply, db, clubId);
  if (!account) return null;
  if (account.role !== "owner") {
    reply.code(403).send({ error: "owner access required" });
    return null;
  }
  return account;
}
