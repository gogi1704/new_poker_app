// One-time bootstrap for a brand-new database (no club row, no admin
// password yet — every other auth path, including the TD panel's own
// "grant staff access" UI, needs an owner session to already exist, so this
// is the only way in on a fresh DB). Reads DATABASE_URL straight from the
// process environment — meant to run wherever that's already correct (e.g.
// inside the api container via `docker-compose exec api`), not via dotenv.
import { eq } from "drizzle-orm";
import { createDb, schema } from "@poker/shared";
import { hashAdminPassword } from "../lib/admin-password.js";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set in the environment");
const db = createDb(connectionString);

async function main() {
  const [, , name, password] = process.argv;
  if (!name || !password) {
    console.error("Usage: tsx src/scripts/bootstrapClub.ts <club name> <admin password>");
    process.exit(1);
  }

  const adminPasswordHash = hashAdminPassword(password);
  const [existing] = await db.select().from(schema.clubs).limit(1);

  if (existing) {
    await db.update(schema.clubs).set({ adminPasswordHash }).where(eq(schema.clubs.id, existing.id));
    console.log(`Club already existed: "${existing.name}" (${existing.id}) — admin password updated.`);
    return;
  }

  const [club] = await db.insert(schema.clubs).values({ name, adminPasswordHash }).returning();
  console.log(`Created club "${club.name}" (${club.id}) with an admin password set.`);
  console.log("Log into the TD panel with that password, then set up staff/Telegram access from Club Settings.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
