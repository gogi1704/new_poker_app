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
