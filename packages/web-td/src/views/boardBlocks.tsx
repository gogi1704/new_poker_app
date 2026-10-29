import type { LiveState, BoardBlockConfig, BoardBlockType } from "../lib/liveTypes.js";
import { useTickingElapsed } from "../lib/useTickingElapsed.js";
import { formatMMSS } from "../lib/format.js";

export const BLOCK_LABELS: Record<BoardBlockType, string> = {
  clock: "Часы и уровень",
  "stats-players": "Игроков в поле",
  "stats-tables": "Активных столов",
  "stats-avg-stack": "Средний стек",
  "chip-leader": "Лидер по фишкам",
  "payout-preview": "Превью выплат",
  "knockout-ticker": "Лента выбывших",
  "tables-seats": "Столы и места",
  "participants-list": "Список участников",
  "blind-structure": "Структура блайндов",
  "custom-text": "Своя надпись",
};

function avgStack(state: LiveState): number {
  return state.counts.active > 0
    ? Math.round((state.tournament.startingStack * state.counts.fieldSize) / state.counts.active)
    : 0;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: "clamp(20px, 4vw, 42px)", fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: "clamp(9px, 1.4vw, 16px)", color: "#8b98ab", textTransform: "uppercase", letterSpacing: 1 }}>
        {label}
      </div>
    </div>
  );
}

/**
 * The timer itself — a regular block like everything else, just split out
 * as its own component (not a case in renderBoardBlock) because it needs
 * useTickingElapsed, which only a real component can call.
 */
export function ClockBlock({ state, accent }: { state: LiveState; accent: string }) {
  const elapsed = useTickingElapsed(state.clock);
  const level = state.clock?.level;
  const remaining = level ? level.durationMinutes * 60 - elapsed : 0;
  const totalSeconds = level ? level.durationMinutes * 60 : 0;
  const urgent = level && !level.isBreak && remaining <= 30;

  if (!state.clock) {
    return <div style={{ fontSize: "clamp(16px, 2.5vw, 28px)", color: "#8b98ab" }}>Ожидание старта турнира…</div>;
  }

  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      {level?.isBreak && (
        <div
          style={{
            display: "inline-block",
            fontSize: "clamp(12px, 1.8vw, 22px)",
            fontWeight: 800,
            background: `${accent}26`,
            color: accent,
            padding: "0.4em 1em",
            borderRadius: 999,
            marginBottom: "0.5em",
          }}
        >
          ПЕРЕРЫВ
        </div>
      )}
      <div
        style={{
          fontSize: "clamp(40px, 9vw, 160px)",
          fontWeight: 800,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1,
          color: urgent ? "#ff6b6b" : "#f2f3f5",
        }}
      >
        {formatMMSS(Math.max(0, remaining))}
      </div>
      {totalSeconds > 0 && (
        <div
          style={{
            width: "80%",
            maxWidth: 500,
            height: "clamp(4px, 0.8vw, 8px)",
            borderRadius: 999,
            background: "rgba(255,255,255,0.1)",
            margin: "0.6em auto 0",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 999,
              width: `${Math.max(0, Math.min(100, (remaining / totalSeconds) * 100))}%`,
              background: urgent ? "#ff6b6b" : accent,
              transition: "width 1s linear",
            }}
          />
        </div>
      )}
      {level && !level.isBreak && (
        <div style={{ fontSize: "clamp(18px, 3.5vw, 56px)", fontWeight: 700, marginTop: "0.4em" }}>
          {level.smallBlind} / {level.bigBlind}
          {level.ante > 0 && (
            <span style={{ color: "#8b98ab", fontSize: "0.6em" }}> · ante {level.ante}</span>
          )}
        </div>
      )}
      {state.clock.nextLevel && (
        <div style={{ fontSize: "clamp(10px, 1.3vw, 20px)", color: "#8b98ab", marginTop: "0.5em" }}>
          Следующий:{" "}
          {state.clock.nextLevel.isBreak
            ? "перерыв"
            : `${state.clock.nextLevel.smallBlind} / ${state.clock.nextLevel.bigBlind}`}
        </div>
      )}
    </div>
  );
}

export function renderBoardBlock(block: BoardBlockConfig, state: LiveState, accent: string): React.ReactNode {
  switch (block.type) {
    case "stats-players":
      return <Stat value={state.counts.active} label="игроков" />;

    case "stats-tables":
      return <Stat value={state.counts.tablesActive} label="столов" />;

    case "stats-avg-stack":
      return <Stat value={avgStack(state).toLocaleString("ru-RU")} label="средний стек" />;

    case "chip-leader":
      if (!state.chipLeader) return null;
      return (
        <Stat value={state.chipLeader.stack.toLocaleString("ru-RU")} label={`лидер: ${state.chipLeader.nickname}`} />
      );

    case "custom-text":
      return (
        <div
          style={{
            fontSize: block.fontSize ?? 24,
            fontWeight: 700,
            color: "#f2f3f5",
            textAlign: "center",
            overflow: "hidden",
            width: "100%",
          }}
        >
          {block.text ?? ""}
        </div>
      );

    case "payout-preview": {
      const entries = Object.entries(state.payoutPreview)
        .map(([place, amount]) => ({ place: Number(place), amount }))
        .sort((a, b) => a.place - b.place);
      if (!entries.length) return null;
      return (
        <div style={blockStyles.payoutStrip}>
          {entries.map((p) => (
            <div key={p.place} style={blockStyles.payoutItem}>
              <span style={blockStyles.payoutPlace}>{p.place}.</span> {p.amount.toLocaleString("ru-RU")} ₽
            </div>
          ))}
        </div>
      );
    }

    case "knockout-ticker":
      if (!state.eliminations.length) return null;
      return (
        <div style={blockStyles.ticker}>
          {state.eliminations.slice(0, 5).map((e) => (
            <span key={`${e.playerId}-${e.at}`} style={blockStyles.tickerItem}>
              {e.place}. {e.nickname}
            </span>
          ))}
        </div>
      );

    case "tables-seats":
      if (!state.tables.length) return null;
      return (
        <div style={blockStyles.tablesGrid}>
          {state.tables.map((t) => (
            <div key={t.tableNo} style={blockStyles.tableCard}>
              <div style={{ ...blockStyles.tableTitle, color: accent }}>Стол {t.tableNo}</div>
              {t.seats.map((s) => (
                <div key={s.seatNo ?? s.playerId} style={blockStyles.seatRow}>
                  <span style={blockStyles.seatNo}>{s.seatNo ?? "—"}</span>
                  <span style={blockStyles.seatName}>{s.nickname}</span>
                  <span style={blockStyles.seatStack}>{s.currentStack?.toLocaleString("ru-RU") ?? "—"}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      );

    case "participants-list": {
      const all = state.tables.flatMap((t) => t.seats.map((s) => ({ ...s, tableNo: t.tableNo })));
      if (!all.length) return null;
      const sorted = [...all].sort((a, b) => (b.currentStack ?? 0) - (a.currentStack ?? 0));
      return (
        <div style={blockStyles.participantsList}>
          {sorted.map((p) => (
            <div key={p.playerId} style={blockStyles.participantRow}>
              <span style={blockStyles.participantName}>{p.nickname}</span>
              <span style={blockStyles.participantTable}>стол {p.tableNo}</span>
              <span style={blockStyles.participantStack}>{p.currentStack?.toLocaleString("ru-RU") ?? "—"}</span>
            </div>
          ))}
        </div>
      );
    }

    case "blind-structure": {
      const current = state.clock?.levelNumber;
      const upcoming = state.blindLevels.filter((l) => l.levelNumber >= (current ?? 0)).slice(0, 6);
      if (!upcoming.length) return null;
      return (
        <div style={blockStyles.blindTable}>
          {upcoming.map((l) => (
            <div
              key={l.levelNumber}
              style={{
                ...blockStyles.blindRow,
                ...(l.levelNumber === current ? { color: accent, fontWeight: 800 } : {}),
              }}
            >
              <span>{l.levelNumber}</span>
              <span>{l.isBreak ? "Перерыв" : `${l.smallBlind}/${l.bigBlind}`}</span>
              <span>{l.durationMinutes}м</span>
            </div>
          ))}
        </div>
      );
    }

    default:
      return null;
  }
}

const blockStyles = {
  payoutStrip: { display: "flex", gap: "1vw", flexWrap: "wrap" as const, justifyContent: "center", width: "100%" },
  payoutItem: {
    fontSize: "clamp(10px, 1.3vw, 18px)",
    color: "#8b98ab",
    background: "rgba(255,255,255,0.05)",
    padding: "0.4em 0.8em",
    borderRadius: 10,
  },
  payoutPlace: { color: "#f2f3f5", fontWeight: 700 },
  ticker: {
    display: "flex",
    gap: "1.2vw",
    color: "#8b98ab",
    fontSize: "clamp(9px, 1.1vw, 16px)",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    width: "100%",
  },
  tickerItem: { opacity: 0.85 },
  tablesGrid: {
    display: "flex",
    gap: "1vw",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    width: "100%",
    height: "100%",
    overflow: "auto" as const,
  },
  tableCard: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: "0.6em 0.9em",
    minWidth: 120,
    textAlign: "left" as const,
  },
  tableTitle: { fontSize: "clamp(10px, 1.3vw, 16px)", fontWeight: 800, marginBottom: "0.4em", textTransform: "uppercase" as const },
  seatRow: { display: "flex", gap: "0.6em", fontSize: "clamp(9px, 1.1vw, 14px)", color: "#d6dce3", padding: "0.15em 0" },
  seatNo: { color: "#8b98ab", width: 16, flexShrink: 0 },
  seatName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  seatStack: { color: "#8b98ab" },
  participantsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.4em",
    width: "100%",
    height: "100%",
    overflow: "auto" as const,
    textAlign: "left" as const,
  },
  participantRow: {
    display: "flex",
    gap: "0.8em",
    fontSize: "clamp(9px, 1.2vw, 15px)",
    color: "#d6dce3",
    background: "rgba(255,255,255,0.03)",
    padding: "0.3em 0.7em",
    borderRadius: 8,
  },
  participantName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  participantTable: { color: "#8b98ab", fontSize: "0.85em" },
  participantStack: { color: "#8b98ab", fontWeight: 700 },
  blindTable: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "0.2em",
    width: "100%",
    height: "100%",
    overflow: "auto" as const,
  },
  blindRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "clamp(9px, 1.2vw, 15px)",
    color: "#d6dce3",
    padding: "0.2em 0.6em",
  },
};
