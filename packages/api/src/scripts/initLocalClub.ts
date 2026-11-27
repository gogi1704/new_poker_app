// One-time setup for offline/local mode (see docs/OFFLINE.md) — creates the
// single club row against the local Postgres started by
// docker-compose.local.yml. Connects directly, not via .env.local-offline
// (that file's DATABASE_URL uses the docker-network hostname "postgres",
// which only resolves from inside the compose network, not from this host
// process) — override with LOCAL_DATABASE_URL if you changed the compose
// file's fixed credentials.
//
// No admin password to set here: the local API runs with
// DISABLE_ADMIN_AUTH=true (docker-compose.local.yml), so the login screen
// accepts any input — there is nothing for a password on this club row to
// protect in offline mode.
import { createDb, schema } from "@poker/shared";

const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://pokerclub:pokerclub@localhost:5432/pokerclub";
const db = createDb(connectionString);

// Optional explicit id (a UUID), passed by the offline-launcher when cloud
// sync is already connected — see docs/OFFLINE.md and Phase 14 of the plan.
// Giving the local club row the SAME id as its cloud counterpart is what
// lets an admin-password session/JWT minted by either backend validate
// against the other (requireStaff checks the JWT's embedded club id against
// this row's own id) — a prerequisite for the single-address proxy, not
// something this script enforces or checks on its own.
const explicitId = process.argv[2];

async function main() {
  const [existing] = await db.select().from(schema.clubs).limit(1);
  if (existing) {
    console.log(`Club already exists: ${existing.name} (${existing.id})`);
    return;
  }
  const [club] = await db
    .insert(schema.clubs)
    .values({ ...(explicitId ? { id: explicitId } : {}), name: "Мой Покер Клуб", timezone: "Europe/Moscow" })
    .returning();
  console.log(`Created local club: ${club.name} (${club.id})`);
  console.log("Next: open http://localhost:8080 — no login needed in offline mode.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
