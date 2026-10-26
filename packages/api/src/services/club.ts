import { schema, type Database } from "@poker/shared";

/** Single-club launch: there is exactly one club row for now (see docs/PLAN.md). */
export async function getDefaultClub(db: Database) {
  const [club] = await db.select().from(schema.clubs).limit(1);
  if (!club) throw new Error("No club configured — run the seed script first");
  return club;
}
