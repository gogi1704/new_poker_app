import type { LiveState, BoardBlockType } from "../lib/liveTypes.js";

export const BLOCK_LABELS: Record<BoardBlockType, string> = {
  "stats-players": "Игроков в поле",
  "stats-tables": "Активных столов",
  "stats-avg-stack": "Средний стек",
  "chip-leader": "Лидер по фишкам",
  "payout-preview": "Превью выплат",
  "knockout-ticker": "Лента выбывших",
  "tables-seats": "Столы и места",
  "participants-list": "Список участников",
  "blind-structure": "Структура блайндов",
};

function avgStack(state: LiveState): number {
  return state.counts.active > 0
    ? Math.round((state.tournament.startingStack * state.counts.fieldSize) / state.counts.active)
    : 0;
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 42, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 16, color: "#8b98ab", textTransform: "uppercase", letterSpacing: 1 }}>{label}</div>
    </div>
  );
}

export function renderBoardBlock(type: BoardBlockType, state: LiveState, accent: string): React.ReactNode {
  switch (type) {
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
  payoutStrip: { display: "flex", gap: 20, flexWrap: "wrap" as const, justifyContent: "center" },
  payoutItem: {
    fontSize: 18,
    color: "#8b98ab",
    background: "rgba(255,255,255,0.05)",
    padding: "8px 16px",
    borderRadius: 10,
  },
  payoutPlace: { color: "#f2f3f5", fontWeight: 700 },
  ticker: { display: "flex", gap: 24, color: "#8b98ab", fontSize: 16, flexWrap: "wrap" as const, justifyContent: "center" },
  tickerItem: { opacity: 0.85 },
  tablesGrid: {
    display: "flex",
    gap: 16,
    flexWrap: "wrap" as const,
    justifyContent: "center",
    width: "100%",
  },
  tableCard: {
    background: "rgba(255,255,255,0.04)",
    borderRadius: 12,
    padding: "12px 16px",
    minWidth: 160,
    textAlign: "left" as const,
  },
  tableTitle: { fontSize: 16, fontWeight: 800, marginBottom: 8, textTransform: "uppercase" as const },
  seatRow: { display: "flex", gap: 10, fontSize: 14, color: "#d6dce3", padding: "3px 0" },
  seatNo: { color: "#8b98ab", width: 18, flexShrink: 0 },
  seatName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  seatStack: { color: "#8b98ab" },
  participantsList: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 6,
    width: "100%",
    maxWidth: 420,
    margin: "0 auto",
    textAlign: "left" as const,
  },
  participantRow: {
    display: "flex",
    gap: 12,
    fontSize: 15,
    color: "#d6dce3",
    background: "rgba(255,255,255,0.03)",
    padding: "6px 12px",
    borderRadius: 8,
  },
  participantName: { flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const },
  participantTable: { color: "#8b98ab", fontSize: 13 },
  participantStack: { color: "#8b98ab", fontWeight: 700 },
  blindTable: {
    display: "flex",
    flexDirection: "column" as const,
    gap: 4,
    width: "100%",
    maxWidth: 320,
    margin: "0 auto",
  },
  blindRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 15,
    color: "#d6dce3",
    padding: "4px 10px",
  },
};
