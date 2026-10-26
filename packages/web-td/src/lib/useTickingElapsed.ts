import { useEffect, useState } from "react";
import type { LiveClock } from "./liveTypes.js";

/** Ticks the clock's elapsedSeconds forward locally between SSE pushes, server stays the source of truth. */
export function useTickingElapsed(clock: LiveClock | null): number {
  const [elapsed, setElapsed] = useState(clock?.elapsedSeconds ?? 0);

  useEffect(() => {
    if (!clock) return;
    const baseElapsed = clock.elapsedSeconds;
    const baseAt = new Date(clock.asOf).getTime();
    setElapsed(baseElapsed);

    if (clock.isPaused) return;
    const id = setInterval(() => {
      setElapsed(baseElapsed + (Date.now() - baseAt) / 1000);
    }, 1000);
    return () => clearInterval(id);
  }, [clock]);

  return elapsed;
}
