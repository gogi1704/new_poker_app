export type TournamentFormat = "freezeout" | "reentry" | "knockout" | "reentry_knockout";
export type TournamentStatus = "scheduled" | "registering" | "running" | "paused" | "finished" | "cancelled";

export interface BlindLevel {
  levelNumber: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMinutes: number;
  isBreak: boolean;
}

export interface TournamentListItem {
  id: string;
  name: string;
  format: TournamentFormat;
  status: TournamentStatus;
  scheduledAt: string;
  buyIn: string;
  startingStack: number;
  maxSeats: number;
}

export interface TournamentFull extends TournamentListItem {
  clubId: string;
  lateRegUntilLevel: number | null;
  reentryAllowedUntilLevel: number | null;
  reentryPrice: string | null;
  addonPrice: string | null;
  addonStack: number | null;
  addonAvailableLevel: number | null;
  addonMaxCount: number | null;
  arriveBonusStack: number;
  rpsFormulaParams: { knockoutPoints: number };
  blindLevels: BlindLevel[];
}
