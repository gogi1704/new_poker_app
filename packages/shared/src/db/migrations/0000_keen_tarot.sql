CREATE TYPE "public"."achievement_threshold_type" AS ENUM('cashes', 'rps', 'streak', 'games');--> statement-breakpoint
CREATE TYPE "public"."push_type" AS ENUM('telegram_dm', 'web_push');--> statement-breakpoint
CREATE TYPE "public"."rank_threshold_type" AS ENUM('rps', 'games');--> statement-breakpoint
CREATE TYPE "public"."rebuy_addon_type" AS ENUM('reentry', 'addon');--> statement-breakpoint
CREATE TYPE "public"."registration_status" AS ENUM('registered', 'checked_in', 'active', 'eliminated', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'td', 'floor');--> statement-breakpoint
CREATE TYPE "public"."tournament_format" AS ENUM('freezeout', 'reentry', 'knockout', 'reentry_knockout');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('scheduled', 'registering', 'running', 'paused', 'finished', 'cancelled');--> statement-breakpoint
CREATE TABLE "achievement_progress" (
	"player_id" uuid NOT NULL,
	"achievement_id" uuid NOT NULL,
	"progress_value" integer DEFAULT 0 NOT NULL,
	"unlocked_at" timestamp with time zone,
	CONSTRAINT "achievement_progress_player_id_achievement_id_pk" PRIMARY KEY("player_id","achievement_id")
);
--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"threshold_type" "achievement_threshold_type" NOT NULL,
	"threshold_value" integer NOT NULL,
	CONSTRAINT "achievements_club_id_key_unique" UNIQUE("club_id","key")
);
--> statement-breakpoint
CREATE TABLE "blind_levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"level_number" integer NOT NULL,
	"small_blind" integer NOT NULL,
	"big_blind" integer NOT NULL,
	"ante" integer DEFAULT 0 NOT NULL,
	"duration_minutes" integer NOT NULL,
	"is_break" boolean DEFAULT false NOT NULL,
	CONSTRAINT "blind_levels_tournament_id_level_number_unique" UNIQUE("tournament_id","level_number")
);
--> statement-breakpoint
CREATE TABLE "club_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"member_level" text DEFAULT 'Участник' NOT NULL,
	"card_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "club_memberships_club_id_player_id_unique" UNIQUE("club_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"logo_url" text,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knockouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"eliminated_player_id" uuid NOT NULL,
	"eliminated_by_player_id" uuid,
	"level_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"telegram_id" text NOT NULL,
	"nickname" text NOT NULL,
	"avatar_url" text,
	"derived_email" text NOT NULL,
	"consent_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "players_telegram_id_unique" UNIQUE("telegram_id")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"type" "push_type" NOT NULL,
	"endpoint" jsonb,
	"enabled" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rank_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order" integer NOT NULL,
	"threshold_type" "rank_threshold_type" NOT NULL,
	"threshold_value" integer NOT NULL,
	"badge_icon" text
);
--> statement-breakpoint
CREATE TABLE "rebuy_addon_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"type" "rebuy_addon_type" NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"stack_granted" integer NOT NULL,
	"level_number_at_purchase" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"status" "registration_status" DEFAULT 'registered' NOT NULL,
	"seat_table_id" uuid,
	"seat_no" integer,
	"arrived_before_late_reg" boolean DEFAULT false NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registrations_tournament_id_player_id_unique" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "rps_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"club_id" uuid NOT NULL,
	"tournament_id" uuid,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "staff_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"telegram_id" text NOT NULL,
	"role" "staff_role" DEFAULT 'floor' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_accounts_club_id_telegram_id_unique" UNIQUE("club_id","telegram_id")
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"table_no" integer NOT NULL,
	"max_seats" integer DEFAULT 9 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_clock_state" (
	"tournament_id" uuid PRIMARY KEY NOT NULL,
	"current_level_number" integer DEFAULT 1 NOT NULL,
	"level_started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"elapsed_pause_seconds" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"place" integer NOT NULL,
	"rps_awarded" integer NOT NULL,
	"knockouts_count" integer DEFAULT 0 NOT NULL,
	"bounty_points" integer DEFAULT 0 NOT NULL,
	"payout" numeric(10, 2),
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournament_results_tournament_id_player_id_unique" UNIQUE("tournament_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"club_id" uuid NOT NULL,
	"name" text NOT NULL,
	"format" "tournament_format" DEFAULT 'freezeout' NOT NULL,
	"status" "tournament_status" DEFAULT 'scheduled' NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"buy_in" numeric(10, 2) NOT NULL,
	"starting_stack" integer NOT NULL,
	"max_seats" integer NOT NULL,
	"late_reg_until_level" integer,
	"reentry_allowed_until_level" integer,
	"reentry_price" numeric(10, 2),
	"addon_price" numeric(10, 2),
	"addon_stack" integer,
	"addon_available_level" integer,
	"addon_max_count" integer DEFAULT 1,
	"arrive_bonus_stack" integer DEFAULT 0,
	"rps_formula_params" jsonb DEFAULT '{"knockoutPoints":50}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "achievement_progress" ADD CONSTRAINT "achievement_progress_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievement_progress" ADD CONSTRAINT "achievement_progress_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blind_levels" ADD CONSTRAINT "blind_levels_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_memberships" ADD CONSTRAINT "club_memberships_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knockouts" ADD CONSTRAINT "knockouts_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knockouts" ADD CONSTRAINT "knockouts_eliminated_player_id_players_id_fk" FOREIGN KEY ("eliminated_player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knockouts" ADD CONSTRAINT "knockouts_eliminated_by_player_id_players_id_fk" FOREIGN KEY ("eliminated_by_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rank_tiers" ADD CONSTRAINT "rank_tiers_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebuy_addon_transactions" ADD CONSTRAINT "rebuy_addon_transactions_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rebuy_addon_transactions" ADD CONSTRAINT "rebuy_addon_transactions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "registrations" ADD CONSTRAINT "registrations_seat_table_id_tables_id_fk" FOREIGN KEY ("seat_table_id") REFERENCES "public"."tables"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps_ledger" ADD CONSTRAINT "rps_ledger_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps_ledger" ADD CONSTRAINT "rps_ledger_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rps_ledger" ADD CONSTRAINT "rps_ledger_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_accounts" ADD CONSTRAINT "staff_accounts_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_clock_state" ADD CONSTRAINT "tournament_clock_state_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_results" ADD CONSTRAINT "tournament_results_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;