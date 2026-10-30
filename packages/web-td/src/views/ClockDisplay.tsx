import { useEffect, useRef } from "react";
import { useLiveState } from "../lib/useLiveState.js";
import { renderBoardBlock, ClockBlock } from "./boardBlocks.js";

/**
 * Public, read-only — meant to be opened full-screen on a club TV/monitor.
 * No Telegram auth: it's just a URL a staff member points a browser at.
 * This is the "tournament player" for the live, in-person event: everything
 * here is meant to be readable from across a room, not just a status widget.
 * The layout is a freeform canvas (see BoardSettings) — every block,
 * including the clock itself, is positioned by x/y/width/height percentages
 * of this component's own full-viewport box, so it reflows sensibly on
 * whatever screen it actually ends up on.
 */
export default function ClockDisplay({ tournamentId }: { tournamentId: string }) {
  const { state, connected } = useLiveState(tournamentId);
  const prevLevelRef = useRef<number | null>(null);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.clock?.levelNumber]);

  const celebratedRef = useRef(false);
  useEffect(() => {
    if (finished && !celebratedRef.current) {
      celebratedRef.current = true;
      chime();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <div style={{ fontSize: "clamp(14px, 2vw, 24px)", fontWeight: 700 }}>{state.tournament.name}</div>
        <div style={styles.trophy}>🏆</div>
        <div style={styles.finishedTitle}>Турнир завершён!</div>
        {state.winner && <div style={styles.winnerName}>Победитель: {state.winner.nickname}</div>}
      </div>
    );
  }

  const layout = settings?.layout ?? [];
  const canvasStyle = settings?.backgroundUrl
    ? { ...styles.canvas, backgroundImage: `url(${settings.backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : styles.canvas;

  return (
    <div style={canvasStyle}>
      <style>{keyframes}</style>
      <div style={styles.connDot(connected)} />

      {state.announcement && (
        <div style={{ ...styles.announcement, background: accent }} key={state.announcement.text}>
          📢 {state.announcement.text}
        </div>
      )}

      {layout.map((block) => (
        <div
          key={block.id}
          style={{
            position: "absolute",
            left: `${block.x}%`,
            top: `${block.y}%`,
            width: `${block.width}%`,
            height: `${block.height}%`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {block.type === "clock" ? <ClockBlock state={state} accent={accent} /> : renderBoardBlock(block, state, accent)}
        </div>
      ))}
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
  canvas: {
    position: "relative" as const,
    width: "100vw",
    height: "100vh",
    overflow: "hidden" as const,
    background: "#0b0f14",
    color: "#f2f3f5",
    fontFamily: "'Roboto Condensed', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    containerType: "size" as const,
  },
  loading: { fontSize: 24, color: "#8b98ab" },
  trophy: { fontSize: 140, marginTop: 20, animation: "popIn 0.6s ease-out" },
  finishedTitle: { fontSize: 44, fontWeight: 800, marginTop: 10 },
  winnerName: { fontSize: 32, color: "#c9a46a", fontWeight: 700, marginTop: 20 },
  announcement: {
    position: "fixed" as const,
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    background: "#4da3ff",
    color: "#0b0f14",
    fontSize: 24,
    fontWeight: 700,
    padding: "16px 24px",
    animation: "slideDown 0.4s ease-out",
  },
  connDot: (connected: boolean) => ({
    position: "fixed" as const,
    top: 20,
    right: 20,
    zIndex: 10,
    width: 12,
    height: 12,
    borderRadius: "50%",
    background: connected ? "#4ade80" : "#ff6b6b",
  }),
};
