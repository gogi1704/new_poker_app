import { EventEmitter } from "node:events";

/**
 * In-process pub/sub, one event stream per tournament. Fine for a single Node
 * process; if the API ever runs multiple instances, swap this for Postgres
 * LISTEN/NOTIFY or Redis pub/sub without changing the call sites below.
 */
const bus = new EventEmitter();
bus.setMaxListeners(0);

export function publishTournamentUpdate(tournamentId: string) {
  bus.emit(tournamentId, Date.now());
}

export function subscribeTournament(tournamentId: string, onUpdate: () => void): () => void {
  bus.on(tournamentId, onUpdate);
  return () => bus.off(tournamentId, onUpdate);
}

// Board settings (layout, accent color, background, fonts, …) live on the
// club row, not on any one tournament, but they're rendered on every open
// /clock/:id stream — which only subscribes to its own tournament's channel.
// Without a separate club-wide event, saving board settings from the TD
// panel would silently not reach a TV that's already open (it'd only catch
// up on its own next tournament-state push, which could be minutes away or
// never if the clock is paused) — looking exactly like "the save didn't
// work" from the floor. One shared event name, fanned out to every stream.
const CLUB_BOARD_EVENT = "__club_board__";

export function publishClubBoardUpdate() {
  bus.emit(CLUB_BOARD_EVENT, Date.now());
}

export function subscribeClubBoard(onUpdate: () => void): () => void {
  bus.on(CLUB_BOARD_EVENT, onUpdate);
  return () => bus.off(CLUB_BOARD_EVENT, onUpdate);
}
