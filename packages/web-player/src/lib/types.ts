export interface TournamentSummary {
  id: string;
  name: string;
  format: string;
  status: string;
  scheduledAt: string;
  buyIn: string;
  startingStack: number;
  maxSeats: number;
  reentryPrice: string | null;
  rpsFormulaParams: { knockoutPoints: number };
  seatsFilled: number | string;
  isMine: boolean;
}

export interface BlindLevel {
  id: string;
  levelNumber: number;
  smallBlind: number;
  bigBlind: number;
  ante: number;
  durationMinutes: number;
  isBreak: boolean;
}

export interface Participant {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  totalRps: number;
  status: string;
}

export interface TournamentDetail extends TournamentSummary {
  clubId: string;
  lateRegUntilLevel: number | null;
  reentryAllowedUntilLevel: number | null;
  addonPrice: string | null;
  addonStack: number | null;
  addonAvailableLevel: number | null;
  addonMaxCount: number | null;
  arriveBonusStack: number;
  blindLevels: BlindLevel[];
  participants: Participant[];
  myRegistration: { status: string } | null;
}

export interface ResultsListTournament {
  id: string;
  name: string;
  format: string;
  scheduledAt: string;
  buyIn: string;
  playersCount: number;
  winner: { nickname: string; avatarUrl: string | null } | null;
  totalKnockouts: number;
  standings: StandingRow[];
}

export interface ResultsOverview {
  totalTournaments: number;
  totalParticipants: number;
  rpsLeader: { nickname: string; totalRps: number } | null;
  tournaments: ResultsListTournament[];
}

export interface StandingRow {
  place: number;
  rpsAwarded: number;
  knockoutsCount: number;
  bountyPoints: number;
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
}

export interface ClubStandingRow {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  gamesPlayed: number;
  wins: number;
  totalRps: number;
  rank: number;
}

export interface RankTier {
  id: string;
  name: string;
  order: number;
  thresholdType: "rps" | "games";
  thresholdValue: number;
  badgeIcon: string | null;
}

export interface RatingResponse {
  podium: ClubStandingRow[];
  standings: ClubStandingRow[];
  rankTiers: RankTier[];
}

export interface Achievement {
  id: string;
  key: string;
  name: string;
  thresholdType: "cashes" | "rps" | "streak" | "games";
  thresholdValue: number;
  progressValue: number;
  unlocked: boolean;
}

export interface ProfileResponse {
  player: { id: string; nickname: string; avatarUrl: string | null };
  membership: { memberLevel: string; cardId: string } | null;
  stats: {
    gamesPlayed: number;
    wins: number;
    top3Count: number;
    totalRps: number;
    avgPlace: number | null;
    bestPlace: number | null;
    winRate: number;
  };
  rankProgress: {
    current: RankTier | null;
    next: RankTier | null;
    progressPercent: number;
  };
  achievements: Achievement[];
  myTournaments: {
    id: string;
    name: string;
    scheduledAt: string;
    status: string;
    registrationStatus: string;
  }[];
}
