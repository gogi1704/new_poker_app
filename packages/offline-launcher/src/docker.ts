import { spawn } from "node:child_process";
import type { BrowserWindow } from "electron";

export type LogSink = (text: string) => void;

export interface RunOptions {
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

export interface RunResult {
  code: number | null;
  stdout: string;
  timedOut: boolean;
}

// shell: true is required on Windows — docker/pnpm resolve to .cmd/.ps1
// shims that Node's spawn can't exec directly without going through a shell.
export function runCommand(command: string, args: string[], options: RunOptions, onLog?: LogSink): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      shell: true,
    });

    let stdout = "";
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill();
        }, options.timeoutMs)
      : null;

    child.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      onLog?.(text);
    });
    child.stderr?.on("data", (data: Buffer) => {
      onLog?.(data.toString());
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code, stdout, timedOut });
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      onLog?.(`\n[launcher] ${err.message}\n`);
      resolve({ code: -1, stdout, timedOut });
    });
  });
}

export type DockerStatus = "not-installed" | "not-running" | "running";

export async function checkDockerStatus(): Promise<DockerStatus> {
  const result = await runCommand("docker", ["info"], { cwd: process.cwd(), timeoutMs: 8000 });
  if (result.code === -1 && !result.stdout) return "not-installed";
  return result.code === 0 ? "running" : "not-running";
}

export interface ComposeService {
  name: string;
  state: string;
}

export async function composeStatus(repoPath: string): Promise<ComposeService[]> {
  const result = await runCommand(
    "docker",
    ["compose", "-f", "docker-compose.local.yml", "ps", "--format", "json"],
    { cwd: repoPath, timeoutMs: 10000 },
  );
  if (result.code !== 0 || !result.stdout.trim()) return [];
  // docker compose ps --format json prints one JSON object per line.
  return result.stdout
    .trim()
    .split("\n")
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line);
        // Compose v2's JSON has a separate Health field ("healthy"/"unhealthy"/"starting")
        // for containers with a healthcheck; State is just "running" either way, so it
        // alone can never tell a healthy container from one still starting up.
        const state = [parsed.Health, parsed.Status, parsed.State].filter(Boolean).join(" ");
        return [{ name: parsed.Service as string, state }];
      } catch {
        return [];
      }
    });
}

export function streamTo(win: BrowserWindow, channel: string): LogSink {
  return (text: string) => win.webContents.send(channel, { type: "log", text });
}
