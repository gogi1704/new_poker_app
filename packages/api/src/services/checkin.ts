import { and, eq, sql } from "drizzle-orm";
import { schema, type Database } from "@poker/shared";
import { firstFreeSeat } from "./seating.js";

export interface SeatResult {
  tableNo: number;
  seatNo: number;
}

/**
 * Seats a player at the least-full active table, creating a new one if every
 * active table is full (or none exist yet). Shared by check-in (seat on
 * arrival), re-entry, and undo-knockout — every place that needs to put a
 * player onto the floor without the TD picking a specific seat.
 */
export async function seatPlayerIntoActiveTable(
  db: Database,
  tournamentId: string,
  playerId: string,
  maxSeatsPerTable: number,
): Promise<SeatResult> {
  const tableRows = await db
    .select()
    .from(schema.tables)
    .where(and(eq(schema.tables.tournamentId, tournamentId), eq(schema.tables.isActive, true)));

  const occupancy = await Promise.all(
    tableRows.map(async (t) => {
      const seated = await db
        .select({ seatNo: schema.registrations.seatNo })
        .from(schema.registrations)
        .where(and(eq(schema.registrations.seatTableId, t.id), eq(schema.registrations.status, "active")));
      return { table: t, takenSeats: new Set(seated.map((s) => s.seatNo).filter((n): n is number => n != null)) };
    }),
  );
  occupancy.sort((a, b) => a.takenSeats.size - b.takenSeats.size);

  let target = occupancy[0];
  if (!target || target.takenSeats.size >= maxSeatsPerTable) {
    const [newTable] = await db
      .insert(schema.tables)
      .values({ tournamentId, tableNo: tableRows.length + 1, maxSeats: maxSeatsPerTable })
      .returning();
    target = { table: newTable, takenSeats: new Set() };
  }

  const seatNo = firstFreeSeat(target.takenSeats);
  await db
    .update(schema.registrations)
    .set({ status: "active", seatTableId: target.table.id, seatNo })
    .where(and(eq(schema.registrations.tournamentId, tournamentId), eq(schema.registrations.playerId, playerId)));

  return { tableNo: target.table.tableNo, seatNo };
}

/**
 * Check-in desk action: confirms a registered player has arrived AND seats
 * them immediately, so the TD can tell them their table/seat on the spot
 * instead of waiting for a later batch seating step. Returns null if the
 * player isn't in a state check-in applies to (already seated, eliminated,
 * cancelled, or not registered at all) — a harmless no-op, not an error.
 * Deliberately per-player only: there is no bulk "check everyone in" action,
 * since an online registration is not proof the player actually showed up.
 */
export async function checkInAndSeat(
  db: Database,
  tournamentId: string,
  tournament: { startingStack: number; maxSeatsPerTable: number },
  playerId: string,
): Promise<SeatResult | null> {
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(
      and(
        eq(schema.registrations.tournamentId, tournamentId),
        eq(schema.registrations.playerId, playerId),
        sql`${schema.registrations.status} in ('registered', 'checked_in')`,
      ),
    );
  if (!reg) return null;

  const seat = await seatPlayerIntoActiveTable(db, tournamentId, playerId, tournament.maxSeatsPerTable);
  await db
    .update(schema.registrations)
    .set({ currentStack: tournament.startingStack })
    .where(eq(schema.registrations.id, reg.id));
  return seat;
}

/**
 * Reverses check-in (the TD unchecks someone, e.g. a mis-tap): clears their
 * seat and returns them to "registered", closing the table behind them if
 * that was its last occupant — mirrors the cleanup knockout already does.
 */
export async function undoCheckIn(db: Database, tournamentId: string, playerId: string): Promise<void> {
  const [reg] = await db
    .select()
    .from(schema.registrations)
    .where(
      and(
        eq(schema.registrations.tournamentId, tournamentId),
        eq(schema.registrations.playerId, playerId),
        sql`${schema.registrations.status} in ('checked_in', 'active')`,
      ),
    );
  if (!reg) return;

  await db
    .update(schema.registrations)
    .set({ status: "registered", seatTableId: null, seatNo: null, currentStack: null })
    .where(eq(schema.registrations.id, reg.id));

  if (reg.seatTableId) {
    const [{ remaining }] = await db
      .select({ remaining: sql<number>`count(*)` })
      .from(schema.registrations)
      .where(and(eq(schema.registrations.seatTableId, reg.seatTableId), eq(schema.registrations.status, "active")));
    if (Number(remaining) === 0) {
      await db.update(schema.tables).set({ isActive: false }).where(eq(schema.tables.id, reg.seatTableId));
    }
  }
}
