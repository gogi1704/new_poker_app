import { z } from "zod";

export const telegramWebAppUserSchema = z.object({
  id: z.number(),
  first_name: z.string(),
  last_name: z.string().optional(),
  username: z.string().optional(),
  language_code: z.string().optional(),
  photo_url: z.string().optional(),
});

export type TelegramWebAppUser = z.infer<typeof telegramWebAppUserSchema>;
