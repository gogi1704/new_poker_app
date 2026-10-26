import { config } from "dotenv";
import { resolve } from "node:path";
config({ path: resolve(process.cwd(), "../../.env.local") });

import { eq, and } from "drizzle-orm";
import { createDb, schema, calculateRps } from "@poker/shared";

const db = createDb(process.env.DATABASE_URL!);

const STANDARD_LEVELS = [
  { levelNumber: 1, smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 2, smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 3, smallBlind: 75, bigBlind: 150, ante: 0, durationMinutes: 15, isBreak: false },
  { levelNumber: 4, smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 15, isBreak: false },
  { levelNumber: 5, smallBlind: 150, bigBlind: 300, ante: 25, durationMinutes: 15, isBreak: false },
  { levelNumber: 6, smallBlind: 200, bigBlind: 400, ante: 50, durationMinutes: 15, isBreak: false },
  { levelNumber: 7, smallBlind: 0, bigBlind: 0, ante: 0, durationMinutes: 10, isBreak: true },
  { levelNumber: 8, smallBlind: 300, bigBlind: 600, ante: 75, durationMinutes: 15, isBreak: false },
  { levelNumber: 9, smallBlind: 400, bigBlind: 800, ante: 100, durationMinutes: 15, isBreak: false },
  { levelNumber: 10, smallBlind: 500, bigBlind: 1000, ante: 100, durationMinutes: 15, isBreak: false },
  { levelNumber: 11, smallBlind: 600, bigBlind: 1200, ante: 200, durationMinutes: 15, isBreak: false },
  { levelNumber: 12, smallBlind: 800, bigBlind: 1600, ante: 200, durationMinutes: 15, isBreak: false },
];

const FICTIONAL_PLAYERS = [
  "AceHunter",
  "RiverRat88",
  "ChipLeader21",
  "BluffMaster",
  "PocketRockets",
  "TiltMonster",
  "FoldQueen",
  "AllInAndy",
  "GTO_Guru",
  "NutsFlush",
];

const RANK_TIERS = [
  { name: "Newbie", order: 1, thresholdType: "games" as const, thresholdValue: 0 },
  { name: "Fish", order: 2, thresholdType: "rps" as const, thresholdValue: 500 },
  { name: "Grinder", order: 3, thresholdType: "rps" as const, thresholdValue: 2000 },
  { name: "Shark", order: 4, thresholdType: "rps" as const, thresholdValue: 5000 },
  { name: "Pro", order: 5, thresholdType: "rps" as const, thresholdValue: 10000 },
  { name: "Legend", order: 6, thresholdType: "rps" as const, thresholdValue: 20000 },
];

const ACHIEVEMENTS = [
  { key: "first_win", name: "Первая победа", thresholdType: "cashes" as const, thresholdValue: 1 },
  { key: "veteran", name: "Ветеран", thresholdType: "games" as const, thresholdValue: 50 },
  { key: "champion", name: "Чемпион", thresholdType: "cashes" as const, thresholdValue: 10 },
  { key: "consistent", name: "Стабильный", thresholdType: "games" as const, thresholdValue: 20 },
  { key: "rising_star", name: "Восходящая звезда", thresholdType: "rps" as const, thresholdValue: 100 },
  { key: "on_fire", name: "В ударе", thresholdType: "streak" as const, thresholdValue: 3 },
  { key: "elite_player", name: "Элитный игрок", thresholdType: "rps" as const, thresholdValue: 2000 },
  { key: "grinder_badge", name: "Гриндер", thresholdType: "games" as const, thresholdValue: 100 },
];

async function ensureClub() {
  const [existing] = await db.select().from(schema.clubs).limit(1);
  if (existing) return existing;
  const [club] = await db.insert(schema.clubs).values({ name: "Мой Покер Клуб", timezone: "Europe/Moscow" }).returning();
  console.log(`Created club: ${club.name}`);
  return club;
}

async function ensureRankTiers(clubId: string) {
  const existing = await db.select().from(schema.rankTiers).where(eq(schema.rankTiers.clubId, clubId));
  if (existing.length) return;
  await db.insert(schema.rankTiers).values(RANK_TIERS.map((t) => ({ ...t, clubId })));
  console.log(`Seeded ${RANK_TIERS.length} rank tiers`);
}

async function ensureAchievements(clubId: string) {
  const existing = await db.select().from(schema.achievements).where(eq(schema.achievements.clubId, clubId));
  if (existing.length) return;
  await db.insert(schema.achievements).values(ACHIEVEMENTS.map((a) => ({ ...a, clubId })));
  console.log(`Seeded ${ACHIEVEMENTS.length} achievements`);
}

async function ensurePlayers(clubId: string) {
  const players: (typeof schema.players.$inferSelect)[] = [];
  for (let i = 0; i < FICTIONAL_PLAYERS.length; i++) {
    const nickname = FICTIONAL_PLAYERS[i];
    const telegramId = String(900000001 + i);
    const [existing] = await db.select().from(schema.players).where(eq(schema.players.telegramId, telegramId));
    let player = existing;
    if (!player) {
      [player] = await db
        .insert(schema.players)
        .values({ telegramId, nickname, derivedEmail: `telegram_${telegramId}@telegram.user` })
        .returning();
    }
    players.push(player);

    const [membership] = await db
      .select()
      .from(schema.clubMemberships)
      .where(and(eq(schema.clubMemberships.clubId, clubId), eq(schema.clubMemberships.playerId, player.id)));
    if (!membership) {
      await db.insert(schema.clubMemberships).values({ clubId, playerId: player.id, cardId: crypto.randomUUID() });
    }
  }
  console.log(`Ensured ${players.length} fictional players + memberships`);
  return players;
}

async function ensureUpcomingTournament(clubId: string, players: (typeof schema.players.$inferSelect)[]) {
  const name = "Sunday Deepstack";
  const [existing] = await db
    .select()
    .from(schema.tournaments)
    .where(and(eq(schema.tournaments.clubId, clubId), eq(schema.tournaments.name, name)));
  if (existing) return existing;

  const scheduledAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({
      clubId,
      name,
      format: "reentry_knockout",
      status: "registering",
      scheduledAt,
      buyIn: "1000",
      startingStack: 25000,
      maxSeats: 40,
      lateRegUntilLevel: 8,
      reentryAllowedUntilLevel: 10,
      reentryPrice: "1000",
      addonPrice: "1000",
      addonStack: 15000,
      addonAvailableLevel: 10,
      addonMaxCount: 1,
      arriveBonusStack: 5000,
      rpsFormulaParams: { knockoutPoints: 50 },
    })
    .returning();

  await db.insert(schema.blindLevels).values(STANDARD_LEVELS.map((l) => ({ ...l, tournamentId: tournament.id })));

  for (const player of players) {
    await db.insert(schema.registrations).values({ tournamentId: tournament.id, playerId: player.id });
  }

  console.log(`Created upcoming tournament "${name}" with ${players.length} registrations`);
  return tournament;
}

async function ensureFinishedTournament(
  clubId: string,
  name: string,
  format: "knockout" | "reentry" | "freezeout",
  daysAgo: number,
  participants: (typeof schema.players.$inferSelect)[],
  knockoutCounts: number[],
) {
  const [existing] = await db
    .select()
    .from(schema.tournaments)
    .where(and(eq(schema.tournaments.clubId, clubId), eq(schema.tournaments.name, name)));
  if (existing) return existing;

  const scheduledAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  const [tournament] = await db
    .insert(schema.tournaments)
    .values({
      clubId,
      name,
      format,
      status: "finished",
      scheduledAt,
      buyIn: "1000",
      startingStack: format === "freezeout" ? 20000 : 25000,
      maxSeats: 40,
      reentryAllowedUntilLevel: format === "reentry" ? 10 : null,
      reentryPrice: format === "reentry" ? "1000" : null,
      rpsFormulaParams: { knockoutPoints: 50 },
    })
    .returning();

  await db.insert(schema.blindLevels).values(STANDARD_LEVELS.map((l) => ({ ...l, tournamentId: tournament.id })));

  const fieldSize = participants.length;
  for (let i = 0; i < participants.length; i++) {
    const place = i + 1;
    const player = participants[i];
    const knockouts = format === "knockout" ? (knockoutCounts[i] ?? 0) : 0;
    const bountyPoints = knockouts * 50;
    const rps = calculateRps({ place, fieldSize, knockouts, params: { knockoutPoints: 50 } });

    await db.insert(schema.tournamentResults).values({
      tournamentId: tournament.id,
      playerId: player.id,
      place,
      rpsAwarded: rps,
      knockoutsCount: knockouts,
      bountyPoints,
      publishedAt: scheduledAt,
    });

    await db.insert(schema.rpsLedger).values({
      playerId: player.id,
      clubId,
      tournamentId: tournament.id,
      delta: rps,
      reason: `${name}: место ${place}`,
      createdAt: scheduledAt,
    });

    if (knockouts > 0) {
      const eliminatedPool = participants.filter((p) => p.id !== player.id);
      for (let k = 0; k < knockouts; k++) {
        const victim = eliminatedPool[(i + k) % eliminatedPool.length];
        await db.insert(schema.knockouts).values({
          tournamentId: tournament.id,
          eliminatedPlayerId: victim.id,
          eliminatedByPlayerId: player.id,
          levelNumber: Math.min(12, 3 + k),
        });
      }
    }
  }

  console.log(`Created finished tournament "${name}" (${format}) with ${fieldSize} results`);
  return tournament;
}

async function main() {
  const club = await ensureClub();
  await ensureRankTiers(club.id);
  await ensureAchievements(club.id);
  const players = await ensurePlayers(club.id);

  const upcoming = await ensureUpcomingTournament(club.id, players);

  await ensureFinishedTournament(club.id, "Friday Knockout", "knockout", 3, players, [3, 2, 1, 1, 0, 0, 0, 0, 0, 0]);
  await ensureFinishedTournament(club.id, "Wednesday Turbo", "reentry", 5, players.slice(0, 8), []);
  await ensureFinishedTournament(club.id, "Tuesday Freezeout", "freezeout", 8, players, []);

  // If the test account (from the live /start flow) already exists, give it something to see too.
  const [testPlayer] = await db.select().from(schema.players).where(eq(schema.players.telegramId, "8975174647"));
  if (testPlayer) {
    const [membership] = await db
      .select()
      .from(schema.clubMemberships)
      .where(and(eq(schema.clubMemberships.clubId, club.id), eq(schema.clubMemberships.playerId, testPlayer.id)));
    if (!membership) {
      await db
        .insert(schema.clubMemberships)
        .values({ clubId: club.id, playerId: testPlayer.id, cardId: crypto.randomUUID() });
    }
    const [reg] = await db
      .select()
      .from(schema.registrations)
      .where(
        and(
          eq(schema.registrations.tournamentId, upcoming.id),
          eq(schema.registrations.playerId, testPlayer.id),
        ),
      );
    if (!reg) {
      await db.insert(schema.registrations).values({ tournamentId: upcoming.id, playerId: testPlayer.id });
    }
    console.log(`Linked test account (${testPlayer.nickname}) to the upcoming tournament`);

    const [staffAccount] = await db
      .select()
      .from(schema.staffAccounts)
      .where(and(eq(schema.staffAccounts.clubId, club.id), eq(schema.staffAccounts.telegramId, testPlayer.telegramId)));
    if (!staffAccount) {
      await db
        .insert(schema.staffAccounts)
        .values({ clubId: club.id, telegramId: testPlayer.telegramId, role: "owner" });
      console.log(`Granted owner role to test account for TD panel access`);
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
