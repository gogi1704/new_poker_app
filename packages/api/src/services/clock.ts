export interface ClockState {
  currentLevelNumber: number;
  levelStartedAt: Date | null;
  pausedAt: Date | null;
  elapsedPauseSeconds: number;
}

export interface ClockComputed {
  levelNumber: number;
  elapsedSeconds: number;
  isPaused: boolean;
  /** Server timestamp this was computed at — clients resync their local countdown from it. */
  asOf: string;
}

/**
 * Server-authoritative elapsed time within the current level. Clients subtract
 * this from the level's durationMinutes themselves — see docs/PLAN.md's clock
 * design note. Never trust a client-side decrementing counter.
 */
export function computeClock(state: ClockState): ClockComputed {
  const now = Date.now();
  const startedAt = state.levelStartedAt?.getTime() ?? now;
  const referenceTime = state.pausedAt ? state.pausedAt.getTime() : now;
  const elapsedSeconds = Math.max(0, (referenceTime - startedAt) / 1000 - state.elapsedPauseSeconds);

  return {
    levelNumber: state.currentLevelNumber,
    elapsedSeconds,
    isPaused: !!state.pausedAt,
    asOf: new Date(now).toISOString(),
  };
}
