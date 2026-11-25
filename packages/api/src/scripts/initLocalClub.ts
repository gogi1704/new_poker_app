// One-time setup for offline/local mode (see docs/OFFLINE.md) — creates the
// single club row against the local Postgres started by
// docker-compose.local.yml. Connects directly, not via .env.local-offline
// (that file's DATABASE_URL uses the docker-network hostname "postgres",
// which only resolves from inside the compose network, not from this host
// process) — override with LOCAL_DATABASE_URL if you changed the compose
// file's fixed credentials.
import { eq } from "drizzle-orm";
import { createDb, schema } from "@poker/shared";
import { hashAdminPassword } from "../lib/admin-password.js";

const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://pokerclub:pokerclub@localhost:5432/pokerclub";
const db = createDb(connectionString);

async function main() {
  // Optional — without it, a brand-new club has no admin-password login at
  // all (Club Settings, where you'd normally set one, is itself gated behind
  // already being logged in), the same chicken-and-egg bootstrapClub.ts
  // solves for the cloud deploy. Passing it here (and re-running any time
  // later, e.g. to change it) is the offline-mode equivalent.
  // pnpm forwards a literal "--" into argv when invoked as
  // `pnpm --filter ... local:init-club -- <password>` — filter it out so the
  // password isn't accidentally "--" itself.
  const [password] = process.argv.slice(2).filter((arg) => arg !== "--");
  const adminPasswordHash = password ? hashAdminPassword(password) : undefined;

  const [existing] = await db.select().from(schema.clubs).limit(1);
  if (existing) {
    if (adminPasswordHash) {
      await db.update(schema.clubs).set({ adminPasswordHash }).where(eq(schema.clubs.id, existing.id));
      console.log(`Club already exists: ${existing.name} (${existing.id}) — admin password updated.`);
    } else {
      console.log(`Club already exists: ${existing.name} (${existing.id})`);
    }
    return;
  }
  const [club] = await db
    .insert(schema.clubs)
    .values({ name: "Мой Покер Клуб", timezone: "Europe/Moscow", adminPasswordHash })
    .returning();
  console.log(`Created local club: ${club.name} (${club.id})`);
  console.log(
    adminPasswordHash
      ? "Next: open http://localhost:8080 and log in with the password you set."
      : "Next: open http://localhost:8080, go to Club Settings, and set an admin password + club name.",
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
