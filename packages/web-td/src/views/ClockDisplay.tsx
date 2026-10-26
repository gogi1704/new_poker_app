import { useLiveState } from "../lib/useLiveState.js";
import { useTickingElapsed } from "../lib/useTickingElapsed.js";
import { formatMMSS } from "../lib/format.js";

/**
 * Public, read-only — meant to be opened full-screen on a club TV/monitor.
 * No Telegram auth: it's just a URL a staff member points a browser at.
 */
export default function ClockDisplay({ tournamentId }: { tournamentId: string }) {
  const { state, connected } = useLiveState(tournamentId);
  const elapsed = useTickingElapsed(state?.clock ?? null);

  if (!state) {
    return (
      <div style={styles.wrap}>
        <div style={styles.loading}>Подключение…</div>
      </div>
    );
  }

  const level = state.clock?.level;
  const remaining = level ? level.durationMinutes * 60 - elapsed : 0;
  const avgStack = state.counts.active > 0 ? Math.round((state.tournament.startingStack * state.counts.fieldSize) / state.counts.active) : 0;

  return (
    <div style={styles.wrap}>
      <div style={styles.connDot(connected)} />
      <div style={styles.name}>{state.tournament.name}</div>

      {!state.clock && <div style={styles.waiting}>Ожидание старта турнира…</div>}

      {state.clock && (
        <>
          {level?.isBreak && <div style={styles.breakBadge}>ПЕРЕРЫВ</div>}
          <div style={styles.clock}>{formatMMSS(remaining)}</div>

          {level && !level.isBreak && (
            <div style={styles.blinds}>
              {level.smallBlind} / {level.bigBlind}
              {level.ante > 0 && <span style={styles.ante}> · ante {level.ante}</span>}
            </div>
          )}

          {state.clock.nextLevel && (
            <div style={styles.next}>
              Следующий:{" "}
              {state.clock.nextLevel.isBreak
                ? "перерыв"
                : `${state.clock.nextLevel.smallBlind} / ${state.clock.nextLevel.bigBlind}`}
            </div>
          )}

          <div style={styles.statsRow}>
            <Stat value={state.counts.active} label="игроков" />
            <Stat value={state.counts.tablesActive} label="столов" />
            <Stat value={avgStack.toLocaleString("ru-RU")} label="средний стек" />
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 42, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 16, color: "#8b98ab", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

const styles = {
  wrap: {
    minHeight: "100vh",
    background: "#0b0f14",
    color: "#f2f3f5",
    display: "flex",
    flexDirection: "column" as const,
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    textAlign: "center" as const,
    padding: 40,
  },
  loading: { fontSize: 24, color: "#8b98ab" },
  waiting: { fontSize: 28, color: "#8b98ab", marginTop: 40 },
  name: { fontSize: 28, fontWeight: 700, marginBottom: 20, color: "#4da3ff" },
  breakBadge: {
    fontSize: 22,
    fontWeight: 800,
    background: "rgba(77,163,255,0.15)",
    color: "#4da3ff",
    padding: "8px 24px",
    borderRadius: 999,
    marginBottom: 20,
  },
  clock: {
    fontSize: 160,
    fontWeight: 800,
    fontVariantNumeric: "tabular-nums" as const,
    lineHeight: 1,
  },
  blinds: { fontSize: 56, fontWeight: 700, marginTop: 20 },
  ante: { color: "#8b98ab", fontSize: 32 },
  next: { fontSize: 20, color: "#8b98ab", marginTop: 16 },
  statsRow: { display: "flex", gap: 80, marginTop: 60 },
  connDot: (connected: boolean) => ({
    position: "fixed" as const,
    top: 20,
    right: 20,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: connected ? "#4ade80" : "#ff6b6b",
  }),
};
