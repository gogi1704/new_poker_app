import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export interface TelegramLoginWidgetPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

/**
 * Validates the payload from the Telegram Login Widget (used for browser
 * access outside the Telegram app) per
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * This is a DIFFERENT signing scheme than Mini App `initData` (see
 * telegram-init-data.ts): the secret key here is sha256(bot_token) directly,
 * not hmac("WebAppData", bot_token).
 */
export function validateTelegramLoginWidget(
  payload: TelegramLoginWidgetPayload,
  botToken: string,
): TelegramLoginWidgetPayload {
  const { hash, ...fields } = payload;
  if (!hash) throw new Error("widget payload missing hash");

  const dataCheckString = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHash("sha256").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const expected = Buffer.from(computedHash, "hex");
  const actual = Buffer.from(hash, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error("widget signature mismatch");
  }

  const ageSeconds = Date.now() / 1000 - payload.auth_date;
  if (ageSeconds > MAX_AUTH_AGE_SECONDS || ageSeconds < -60) {
    throw new Error("widget login is stale, try again");
  }

  return payload;
}
