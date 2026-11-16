// Offline → cloud sync (see docs/OFFLINE.md). Run against the local Postgres
// (docker-compose.local.yml) after a tournament finishes at the venue, to
// dump everything needed to recreate it in the cloud database. A CLI
// fallback for when sending the file to the bot (Club Settings → the
// "Выгрузить" button on a finished tournament → send that file to the bot
// in Telegram) isn't convenient — same underlying logic either way.
import { writeFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { createDb, schema, buildTournamentExport } from "@poker/shared";

const connectionString = process.env.LOCAL_DATABASE_URL ?? "postgresql://pokerclub:pokerclub@localhost:5432/pokerclub";
const db = createDb(connectionString);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const [identifier, outFile] = process.argv.slice(2);
  if (!identifier || !outFile) {
    console.error("Usage: tsx src/scripts/exportTournament.ts <tournamentId-or-name> <outFile>");
    process.exit(1);
  }

  // The TD panel never shows a tournament's raw id (no router/URL for it), so
  // accept its name too — the practical way to call this script by hand.
  const [tournament] = UUID_RE.test(identifier)
    ? await db.select().from(schema.tournaments).where(eq(schema.tournaments.id, identifier))
    : await db.select().from(schema.tournaments).where(eq(schema.tournaments.name, identifier));
  if (!tournament) throw new Error(`Tournament "${identifier}" not found`);

  const data = await buildTournamentExport(db, tournament.id);
  writeFileSync(outFile, JSON.stringify(data, null, 2));

  console.log(`Exported tournament "${data.tournament.name}" -> ${outFile}`);
  console.log(`  ${data.players.length} players, ${data.results.length} results, ${data.knockouts.length} knockouts`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
