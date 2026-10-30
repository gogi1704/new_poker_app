import type { BlindLevel } from "./types.js";

export interface LiveClock {
  levelNumber: number;
  elapsedSeconds: number;
  isPaused: boolean;
  asOf: string;
  level: BlindLevel | null;
  nextLevel: BlindLevel | null;
}

export interface LiveSeat {
  seatNo: number | null;
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  currentStack: number | null;
}

export interface LiveTable {
  tableNo: number;
  maxSeats: number;
  seats: LiveSeat[];
}

export interface LiveElimination {
  playerId: string;
  nickname: string;
  eliminatedByNickname: string | null;
  place: number;
  levelNumber: number;
  at: string;
}

export interface CheckinEntry {
  playerId: string;
  nickname: string;
  status: "registered" | "checked_in";
}

export interface ChipLeader {
  playerId: string;
  nickname: string;
  stack: number;
}

export interface BoardAnnouncement {
  text: string;
  expiresAt: string;
}

export const BOARD_BLOCK_TYPES = [
  "clock",
  "stats-players",
  "stats-tables",
  "stats-avg-stack",
  "chip-leader",
  "payout-preview",
  "knockout-ticker",
  "tables-seats",
  "participants-list",
  "blind-structure",
  "custom-text",
  "club-name",
  "club-logo",
] as const;

export type BoardBlockType = (typeof BOARD_BLOCK_TYPES)[number];

export interface BoardBlockConfig {
  id: string;
  type: BoardBlockType;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
}

export interface BoardSettings {
  accentColor: string;
  soundEnabled: boolean;
  soundVolume: number;
  backgroundUrl: string | null;
  layout: BoardBlockConfig[];
}

export interface BoardInfo {
  clubName: string;
  logoUrl: string | null;
  settings: BoardSettings;
}

export interface LiveState {
  tournament: {
    id: string;
    name: string;
    format: string;
    status: string;
    buyIn: string;
    startingStack: number;
    maxSeats: number;
    reentryAllowedUntilLevel: number | null;
    reentryPrice: string | null;
    addonPrice: string | null;
    addonStack: number | null;
  };
  clock: LiveClock | null;
  counts: {
    checkedIn: number;
    active: number;
    eliminated: number;
    fieldSize: number;
    tablesActive: number;
  };
  blindLevels: BlindLevel[];
  tables: LiveTable[];
  eliminations: LiveElimination[];
  checkinList: CheckinEntry[];
  chipLeader: ChipLeader | null;
  /** place -> amount; JSON round-trips object keys as strings. */
  payoutPreview: Record<string, number>;
  announcement: BoardAnnouncement | null;
  winner: { nickname: string } | null;
  board: BoardInfo | null;
}
