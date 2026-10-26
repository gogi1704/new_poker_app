/** Fallback only — every tournament now carries its own maxSeatsPerTable (default 9). */
export const DEFAULT_MAX_SEATS_PER_TABLE = 9;

export interface SeatAssignment {
  playerId: string;
  tableNo: number;
  seatNo: number;
}

/** Shuffles players and deals them round-robin across the minimum number of tables. */
export function dealInitialSeats(playerIds: string[], maxSeatsPerTable = DEFAULT_MAX_SEATS_PER_TABLE): SeatAssignment[] {
  const shuffled = [...playerIds].sort(() => Math.random() - 0.5);
  const tableCount = Math.max(1, Math.ceil(shuffled.length / maxSeatsPerTable));
  const seatCounters = new Array(tableCount).fill(0);

  return shuffled.map((playerId, i) => {
    const tableNo = (i % tableCount) + 1;
    seatCounters[tableNo - 1] += 1;
    return { playerId, tableNo, seatNo: seatCounters[tableNo - 1] };
  });
}

export interface TableOccupancy {
  tableNo: number;
  /** Existing seat -> player assignments at this table. */
  seats: { playerId: string; seatNo: number }[];
}

export interface RebalanceMove {
  playerId: string;
  fromTableNo: number;
  toTableNo: number;
  seatNo: number;
}

export interface RebalanceResult {
  moves: RebalanceMove[];
  brokenTableNos: number[];
}

export function firstFreeSeat(takenSeats: Set<number>): number {
  let seatNo = 1;
  while (takenSeats.has(seatNo)) seatNo += 1;
  return seatNo;
}

/**
 * Simple greedy balance: if the total field fits in fewer tables, break the
 * emptiest one and redistribute its players into the least-full remaining
 * tables. Tracks actual seat *numbers* (not just a headcount) so a gap left
 * by an earlier elimination gets reused instead of colliding with a seat
 * that's still occupied.
 */
export function rebalanceTables(
  tables: TableOccupancy[],
  maxSeatsPerTable = DEFAULT_MAX_SEATS_PER_TABLE,
): RebalanceResult {
  const active = tables
    .filter((t) => t.seats.length > 0)
    .map((t) => ({ tableNo: t.tableNo, takenSeats: new Set(t.seats.map((s) => s.seatNo)) }));
  const totalPlayers = active.reduce((sum, t) => sum + t.takenSeats.size, 0);
  const seatsByTable = new Map(tables.map((t) => [t.tableNo, t.seats]));
  const moves: RebalanceMove[] = [];
  const brokenTableNos: number[] = [];

  const minTablesNeeded = Math.max(1, Math.ceil(totalPlayers / maxSeatsPerTable));
  active.sort((a, b) => a.takenSeats.size - b.takenSeats.size);

  while (active.length > minTablesNeeded) {
    const smallest = active.shift();
    if (!smallest) break;
    brokenTableNos.push(smallest.tableNo);
    const playerIds = (seatsByTable.get(smallest.tableNo) ?? []).map((s) => s.playerId);

    for (const playerId of playerIds) {
      active.sort((a, b) => a.takenSeats.size - b.takenSeats.size);
      const target = active[0];
      const seatNo = firstFreeSeat(target.takenSeats);
      target.takenSeats.add(seatNo);
      moves.push({ playerId, fromTableNo: smallest.tableNo, toTableNo: target.tableNo, seatNo });
    }
  }

  return { moves, brokenTableNos };
}
