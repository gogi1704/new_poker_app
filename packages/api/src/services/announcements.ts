// A TD announcement is inherently transient (a one-off banner for the public
// board, not a historical record), so it's kept in memory rather than in the
// DB — same "client computes from a timestamp" idea the tournament clock
// itself already uses, just without persistence.
const announcements = new Map<string, { text: string; expiresAt: Date }>();

export function setAnnouncement(tournamentId: string, text: string, durationSeconds: number) {
  announcements.set(tournamentId, { text, expiresAt: new Date(Date.now() + durationSeconds * 1000) });
}

export function getAnnouncement(tournamentId: string) {
  const entry = announcements.get(tournamentId);
  if (!entry) return null;
  if (entry.expiresAt.getTime() <= Date.now()) {
    announcements.delete(tournamentId);
    return null;
  }
  return entry;
}
