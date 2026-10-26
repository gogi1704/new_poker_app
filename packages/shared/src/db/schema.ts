import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  unique,
  primaryKey,
} from "drizzle-orm/pg-core";

// ---------- enums ----------

export const staffRoleEnum = pgEnum("staff_role", ["owner", "td", "floor"]);

export const tournamentFormatEnum = pgEnum("tournament_format", [
  "freezeout",
  "reentry",
  "knockout",
  "reentry_knockout",
]);

export const tournamentStatusEnum = pgEnum("tournament_status", [
  "scheduled",
  "registering",
  "running",
  "paused",
  "finished",
  "cancelled",
]);

export const registrationStatusEnum = pgEnum("registration_status", [
  "registered",
  "checked_in",
  "active",
  "eliminated",
  "cancelled",
]);

export const rebuyAddonTypeEnum = pgEnum("rebuy_addon_type", ["reentry", "addon"]);

export const rankThresholdTypeEnum = pgEnum("rank_threshold_type", ["rps", "games"]);

export const achievementThresholdTypeEnum = pgEnum("achievement_threshold_type", [
  "cashes",
  "rps",
  "streak",
  "games",
]);

export const pushTypeEnum = pgEnum("push_type", ["telegram_dm", "web_push"]);

// ---------- core tables ----------

export interface BoardSettings {
  showPayoutPreview: boolean;
  showKnockoutTicker: boolean;
  showChipLeader: boolean;
  accentColor: string;
  soundEnabled: boolean;
  soundVolume: number;
}

export const DEFAULT_BOARD_SETTINGS: BoardSettings = {
  showPayoutPreview: true,
  showKnockoutTicker: true,
  showChipLeader: false,
  accentColor: "#4da3ff",
  soundEnabled: true,
  soundVolume: 0.7,
};

export const clubs = pgTable("clubs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  logoUrl: text("logo_url"),
  timezone: text("timezone").notNull().default("Europe/Moscow"),
  boardSettings: jsonb("board_settings").$type<BoardSettings>().notNull().default(DEFAULT_BOARD_SETTINGS),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const staffAccounts = pgTable(
  "staff_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    telegramId: text("telegram_id").notNull(),
    role: staffRoleEnum("role").notNull().default("floor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.clubId, t.telegramId)],
);

export const players = pgTable("players", {
  id: uuid("id").primaryKey().defaultRandom(),
  telegramId: text("telegram_id").notNull().unique(),
  nickname: text("nickname").notNull(),
  avatarUrl: text("avatar_url"),
  derivedEmail: text("derived_email").notNull(),
  consentAt: timestamp("consent_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const clubMemberships = pgTable(
  "club_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clubId: uuid("club_id")
      .notNull()
      .references(() => clubs.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    memberLevel: text("member_level").notNull().default("Участник"),
    cardId: text("card_id").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.clubId, t.playerId)],
);

export const rankTiers = pgTable("rank_tiers", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  order: integer("order").notNull(),
  thresholdType: rankThresholdTypeEnum("threshold_type").notNull(),
  thresholdValue: integer("threshold_value").notNull(),
  badgeIcon: text("badge_icon"),
});

// ---------- tournaments ----------

export const tournaments = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  format: tournamentFormatEnum("format").notNull().default("freezeout"),
  status: tournamentStatusEnum("status").notNull().default("scheduled"),
  // Separate from status (a running/finished/cancelled tournament can all be
  // archived) — just hides it from the default list, nothing destructive.
  archived: boolean("archived").notNull().default(false),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  buyIn: numeric("buy_in", { precision: 10, scale: 2 }).notNull(),
  startingStack: integer("starting_stack").notNull(),
  maxSeats: integer("max_seats").notNull(),
  maxSeatsPerTable: integer("max_seats_per_table").notNull().default(9),

  lateRegUntilLevel: integer("late_reg_until_level"),
  reentryAllowedUntilLevel: integer("reentry_allowed_until_level"),
  reentryPrice: numeric("reentry_price", { precision: 10, scale: 2 }),

  addonPrice: numeric("addon_price", { precision: 10, scale: 2 }),
  addonStack: integer("addon_stack"),
  addonAvailableLevel: integer("addon_available_level"),
  addonMaxCount: integer("addon_max_count").default(1),

  arriveBonusStack: integer("arrive_bonus_stack").default(0),

  // { base: "linear" | "flat", knockoutPoints: number, ... } — tunable without code changes
  rpsFormulaParams: jsonb("rps_formula_params")
    .$type<{ knockoutPoints: number }>()
    .notNull()
    .default({ knockoutPoints: 50 }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const blindLevels = pgTable(
  "blind_levels",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    levelNumber: integer("level_number").notNull(),
    smallBlind: integer("small_blind").notNull(),
    bigBlind: integer("big_blind").notNull(),
    ante: integer("ante").notNull().default(0),
    durationMinutes: integer("duration_minutes").notNull(),
    isBreak: boolean("is_break").notNull().default(false),
  },
  (t) => [unique().on(t.tournamentId, t.levelNumber)],
);

export const tournamentClockState = pgTable("tournament_clock_state", {
  tournamentId: uuid("tournament_id")
    .primaryKey()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  currentLevelNumber: integer("current_level_number").notNull().default(1),
  levelStartedAt: timestamp("level_started_at", { withTimezone: true }),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  elapsedPauseSeconds: integer("elapsed_pause_seconds").notNull().default(0),
});

export const tables = pgTable("tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  tableNo: integer("table_no").notNull(),
  maxSeats: integer("max_seats").notNull().default(9),
  isActive: boolean("is_active").notNull().default(true),
});

export const registrations = pgTable(
  "registrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    status: registrationStatusEnum("status").notNull().default("registered"),
    seatTableId: uuid("seat_table_id").references(() => tables.id, {
      onDelete: "set null",
    }),
    seatNo: integer("seat_no"),
    currentStack: integer("current_stack"),
    arrivedBeforeLateReg: boolean("arrived_before_late_reg").notNull().default(false),
    registeredAt: timestamp("registered_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tournamentId, t.playerId)],
);

export const rebuyAddonTransactions = pgTable("rebuy_addon_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  type: rebuyAddonTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
  stackGranted: integer("stack_granted").notNull(),
  levelNumberAtPurchase: integer("level_number_at_purchase").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const knockouts = pgTable("knockouts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id")
    .notNull()
    .references(() => tournaments.id, { onDelete: "cascade" }),
  eliminatedPlayerId: uuid("eliminated_player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  eliminatedByPlayerId: uuid("eliminated_by_player_id").references(() => players.id, {
    onDelete: "set null",
  }),
  levelNumber: integer("level_number").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const tournamentResults = pgTable(
  "tournament_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tournamentId: uuid("tournament_id")
      .notNull()
      .references(() => tournaments.id, { onDelete: "cascade" }),
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    place: integer("place").notNull(),
    rpsAwarded: integer("rps_awarded").notNull(),
    knockoutsCount: integer("knockouts_count").notNull().default(0),
    bountyPoints: integer("bounty_points").notNull().default(0),
    payout: numeric("payout", { precision: 10, scale: 2 }),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.tournamentId, t.playerId)],
);

// ---------- rating / gamification ----------

export const rpsLedger = pgTable("rps_ledger", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  clubId: uuid("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  tournamentId: uuid("tournament_id").references(() => tournaments.id, {
    onDelete: "set null",
  }),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const achievements = pgTable("achievements", {
  id: uuid("id").primaryKey().defaultRandom(),
  clubId: uuid("club_id")
    .notNull()
    .references(() => clubs.id, { onDelete: "cascade" }),
  key: text("key").notNull(),
  name: text("name").notNull(),
  thresholdType: achievementThresholdTypeEnum("threshold_type").notNull(),
  thresholdValue: integer("threshold_value").notNull(),
}, (t) => [unique().on(t.clubId, t.key)]);

export const achievementProgress = pgTable(
  "achievement_progress",
  {
    playerId: uuid("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    achievementId: uuid("achievement_id")
      .notNull()
      .references(() => achievements.id, { onDelete: "cascade" }),
    progressValue: integer("progress_value").notNull().default(0),
    unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.playerId, t.achievementId] })],
);

// ---------- notifications ----------

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  playerId: uuid("player_id")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  type: pushTypeEnum("type").notNull(),
  endpoint: jsonb("endpoint"),
  enabled: boolean("enabled").notNull().default(true),
});
