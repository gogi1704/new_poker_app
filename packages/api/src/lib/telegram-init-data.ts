import { createHmac } from "node:crypto";
import { telegramWebAppUserSchema, type TelegramWebAppUser } from "@poker/shared";

const MAX_AUTH_AGE_SECONDS = 24 * 60 * 60;

export interface ValidatedInitData {
  user: TelegramWebAppUser;
  authDate: number;
}

/**
 * Validates Telegram WebApp `initData` per
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
export function validateTelegramInitData(
  initData: string,
  botToken: string,
): ValidatedInitData {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new Error("initData missing hash");
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (computedHash !== hash) {
    throw new Error("initData signature mismatch");
  }

  const authDate = Number(params.get("auth_date"));
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("initData is stale");
  }

  const rawUser = params.get("user");
  if (!rawUser) throw new Error("initData missing user");
  const user = telegramWebAppUserSchema.parse(JSON.parse(rawUser));

  return { user, authDate };
}
