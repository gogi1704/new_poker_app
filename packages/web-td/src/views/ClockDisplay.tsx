import { useEffect, useRef } from "react";
import { useLiveState } from "../lib/useLiveState.js";
import { useTickingElapsed } from "../lib/useTickingElapsed.js";
import { formatMMSS } from "../lib/format.js";
import { renderBoardBlock } from "./boardBlocks.js";
import type { BoardBlockConfig, BoardBlockZone, LiveState } from "../lib/liveTypes.js";

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
  const finished = state?.tournament.status === "finished";
  const settings = state?.board?.settings;
  const accent = settings?.accentColor ?? "#8c6a2f";

  function chime() {
    if (settings && !settings.soundEnabled) return;
    playChime(settings?.soundVolume ?? 0.7);
  }

  // Chime + flash whenever the level actually changes (covers both a blind
  // bump and a break starting/ending, since a break is just a level row with
  // isBreak=true in the same sequence) — not on every render.
  useEffect(() => {
    const current = state?.clock?.levelNumber ?? null;
    if (current !== null && prevLevelRef.current !== null && current !== prevLevelRef.current) {
      chime();
    }
    prevLevelRef.current = current;
  }, [state?.clock?.levelNumber]);

  const celebratedRef = useRef(false);
  useEffect(() => {
    if (finished && !celebratedRef.current) {
      celebratedRef.current = true;
      chime();
    }
  }, [finished]);

  if (!state) {
    return (
      <div style={styles.wrap}>
        <div style={styles.loading}>Подключение…</div>
      </div>
    );
  }

  if (finished) {
    return (
      <div style={styles.wrap}>
        <style>{keyframes}</style>
        <div style={styles.name}>{state.tournament.name}</div>
        <div style={styles.trophy}>🏆</div>
        <div style={styles.finishedTitle}>Турнир завершён!</div>
        {state.winner && <div style={styles.winnerName}>Победитель: {state.winner.nickname}</div>}
      </div>
    );
  }

  const layout = settings?.layout ?? [];

  return (
    <div style={styles.wrap}>
      <style>{keyframes}</style>
      <div style={styles.connDot(connected)} />
      {state.board?.logoUrl && <img src={state.board.logoUrl} alt="" style={styles.logo} />}
      <div style={{ ...styles.name, color: accent }}>{state.tournament.name}</div>

      {state.announcement && (
        <div style={{ ...styles.announcement, background: accent }} key={state.announcement.text}>
          📢 {state.announcement.text}
        </div>
      )}

      {!state.clock && <div style={styles.waiting}>Ожидание старта турнира…</div>}

      {state.clock && (
        <>
          {level?.isBreak && (
            <div style={{ ...styles.breakBadge, background: `${accent}26`, color: accent }}>ПЕРЕРЫВ</div>
          )}
          <div style={{ ...styles.clock, ...(urgent ? { animation: "pulseRed 1s infinite" } : {}) }}>
            {formatMMSS(remaining)}
          </div>

          {totalSeconds > 0 && (
            <div style={styles.progressTrack}>
              <div
                style={{
                  ...styles.progressFill,
                  width: `${Math.max(0, Math.min(100, (remaining / totalSeconds) * 100))}%`,
                  background: urgent ? "#ff6b6b" : accent,
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

          <BoardZone zone="top" layout={layout} state={state} accent={accent} />
          <BoardZone zone="center" layout={layout} state={state} accent={accent} />
          <BoardZone zone="bottom" layout={layout} state={state} accent={accent} />
        </>
      )}
    </div>
  );
}

function BoardZone({
  zone,
  layout,
  state,
  accent,
}: {
  zone: BoardBlockZone;
  layout: BoardBlockConfig[];
  state: LiveState;
  accent: string;
}) {
  const blocks = layout.filter((b) => b.zone === zone);
  if (blocks.length === 0) return null;
  return (
    <div style={styles.zoneRow}>
      {blocks.map((b, i) => {
        const content = renderBoardBlock(b.type, state, accent);
        if (!content) return null;
        return (
          <div key={`${b.type}-${i}`} style={{ ...styles.zoneBlock, flexBasis: b.size === 2 ? "100%" : "45%" }}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

let audioCtx: AudioContext | null = null;
function playChime(volume: number) {
  if (volume <= 0) return;
  try {
    audioCtx ??= new AudioContext();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const peak = 0.25 * volume;
    [660, 880].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
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
@keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.15); opacity: 1; } 100% { transform: scale(1); } }
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
    fontFamily: "'Roboto Condensed', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    textAlign: "center" as const,
    padding: 40,
  },
  loading: { fontSize: 24, color: "#8b98ab" },
  waiting: { fontSize: 28, color: "#8b98ab", marginTop: 40 },
  logo: { width: 56, height: 56, borderRadius: 14, objectFit: "cover" as const, marginBottom: 10 },
  trophy: { fontSize: 140, marginTop: 20, animation: "popIn 0.6s ease-out" },
  finishedTitle: { fontSize: 44, fontWeight: 800, marginTop: 10 },
  winnerName: { fontSize: 32, color: "#c9a46a", fontWeight: 700, marginTop: 20 },
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
  zoneRow: {
    display: "flex",
    gap: 24,
    marginTop: 40,
    flexWrap: "wrap" as const,
    justifyContent: "center",
    width: "100%",
    maxWidth: 900,
  },
  zoneBlock: { display: "flex", justifyContent: "center" },
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
