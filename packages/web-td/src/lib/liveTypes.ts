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

export interface BoardSettings {
  showPayoutPreview: boolean;
  showKnockoutTicker: boolean;
  showChipLeader: boolean;
  accentColor: string;
  soundEnabled: boolean;
  soundVolume: number;
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
