export interface RpsFormulaParams {
  knockoutPoints: number;
}

/**
 * Approximate RPS scoring — not a reverse-engineered reproduction of any
 * specific club's numbers, just a reasonable, tunable default:
 * better placement in a bigger field is worth more, each knockout adds a flat bonus.
 */
export function calculateRps(args: {
  place: number;
  fieldSize: number;
  knockouts: number;
  params: RpsFormulaParams;
}): number {
  const { place, fieldSize, knockouts, params } = args;
  if (fieldSize <= 0) return 0;
  const placementScore = Math.round(100 * (1 - (place - 1) / fieldSize));
  const knockoutScore = knockouts * params.knockoutPoints;
  return Math.max(0, placementScore) + knockoutScore;
}

export interface RankTier {
  name: string;
  order: number;
  thresholdType: "rps" | "games";
  thresholdValue: number;
}

export interface RankProgress {
  current: RankTier | null;
  next: RankTier | null;
  progressPercent: number;
}

/** Tiers must be pre-sorted by `order` ascending. */
export function computeRankProgress(
  tiers: RankTier[],
  stats: { totalRps: number; gamesPlayed: number },
): RankProgress {
  const sorted = [...tiers].sort((a, b) => a.order - b.order);
  const valueFor = (t: RankTier) =>
    t.thresholdType === "rps" ? stats.totalRps : stats.gamesPlayed;

  let current: RankTier | null = null;
  let next: RankTier | null = null;

  for (const tier of sorted) {
    if (valueFor(tier) >= tier.thresholdValue) {
      current = tier;
    } else {
      next = tier;
      break;
    }
  }

  if (!next) {
    return { current, next: null, progressPercent: 100 };
  }

  const floor = current?.thresholdValue ?? 0;
  const ceil = next.thresholdValue;
  const value = valueFor(next);
  const progressPercent =
    ceil === floor ? 100 : Math.min(100, Math.max(0, Math.round(((value - floor) / (ceil - floor)) * 100)));

  return { current, next, progressPercent };
}

export interface AchievementDef {
  key: string;
  name: string;
  thresholdType: "cashes" | "rps" | "streak" | "games";
  thresholdValue: number;
}

export interface AchievementStats {
  cashes: number;
  rps: number;
  streak: number;
  games: number;
}

export function computeAchievementProgress(def: AchievementDef, stats: AchievementStats) {
  const value = stats[def.thresholdType];
  const unlocked = value >= def.thresholdValue;
  return { progressValue: value, unlocked };
}
