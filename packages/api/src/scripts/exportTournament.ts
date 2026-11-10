// Offline → cloud sync, step 1 of 2 (see docs/OFFLINE.md). Run against the
// local Postgres (docker-compose.local.yml) after a tournament finishes at
// the venue, to dump everything importTournament.ts needs to recreate it in
// the cloud database. Not an API endpoint — this is a manual, infrequent ops
// step, run directly with tsx.
import { writeFileSync } from "node:fs";
import { eq, inArray } from "drizzle-orm";
import { createDb, schema } from "@poker/shared";

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
  const tournamentId = tournament.id;

  const blindLevels = await db.select().from(schema.blindLevels).where(eq(schema.blindLevels.tournamentId, tournamentId));
  const registrations = await db
    .select()
    .from(schema.registrations)
    .where(eq(schema.registrations.tournamentId, tournamentId));
  const results = await db
    .select()
    .from(schema.tournamentResults)
    .where(eq(schema.tournamentResults.tournamentId, tournamentId));
  const knockouts = await db.select().from(schema.knockouts).where(eq(schema.knockouts.tournamentId, tournamentId));
  const rebuys = await db
    .select()
    .from(schema.rebuyAddonTransactions)
    .where(eq(schema.rebuyAddonTransactions.tournamentId, tournamentId));
  const rpsLedger = await db.select().from(schema.rpsLedger).where(eq(schema.rpsLedger.tournamentId, tournamentId));

  // Players are kept by their local id here — importTournament.ts remaps
  // every reference below to a fresh (or matched-by-telegramId) cloud id.
  const playerIds = new Set<string>();
  for (const r of registrations) playerIds.add(r.playerId);
  for (const r of results) playerIds.add(r.playerId);
  for (const k of knockouts) {
    playerIds.add(k.eliminatedPlayerId);
    if (k.eliminatedByPlayerId) playerIds.add(k.eliminatedByPlayerId);
  }
  for (const r of rebuys) playerIds.add(r.playerId);
  for (const l of rpsLedger) playerIds.add(l.playerId);

  const players = playerIds.size
    ? await db.select().from(schema.players).where(inArray(schema.players.id, [...playerIds]))
    : [];

  writeFileSync(
    outFile,
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        tournament,
        blindLevels,
        players: players.map((p) => ({
          localId: p.id,
          telegramId: p.telegramId,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
        })),
        registrations,
        results,
        knockouts,
        rebuys,
        rpsLedger,
      },
      null,
      2,
    ),
  );

  console.log(`Exported tournament "${tournament.name}" -> ${outFile}`);
  console.log(`  ${players.length} players, ${results.length} results, ${knockouts.length} knockouts`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
