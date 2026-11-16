ALTER TABLE "tournaments" ALTER COLUMN "rps_formula_params" SET DEFAULT '{"knockoutPoints":50,"placementWeight":1}'::jsonb;--> statement-breakpoint
ALTER TABLE "tables" ADD COLUMN "label" text;