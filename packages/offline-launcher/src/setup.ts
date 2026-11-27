import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { composeStatus, runCommand, type LogSink } from "./docker";

const LOCAL_PG_URL = "postgresql://pokerclub:pokerclub@localhost:5432/pokerclub";

function ensureEnvFile(repoPath: string, log: LogSink): void {
  const envPath = join(repoPath, ".env.local-offline");
  if (existsSync(envPath)) {
    log("[launcher] .env.local-offline уже существует — пропускаю.\n");
    return;
  }
  const examplePath = join(repoPath, ".env.local-offline.example");
  const template = readFileSync(examplePath, "utf-8");
  const secret = randomBytes(32).toString("hex");
  const filled = template.replace(/^JWT_SECRET=.*$/m, `JWT_SECRET=${secret}`);
  writeFileSync(envPath, filled, "utf-8");
  log("[launcher] Создан .env.local-offline со случайным JWT_SECRET.\n");
}

async function waitForPostgresHealthy(repoPath: string, log: LogSink): Promise<boolean> {
  for (let attempt = 0; attempt < 45; attempt++) {
    const services = await composeStatus(repoPath);
    const postgres = services.find((s) => s.name === "postgres");
    if (postgres?.state.includes("healthy")) return true;
    await new Promise((r) => setTimeout(r, 2000));
  }
  log("[launcher] Postgres не стал healthy за 90 секунд.\n");
  return false;
}

// The full one-time setup from docs/OFFLINE.md, scripted end to end. Safe to
// re-run any time (every step it drives is already idempotent on its own —
// build, up -d, migrate, init-club) so this doubles as "re-check everything".
export async function runSetup(repoPath: string, log: LogSink): Promise<boolean> {
  ensureEnvFile(repoPath, log);

  log("\n[launcher] Собираю образы (может занять несколько минут)...\n");
  const build = await runCommand("docker", ["compose", "-f", "docker-compose.local.yml", "build"], { cwd: repoPath }, log);
  if (build.code !== 0) {
    log("\n[launcher] Сборка образов не удалась.\n");
    return false;
  }

  log("\n[launcher] Поднимаю базу данных...\n");
  const upDb = await runCommand(
    "docker",
    ["compose", "-f", "docker-compose.local.yml", "up", "-d", "postgres"],
    { cwd: repoPath },
    log,
  );
  if (upDb.code !== 0) {
    log("\n[launcher] Не удалось поднять Postgres.\n");
    return false;
  }

  log("[launcher] Жду, пока Postgres станет готов...\n");
  if (!(await waitForPostgresHealthy(repoPath, log))) return false;

  log("\n[launcher] Применяю миграции...\n");
  const migrate = await runCommand(
    "pnpm",
    ["--filter", "@poker/shared", "db:migrate"],
    { cwd: repoPath, env: { DATABASE_URL_UNPOOLED: LOCAL_PG_URL } },
    log,
  );
  if (migrate.code !== 0) {
    log("\n[launcher] Миграции не применились.\n");
    return false;
  }

  log("\n[launcher] Создаю клуб (если ещё не создан)...\n");
  const initClub = await runCommand("pnpm", ["--filter", "@poker/api", "local:init-club"], { cwd: repoPath }, log);
  if (initClub.code !== 0) {
    log("\n[launcher] Не удалось создать клуб.\n");
    return false;
  }

  log("\n[launcher] Поднимаю остальные сервисы...\n");
  const upAll = await runCommand("docker", ["compose", "-f", "docker-compose.local.yml", "up", "-d"], { cwd: repoPath }, log);
  if (upAll.code !== 0) {
    log("\n[launcher] Не удалось поднять стек целиком.\n");
    return false;
  }

  log("\n[launcher] Готово! Открой панель кнопкой «Открыть панель».\n");
  return true;
}
