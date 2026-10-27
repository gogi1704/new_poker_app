import { useEffect, useRef } from "react";

/**
 * Calls `onActivate` every time `active` flips from false to true, except
 * the very first time — that first load is already handled by the tab's own
 * mount-time fetch (all tabs fetch once immediately on app start so data is
 * ready before the user ever switches to them). Every later return visit to
 * an already-visible-once tab triggers this silent background refresh
 * instead, without touching the tab's existing (already-displayed) state
 * until the new data arrives — no loading flash.
 */
export function useRevalidateOnActive(active: boolean, onActivate: () => void) {
  const seenActive = useRef(false);
  const callbackRef = useRef(onActivate);
  callbackRef.current = onActivate;

  useEffect(() => {
    if (!active) return;
    if (!seenActive.current) {
      seenActive.current = true;
      return;
    }
    callbackRef.current();
  }, [active]);
}
