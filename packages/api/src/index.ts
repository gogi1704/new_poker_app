import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(import.meta.dirname, "../../../.env.local") });

import Fastify from "fastify";
import cors from "@fastify/cors";
import dbPlugin from "./plugins/db.js";
import authPlugin from "./plugins/auth.js";
import authRoutes from "./routes/auth.js";
import tournamentsRoutes from "./routes/tournaments.js";
import resultsRoutes from "./routes/results.js";
import ratingRoutes from "./routes/rating.js";
import profileRoutes from "./routes/profile.js";
import settingsRoutes from "./routes/settings.js";
import tdTournamentsRoutes from "./routes/td-tournaments.js";
import tdLiveRoutes from "./routes/td-live.js";
import realtimeRoutes from "./routes/realtime.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, { origin: true });
await fastify.register(dbPlugin);
await fastify.register(authPlugin);
await fastify.register(authRoutes);
await fastify.register(tournamentsRoutes);
await fastify.register(resultsRoutes);
await fastify.register(ratingRoutes);
await fastify.register(profileRoutes);
await fastify.register(settingsRoutes);
await fastify.register(tdTournamentsRoutes);
await fastify.register(tdLiveRoutes);
await fastify.register(realtimeRoutes);

fastify.get("/health", async () => ({ status: "ok" }));

const port = Number(process.env.API_PORT ?? 3001);
fastify.listen({ port, host: "0.0.0.0" }).catch((err) => {
  fastify.log.error(err);
  process.exit(1);
});
