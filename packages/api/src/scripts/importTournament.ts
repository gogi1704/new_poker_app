// Offline → cloud sync, step 2 of 2 (see docs/OFFLINE.md). Run against the
// shared cloud (Neon) database — loads .env.local exactly like seed.ts, since
// dev and prod point at the same database. Takes the JSON file produced by
// exportTournament.ts and recreates the tournament there with fresh ids,
// matching each player by telegramId (inserting a new cloud player/membership
// for any that don't exist yet, including every walk-in — this is also what
// makes re-running the import safe: the double-import guard below is keyed
// on tournament name + scheduledAt, not on these player rows).
import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env.local") });

import { readFileSync } from "node:fs";
import { and, eq } from "drizzle-orm";
import { createDb, schema } from "@poker/shared";

const db = createDb(process.env.DATABASE_URL!);

interface ExportedPlayer {
  localId: string;
  telegramId: string;
  nickname: string;
  avatarUrl: string | null;
}

async function main() {
  const [inFile] = process.argv.slice(2);
  if (!inFile) {
    console.error("Usage: tsx src/scripts/importTournament.ts <inFile>");
    process.exit(1);
  }

  const data = JSON.parse(readFileSync(inFile, "utf-8"));
  const { tournament, blindLevels, players, registrations, results, knockouts, rebuys, rpsLedger } = data as {
    tournament: typeof schema.tournaments.$inferSelect;
    blindLevels: (typeof schema.blindLevels.$inferSelect)[];
    players: ExportedPlayer[];
    registrations: (typeof schema.registrations.$inferSelect)[];
    results: (typeof schema.tournamentResults.$inferSelect)[];
    knockouts: (typeof schema.knockouts.$inferSelect)[];
    rebuys: (typeof schema.rebuyAddonTransactions.$inferSelect)[];
    rpsLedger: (typeof schema.rpsLedger.$inferSelect)[];
  };

  const [club] = await db.select().from(schema.clubs).limit(1);
  if (!club) throw new Error("No club found in the cloud database");

  const scheduledAt = new Date(tournament.scheduledAt);
  const [existingTournament] = await db
    .select()
    .from(schema.tournaments)
    .where(
      and(
        eq(schema.tournaments.clubId, club.id),
        eq(schema.tournaments.name, tournament.name),
        eq(schema.tournaments.scheduledAt, scheduledAt),
      ),
    );
  if (existingTournament) {
    console.log(`Tournament "${tournament.name}" already imported (id ${existingTournament.id}) — skipping.`);
    return;
  }

  const playerIdMap = new Map<string, string>();
  for (const p of players) {
    const [existingPlayer] = await db.select().from(schema.players).where(eq(schema.players.telegramId, p.telegramId));
    let player = existingPlayer;
    if (!player) {
      [player] = await db
        .insert(schema.players)
        .values({
          telegramId: p.telegramId,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          derivedEmail: p.telegramId.startsWith("local-")
            ? `local_${crypto.randomUUID()}@local.user`
            : `telegram_${p.telegramId}@telegram.user`,
        })
        .returning();
    }
    playerIdMap.set(p.localId, player.id);

    const [membership] = await db
      .select()
      .from(schema.clubMemberships)
      .where(and(eq(schema.clubMemberships.clubId, club.id), eq(schema.clubMemberships.playerId, player.id)));
    if (!membership) {
      await db.insert(schema.clubMemberships).values({ clubId: club.id, playerId: player.id, cardId: crypto.randomUUID() });
    }
  }

  const [newTournament] = await db
    .insert(schema.tournaments)
    .values({
      clubId: club.id,
      name: tournament.name,
      format: tournament.format,
      status: tournament.status,
      archived: tournament.archived,
      scheduledAt,
      buyIn: tournament.buyIn,
      startingStack: tournament.startingStack,
      maxSeats: tournament.maxSeats,
      maxSeatsPerTable: tournament.maxSeatsPerTable,
      lateRegUntilLevel: tournament.lateRegUntilLevel,
      reentryAllowedUntilLevel: tournament.reentryAllowedUntilLevel,
      reentryPrice: tournament.reentryPrice,
      addonPrice: tournament.addonPrice,
      addonStack: tournament.addonStack,
      addonAvailableLevel: tournament.addonAvailableLevel,
      addonMaxCount: tournament.addonMaxCount,
      arriveBonusStack: tournament.arriveBonusStack,
      rpsFormulaParams: tournament.rpsFormulaParams,
    })
    .returning();

  if (blindLevels.length) {
    await db.insert(schema.blindLevels).values(
      blindLevels.map((l) => ({
        tournamentId: newTournament.id,
        levelNumber: l.levelNumber,
        smallBlind: l.smallBlind,
        bigBlind: l.bigBlind,
        ante: l.ante,
        durationMinutes: l.durationMinutes,
        isBreak: l.isBreak,
      })),
    );
  }

  if (registrations.length) {
    await db.insert(schema.registrations).values(
      registrations.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        status: r.status,
        currentStack: r.currentStack,
        arrivedBeforeLateReg: r.arrivedBeforeLateReg,
        registeredAt: new Date(r.registeredAt),
      })),
    );
  }

  if (results.length) {
    await db.insert(schema.tournamentResults).values(
      results.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        place: r.place,
        rpsAwarded: r.rpsAwarded,
        knockoutsCount: r.knockoutsCount,
        bountyPoints: r.bountyPoints,
        payout: r.payout,
        publishedAt: new Date(r.publishedAt),
      })),
    );
  }

  if (knockouts.length) {
    await db.insert(schema.knockouts).values(
      knockouts.map((k) => ({
        tournamentId: newTournament.id,
        eliminatedPlayerId: playerIdMap.get(k.eliminatedPlayerId)!,
        eliminatedByPlayerId: k.eliminatedByPlayerId ? playerIdMap.get(k.eliminatedByPlayerId)! : null,
        levelNumber: k.levelNumber,
        createdAt: new Date(k.createdAt),
      })),
    );
  }

  if (rebuys.length) {
    await db.insert(schema.rebuyAddonTransactions).values(
      rebuys.map((r) => ({
        tournamentId: newTournament.id,
        playerId: playerIdMap.get(r.playerId)!,
        type: r.type,
        amount: r.amount,
        stackGranted: r.stackGranted,
        levelNumberAtPurchase: r.levelNumberAtPurchase,
        createdAt: new Date(r.createdAt),
      })),
    );
  }

  if (rpsLedger.length) {
    await db.insert(schema.rpsLedger).values(
      rpsLedger.map((l) => ({
        playerId: playerIdMap.get(l.playerId)!,
        clubId: club.id,
        tournamentId: newTournament.id,
        delta: l.delta,
        reason: l.reason,
        createdAt: new Date(l.createdAt),
      })),
    );
  }

  console.log(`Imported tournament "${tournament.name}" as ${newTournament.id}`);
  console.log(
    `  ${players.length} players, ${results.length} results, ${knockouts.length} knockouts, ${rpsLedger.length} rps ledger entries`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
