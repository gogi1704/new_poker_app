// One-time setup for offline/local mode (see docs/OFFLINE.md) — creates the
// single club row against the local Postgres started by
// docker-compose.local.yml. Connects directly, not via .env.local-offline
// (that file's DATABASE_URL uses the docker-network hostname "postgres",
// which only resolves from inside the compose network, not from this host
// process) — override with LOCAL_DATABASE_URL if you changed the compose
// file's fixed credentials.
import { createDb, schema } from "@poker/shared";

const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://pokerclub:pokerclub@localhost:5432/pokerclub";
const db = createDb(connectionString);

async function main() {
  const [existing] = await db.select().from(schema.clubs).limit(1);
  if (existing) {
    console.log(`Club already exists: ${existing.name} (${existing.id})`);
    return;
  }
  const [club] = await db
    .insert(schema.clubs)
    .values({ name: "Мой Покер Клуб", timezone: "Europe/Moscow" })
    .returning();
  console.log(`Created local club: ${club.name} (${club.id})`);
  console.log("Next: open http://localhost:8080, go to Club Settings, and set an admin password + club name.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
