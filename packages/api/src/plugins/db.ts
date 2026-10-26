import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import { createDb, type Database } from "@poker/shared";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async (fastify: FastifyInstance) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  const db = createDb(connectionString);
  fastify.decorate("db", db);
});
