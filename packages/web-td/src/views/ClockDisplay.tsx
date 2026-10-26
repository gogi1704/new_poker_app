import { useEffect, useRef } from "react";
import { useLiveState } from "../lib/useLiveState.js";
import { useTickingElapsed } from "../lib/useTickingElapsed.js";
import { formatMMSS } from "../lib/format.js";

/**
 * Public, read-only — meant to be opened full-screen on a club TV/monitor.
 * No Telegram auth: it's just a URL a staff member points a browser at.
 * This is the "tournament player" for the live, in-person event: everything
 * here is meant to be readable from across a room, not just a status widget.
 */
export default function ClockDisplay({ tournamentId }: { tournamentId: string }) {
  const { state, connected } = useLiveState(tournamentId);
  const elapsed = useTickingElapsed(state?.clock ?? null);
  const prevLevelRef = useRef<number | null>(null);

  const level = state?.clock?.level;
  const remaining = level ? level.durationMinutes * 60 - elapsed : 0;
  const totalSeconds = level ? level.durationMinutes * 60 : 0;
  const urgent = level && !level.isBreak && remaining <= 30;

  // Chime + flash whenever the level actually changes (covers both a blind
  // bump and a break starting/ending, since a break is just a level row with
  // isBreak=true in the same sequence) — not on every render.
  useEffect(() => {
    const current = state?.clock?.levelNumber ?? null;
    if (current !== null && prevLevelRef.current !== null && current !== prevLevelRef.current) {
      playChime();
    }
    prevLevelRef.current = current;
  }, [state?.clock?.levelNumber]);

  if (!state) {
    return (
      <div style={styles.wrap}>
        <div style={styles.loading}>Подключение…</div>
      </div>
    );
  }

  const avgStack =
    state.counts.active > 0
      ? Math.round((state.tournament.startingStack * state.counts.fieldSize) / state.counts.active)
      : 0;
  const payoutEntries = Object.entries(state.payoutPreview)
    .map(([place, amount]) => ({ place: Number(place), amount }))
    .sort((a, b) => a.place - b.place);

  return (
    <div style={styles.wrap}>
      <style>{keyframes}</style>
      <div style={styles.connDot(connected)} />
      <div style={styles.name}>{state.tournament.name}</div>

      {state.announcement && (
        <div style={styles.announcement} key={state.announcement.text}>
          📢 {state.announcement.text}
        </div>
      )}

      {!state.clock && <div style={styles.waiting}>Ожидание старта турнира…</div>}

      {state.clock && (
        <>
          {level?.isBreak && <div style={styles.breakBadge}>ПЕРЕРЫВ</div>}
          <div style={{ ...styles.clock, ...(urgent ? { animation: "pulseRed 1s infinite" } : {}) }}>
            {formatMMSS(remaining)}
          </div>

          {totalSeconds > 0 && (
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${Math.max(0, Math.min(100, (remaining / totalSeconds) * 100))}%`,
                  background: urgent ? "#ff6b6b" : "#4da3ff",
                }}
              />
            </div>
          )}

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

          {payoutEntries.length > 0 && (
            <div style={styles.payoutStrip}>
              {payoutEntries.map((p) => (
                <div key={p.place} style={styles.payoutItem}>
                  <span style={styles.payoutPlace}>{p.place}.</span> {p.amount.toLocaleString("ru-RU")} ₽
                </div>
              ))}
            </div>
          )}

          {state.eliminations.length > 0 && (
            <div style={styles.ticker}>
              {state.eliminations.slice(0, 5).map((e) => (
                <span key={`${e.playerId}-${e.at}`} style={styles.tickerItem}>
                  {e.place}. {e.nickname}
                </span>
              ))}
            </div>
          )}
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

let audioCtx: AudioContext | null = null;
function playChime() {
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
      osc.start(start);
      osc.stop(start + 0.32);
    });
  } catch {
    // Autoplay-restricted or unsupported — silent is fine, the visual flash still happens.
  }
}

const keyframes = `
@keyframes pulseRed { 0%, 100% { color: #f2f3f5; } 50% { color: #ff6b6b; } }
@keyframes slideDown { from { transform: translateY(-100%); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
`;

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
  announcement: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    background: "#4da3ff",
    color: "#0b0f14",
    fontSize: 24,
    fontWeight: 700,
    padding: "16px 24px",
    animation: "slideDown 0.4s ease-out",
  },
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
  progressTrack: {
    width: 500,
    maxWidth: "80vw",
    height: 8,
    borderRadius: 999,
    background: "rgba(255,255,255,0.1)",
    marginTop: 20,
    overflow: "hidden" as const,
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    transition: "width 1s linear",
  },
  blinds: { fontSize: 56, fontWeight: 700, marginTop: 20 },
  ante: { color: "#8b98ab", fontSize: 32 },
  next: { fontSize: 20, color: "#8b98ab", marginTop: 16 },
  statsRow: { display: "flex", gap: 60, marginTop: 60, flexWrap: "wrap" as const, justifyContent: "center" },
  payoutStrip: { display: "flex", gap: 20, marginTop: 40, flexWrap: "wrap" as const, justifyContent: "center" },
  payoutItem: {
    fontSize: 18,
    color: "#8b98ab",
    background: "rgba(255,255,255,0.05)",
    padding: "8px 16px",
    borderRadius: 10,
  },
  payoutPlace: { color: "#f2f3f5", fontWeight: 700 },
  ticker: { marginTop: 30, display: "flex", gap: 24, color: "#8b98ab", fontSize: 16, flexWrap: "wrap" as const, justifyContent: "center" },
  tickerItem: { opacity: 0.85 },
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
