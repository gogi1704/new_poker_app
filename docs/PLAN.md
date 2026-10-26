# Poker Club Management Platform (Telegram bot + Mini App + TD panel)

## Context
The user runs/plays in a poker club and wants their own version of **"ДОНПОКЕР"** — a Telegram bot that's actually a thin wrapper around **Poker Soft** (poker-soft.ru), a commercial white-label SaaS for poker-club tournament management. We don't have access to Poker Soft's code; everything below was reconstructed by live-exploring the player-facing Mini App through the user's own Telegram account (see conversation) plus standard poker-tournament-director practice for the parts we couldn't see (staff/TD tooling). We're building an original implementation of the same *category* of software (tournament scheduling, registration, live clock, seating, results, rating/gamification) — not copying any Poker Soft code or assets.

Scope: build everything end-to-end, including the staff-facing Tournament Director (TD) console — not just a read-only MVP. Target is a single club at launch, but the data model should not require a rewrite to add more clubs later.

Stack (user-approved): **Node.js + TypeScript backend, React for both the player Mini App and the TD panel, Postgres database.**

## Tech choices

| Decision | Choice | Why |
|---|---|---|
| Backend framework | **Fastify** | TS-first, built-in schema validation (useful for Telegram `initData` + tournament payloads), clean plugin/route encapsulation. |
| Telegram bot lib | **grammY** | Strong TS types, official Fastify webhook adapter for later production deploy. |
| Monorepo tooling | **pnpm workspaces + Turborepo** | No phantom deps, cached/parallel builds across packages. |
| ORM / migrations | **Drizzle ORM** | SQL-close and readable — easier to debug tournament-state bugs than a heavier ORM. |
| Realtime (TD console / clock display / live player view) | **SSE (Server-Sent Events)** fed by an in-process EventEmitter, actions via plain REST POST | TD actions are one-off commands (REST is enough); all surfaces just *observe* state, which SSE does with built-in browser reconnect and no socket/room complexity. Revisit (Postgres LISTEN/NOTIFY or Redis) only if we ever run multiple server instances. |
| Blind clock | Server-authoritative timestamps (`level_started_at`, `duration`, `elapsed_pause_seconds`); clients compute remaining time locally, never trust a decrementing local counter | Eliminates drift, trivial reconnect. |

## Repo structure

```
new_poker_app/
  pnpm-workspace.yaml
  turbo.json
  tsconfig.base.json
  docker-compose.yml          # postgres + adminer for local dev
  .env.example
  packages/
    shared/                   # Drizzle schema, zod types, pure RPS/rank/achievement logic
    api/                      # Fastify: REST + SSE, consumed by bot + both web apps
    bot/                      # grammY process
    web-player/               # React Mini App (5 bottom-nav tabs)
    web-td/                   # React TD/admin panel
  docs/
    PLAN.md                   # this plan, saved for reference
```

## Postgres data model (concise)

- **clubs** — name, logo_url, timezone. Kept as a first-class table from day one (even with a single row at launch) so adding clubs later needs no migration.
- **staff_accounts** — club_id, telegram_id, role(owner/td/floor)
- **players** — telegram_id (unique), nickname, avatar_url, derived_email, consent_at, deleted_at
- **club_memberships** — club_id, player_id, member_level, card_id — unique(club_id, player_id); this join table is what makes multi-club support additive later
- **rank_tiers** — club_id, name, order, threshold_type(rps/games), threshold_value, badge_icon
- **tournaments** — club_id, name, format(freezeout/reentry/knockout/reentry_knockout), scheduled_at, status, buy_in, starting_stack, max_seats, late_reg_until_level, reentry_allowed_until_level, reentry_price, addon_price/stack/level/max_count, arrive_bonus_stack, rps_formula_params(jsonb)
- **blind_levels** — tournament_id, level_number, small_blind, big_blind, ante, duration_minutes, is_break
- **tournament_clock_state** — tournament_id (1:1), current_level_number, level_started_at, paused_at, elapsed_pause_seconds
- **tables** — tournament_id, table_no, max_seats, is_active
- **registrations** — tournament_id, player_id, status(registered/checked_in/active/eliminated/cancelled), seat_table_id, seat_no, arrived_before_late_reg — unique(tournament_id, player_id)
- **rebuy_addon_transactions** — tournament_id, player_id, type(reentry/addon), amount, stack_granted, level_number_at_purchase
- **knockouts** — tournament_id, eliminated_player_id, eliminated_by_player_id(nullable), level_number
- **tournament_results** — tournament_id, player_id, place, rps_awarded, knockouts_count, bounty_points, published_at — unique(tournament_id, player_id)
- **rps_ledger** — player_id, club_id, tournament_id(nullable), season_id, delta, reason, created_at — append-only; running total = SUM(delta)
- **achievements** — club_id, key, name, threshold_type(cashes/rps/streak/games), threshold_value
- **achievement_progress** — player_id, achievement_id, progress_value, unlocked_at(nullable)
- **push_subscriptions** — player_id, type(telegram_dm/web_push), endpoint/keys(jsonb), enabled

## Default assumptions (flagged as approximate, confirmed with user)

- **RPS formula**: `base = round(100 * (1 - (place-1)/field_size))` + configurable `+X per knockout`, both stored per-tournament in `rps_formula_params` so a TD can tune without touching code. Approximate logic only — exact parity with the reference club was explicitly *not* required.
- **Multi-club scope**: single club at launch; no "Club vs Country" rating toggle built yet, but `clubs`/`club_memberships` make it additive. Skip the Rating tab's scope switch in Phase 5; just show club-scoped rating.
- **Table balancing**: simple greedy balancer (break the fewest-players table first, fill the least-full table, avoid immediately reseating two players who just shared a table).
- **QR check-in**: staff device camera via `html5-qrcode` scanning a signed player+club token from "My QR"; manual search is always available as a fallback.
- **Mini App session**: validate Telegram `initData` HMAC once per app-open, issue a 24h JWT, re-validate on reopen.
- **No payment gateway** — buy-ins/re-entries/add-ons are ledger entries only, settled in cash/at-the-door by staff. No Stripe/YooKassa integration.
- **No actual card-dealing/RNG poker logic** — this is tournament *management* (clock, registration, standings, rating), not an online poker engine.

## Phased build plan

| Phase | Goal | Build | Verify |
|---|---|---|---|
| **0 — Scaffolding** | Monorepo boots | pnpm workspaces, Turborepo, base tsconfig/eslint/prettier, docker-compose Postgres, `shared` package stub, Drizzle wired | `pnpm install && pnpm turbo run build`; `docker compose up -d`; `pnpm --filter api dev` → `/health` returns 200 |
| **1 — Data model + auth** | Schema live, Telegram identity works | Core tables migrated; Fastify plugin validating `initData` HMAC → short-lived JWT; grammY `/start` with inline `web_app` button | Run bot via long polling with a BotFather test token; tunnel web-player dev server over HTTPS (ngrok/cloudflared — Telegram requires HTTPS even for local `web_app` buttons); `/start` shows welcome + button; tapping it opens the Mini App, which POSTs `initData` to `/api/auth/telegram` and gets a player record back |
| **2 — Bot + read-only Mini App** | All 5 tabs render real data | Seed script (club, tournaments, blind levels, fake players, published results); `GET /tournaments`, `/tournaments/:id`, `/results`, `/rating`; React bottom-nav + 5 tabs; client-side countdown | Open the Mini App in Telegram desktop client via tunnel; browse all 5 tabs against seeded data |
| **3 — Registration flow** | Players can register; bot DMs work | `POST /tournaments/:id/register` (seat-cap checked, idempotent); "My QR"/"Scan QR" (signed token); reminder cron (node-cron) respecting the `push_subscriptions` toggle | Register from the Mini App, seat counter increments live; toggle off bot DMs, confirm the cron skips that player |
| **4a — TD setup** | Staff can configure tournaments | web-td CRUD for tournaments + blind-structure editor; staff auth via Telegram id + role check; club branding/staff settings | Create a 10-level blind structure in web-td; see it appear instantly in the player Mini App list |
| **4b — Live console** | Run a tournament live | Clock start/pause/resume, manual level override, check-in (QR/search), seating auto-balance, mark-knockout (+bounty prompt), re-entry/add-on processing, SSE broadcast to TD console + clock-display + player view | Start a seeded tournament's clock; open the clock-display in a second tab and watch it update without reload; eliminate a player, confirm standings update everywhere |
| **4c — Publish results** | Close out a tournament | Payout entry (place→prize, % table or manual override); "publish results" writes `tournament_results` + `rps_ledger`, triggers recalculation | Publish a finished tournament; player's Results + Rating tabs reflect the new RPS in the same session |
| **5 — Rating/gamification** | Ladder + achievements | `rank_tiers`, `achievements`, `achievement_progress` wired to a recalculation job; club-scoped Rating tab (no Country toggle yet, per decision above) | Publish 2+ tournaments for a seeded player; confirm an achievement progress counter increments and a rank badge unlocks at threshold |
| **6 — Polish** | Production-ready | Membership-card image export, GDPR/152-ФЗ "delete my data" (soft-delete + anonymized ledger), web-push toggle, webhook-mode bot deploy, basic rate limiting on TD routes | Full tournament lifecycle demo end-to-end on a staging HTTPS domain with the bot in webhook mode |

Each phase is independently runnable; Phase 2 already gives a demoable bot + app before any TD code exists.

## Verification approach overall
- Local dev loop uses an HTTPS tunnel (ngrok/cloudflared) pointed at web-player/web-td, since Telegram requires HTTPS for `web_app` buttons and `initData` to be issued at all — this must be set up in Phase 1 and kept running throughout.
- Seed data (Phase 2's seed script) is reused/extended for every later phase so the Mini App and TD panel always have something real to click through.
- No automated test suite is prescribed up front given solo-dev/demo-driven phases; add focused unit tests for the pure logic in `packages/shared/src/rps` (scoring, rank thresholds, achievement thresholds) once that logic exists, since it's the easiest place for silent bugs.

## Critical files to create first
- `pnpm-workspace.yaml`, `turbo.json`
- `packages/shared/src/db/schema.ts` — single source of truth for the data model above
- `packages/api/src/plugins/telegram-auth.ts` — initData HMAC validation
- `packages/bot/src/index.ts` — `/start` handler
- `packages/api/src/routes/realtime/sse.ts` — SSE fan-out used by Phase 4b
