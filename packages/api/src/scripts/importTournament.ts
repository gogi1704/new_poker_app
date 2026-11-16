// Offline → cloud sync (see docs/OFFLINE.md). Run against the shared cloud
// (Neon) database — loads .env.local exactly like seed.ts, since dev and
// prod point at the same database. A CLI fallback for when sending the
// export file to the bot in Telegram isn't convenient — same underlying
// import logic either way (see @poker/shared's importTournamentExport).
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env.local") });

import { readFileSync } from "node:fs";
import { createDb, schema, importTournamentExport } from "@poker/shared";

const db = createDb(process.env.DATABASE_URL!);

async function main() {
  const [inFile] = process.argv.slice(2);
  if (!inFile) {
    console.error("Usage: tsx src/scripts/importTournament.ts <inFile>");
    process.exit(1);
  }

  const [club] = await db.select().from(schema.clubs).limit(1);
  if (!club) throw new Error("No club found in the cloud database");

  const raw = JSON.parse(readFileSync(inFile, "utf-8"));
  const result = await importTournamentExport(db, club.id, raw);

  if (!result.imported) {
    console.log(`Tournament "${result.name}" already imported (id ${result.tournamentId}) — skipping.`);
    return;
  }
  console.log(`Imported tournament "${result.name}" as ${result.tournamentId}`);
  console.log(
    `  ${result.counts.players} players, ${result.counts.results} results, ${result.counts.knockouts} knockouts, ${result.counts.rpsLedger} rps ledger entries`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
