import type { TournamentDetail } from "./types.js";

// Module-scope (not React state) so it survives across TournamentDetail's
// mount/unmount — it opens fresh every time a tournament is tapped. Populated
// by Tournaments.tsx right after the list loads, so opening a tournament
// shows its participants immediately instead of a "Загрузка…" flash while
// TournamentDetail's own fetch is still in flight.
const cache = new Map<string, TournamentDetail>();

export function getCachedTournamentDetail(id: string): TournamentDetail | null {
  return cache.get(id) ?? null;
}

export function setCachedTournamentDetail(detail: TournamentDetail) {
  cache.set(detail.id, detail);
}
