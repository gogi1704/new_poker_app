import jwt from "jsonwebtoken";

export interface WebLoginTicket {
  tgId: string;
  nickname: string;
  purpose: "web-login";
}

/**
 * A short-lived, single-purpose JWT proving "this is Telegram user tgId" —
 * lets the standalone web app (opened outside Telegram's WebView, see
 * packages/web-player/src/App.tsx) log the player in without `initData`.
 *
 * Deliberately NOT shaped like a session token ({ telegramId, ... }, see
 * packages/api/src/plugins/auth.ts) — a ticket must never double as a valid
 * Bearer token for an already-authenticated route if it leaks/gets logged
 * somewhere; only POST /api/auth/magic-link knows how to read `tgId`.
 */
export function buildWebLoginLink(webAppUrl: string, tgId: string, nickname: string): string {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) throw new Error("JWT_SECRET is not set");

  const token = jwt.sign({ tgId, nickname, purpose: "web-login" } satisfies WebLoginTicket, jwtSecret, {
    expiresIn: "15m",
  });
  return `${webAppUrl}/?login=${token}`;
}
