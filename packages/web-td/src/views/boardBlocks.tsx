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
  "club-name": "Название клуба",
  "club-logo": "Логотип клуба",
};

function avgStack(state: LiveState): number {
  return state.counts.active > 0
    ? Math.round((state.tournament.startingStack * state.counts.fieldSize) / state.counts.active)
    : 0;
}

// A TD-chosen fontSize is "px at a 1920px-wide reference board" — converted to
// cqw so it scales the same way between the small boxed editor preview and
// the real fullscreen TV instead of rendering as a fixed, context-blind size.
function customFontSize(px: number): string {
  return `clamp(8px, ${((px / 1920) * 100).toFixed(3)}cqw, 400px)`;
}

// Seed value the inspector's slider starts from before a TD has picked their
// own size — roughly each block's current default at the reference width.
export const DEFAULT_FONT_SIZE: Partial<Record<BoardBlockType, number>> = {
  "stats-players": 42,
  "stats-tables": 42,
  "stats-avg-stack": 42,
  "chip-leader": 42,
  "payout-preview": 18,
  "knockout-ticker": 16,
  "tables-seats": 14,
  "participants-list": 15,
  "blind-structure": 15,
  "custom-text": 32,
  "club-name": 28,
};

export type ClockProgressStyle = "bar" | "thick" | "ring";

export const PROGRESS_STYLE_OPTIONS: { id: ClockProgressStyle; label: string }[] = [
  { id: "bar", label: "Линия" },
  { id: "thick", label: "Толстая" },
  { id: "ring", label: "Кольцо" },
];

export const FONT_WEIGHT_OPTIONS: { id: 500 | 700 | 800; label: string }[] = [
  { id: 500, label: "Обычный" },
  { id: 700, label: "Полужирный" },
  { id: 800, label: "Жирный" },
];

export const FONT_FAMILY_OPTIONS: { id: string; label: string }[] = [
  { id: "", label: "По умолчанию" },
  { id: "'Roboto', sans-serif", label: "Roboto" },
  { id: "'Montserrat', sans-serif", label: "Montserrat" },
  { id: "'Playfair Display', serif", label: "Playfair Display" },
];

// A block's TD-chosen style overrides, applied over each block's own default
// look. Omitted fields fall through to that block's normal styling below.
function textStyleOverrides(block: BoardBlockConfig): React.CSSProperties {
  return {
    ...(block.fontWeight ? { fontWeight: block.fontWeight } : {}),
    ...(block.fontFamily ? { fontFamily: block.fontFamily } : {}),
    ...(block.color ? { color: block.color } : {}),
    ...(block.italic ? { fontStyle: "italic" } : {}),
  };
}

function Stat({
  value,
  label,
  fontSize,
  textStyle,
}: {
  value: number | string;
  label: string;
  fontSize?: number;
  textStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          fontSize: fontSize ? customFontSize(fontSize) : "clamp(20px, 4cqw, 42px)",
          fontWeight: 800,
          ...textStyle,
        }}
      >
        {value}
      </div>
      <div style={{ fontSize: "clamp(9px, 1.4cqw, 16px)", color: "#8b98ab", textTransform: "uppercase", letterSpacing: 1 }}>
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
// Sized in cqw (container query width), not plain viewport-width units: ClockDisplay is fullscreen
// (so its container happens to equal the viewport), but BoardSettings's
// editor renders these same blocks inside a small boxed preview — cqw scales
// relative to that box (given container-type:size on the block's ancestor)
// so the preview matches the real board instead of rendering illegibly tiny.
export function ClockBlock({
  state,
  accent,
  progressStyle = "bar",
}: {
  state: LiveState;
  accent: string;
  progressStyle?: ClockProgressStyle;
}) {
  const elapsed = useTickingElapsed(state.clock);
  const level = state.clock?.level;
  const remaining = level ? level.durationMinutes * 60 - elapsed : 0;
  const totalSeconds = level ? level.durationMinutes * 60 : 0;
  const urgent = level && !level.isBreak && remaining <= 30;
  const barColor = urgent ? "#ff6b6b" : accent;
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(100, (remaining / totalSeconds) * 100)) : 0;

  if (!state.clock) {
    return <div style={{ fontSize: "clamp(16px, 2.5cqw, 28px)", color: "#8b98ab" }}>Ожидание старта турнира…</div>;
  }

  const breakBadge = level?.isBreak && (
    <div
      style={{
        display: "inline-block",
        fontSize: "clamp(12px, 1.8cqw, 22px)",
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
  );

  const digits = (
    <div
      style={{
        fontSize: progressStyle === "ring" ? "clamp(28px, 7cqw, 110px)" : "clamp(40px, 9cqw, 160px)",
        fontWeight: 800,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
        color: urgent ? "#ff6b6b" : "#f2f3f5",
      }}
    >
      {formatMMSS(Math.max(0, remaining))}
    </div>
  );

  const blindsLine = level && !level.isBreak && (
    <div style={{ fontSize: "clamp(18px, 3.5cqw, 56px)", fontWeight: 700, marginTop: "0.4em" }}>
      {level.smallBlind} / {level.bigBlind}
      {level.ante > 0 && <span style={{ color: "#8b98ab", fontSize: "0.6em" }}> · ante {level.ante}</span>}
    </div>
  );

  const nextLine = state.clock.nextLevel && (
    <div style={{ fontSize: "clamp(10px, 1.3cqw, 20px)", color: "#8b98ab", marginTop: "0.5em" }}>
      Следующий:{" "}
      {state.clock.nextLevel.isBreak
        ? "перерыв"
        : `${state.clock.nextLevel.smallBlind} / ${state.clock.nextLevel.bigBlind}`}
    </div>
  );

  if (progressStyle === "ring") {
    const strokeWidth = 6;
    const radius = 50 - strokeWidth / 2 - 1;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference * (1 - pct / 100);
    return (
      <div style={{ width: "100%", textAlign: "center" }}>
        {breakBadge}
        <div style={{ position: "relative", width: "clamp(140px, 32cqh, 420px)", height: "clamp(140px, 32cqh, 420px)", margin: "0 auto" }}>
          <svg
            viewBox="0 0 100 100"
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", transform: "rotate(-90deg)" }}
          >
            <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} />
            {totalSeconds > 0 && (
              <circle
                cx="50"
                cy="50"
                r={radius}
                fill="none"
                stroke={barColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
              />
            )}
          </svg>
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {digits}
          </div>
        </div>
        {blindsLine}
        {nextLine}
      </div>
    );
  }

  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      {breakBadge}
      {digits}
      {totalSeconds > 0 && (
        <div
          style={{
            width: "80%",
            maxWidth: 500,
            height: progressStyle === "thick" ? "clamp(10px, 1.6cqw, 22px)" : "clamp(4px, 0.8cqw, 8px)",
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
              width: `${pct}%`,
              background: progressStyle === "thick" ? `linear-gradient(90deg, ${barColor}cc, ${barColor})` : barColor,
              boxShadow: progressStyle === "thick" ? `0 0 12px ${barColor}` : undefined,
              transition: "width 1s linear",
            }}
          />
        </div>
      )}
      {blindsLine}
      {nextLine}
    </div>
  );
}

export function renderBoardBlock(block: BoardBlockConfig, state: LiveState, accent: string): React.ReactNode {
  switch (block.type) {
    case "stats-players":
      return <Stat value={state.counts.active} label="игроков" fontSize={block.fontSize} textStyle={textStyleOverrides(block)} />;

    case "stats-tables":
      return <Stat value={state.counts.tablesActive} label="столов" fontSize={block.fontSize} textStyle={textStyleOverrides(block)} />;

    case "stats-avg-stack":
      return (
        <Stat
          value={avgStack(state).toLocaleString("ru-RU")}
          label="средний стек"
          fontSize={block.fontSize}
          textStyle={textStyleOverrides(block)}
        />
      );

    case "chip-leader":
      if (!state.chipLeader) return null;
      return (
        <Stat
          value={state.chipLeader.stack.toLocaleString("ru-RU")}
          label={`лидер: ${state.chipLeader.nickname}`}
          fontSize={block.fontSize}
          textStyle={textStyleOverrides(block)}
        />
      );

    case "custom-text":
      return (
        <div
          style={{
            fontSize: customFontSize(block.fontSize ?? 32),
            fontWeight: 700,
            color: "#f2f3f5",
            textAlign: "center",
            overflow: "hidden",
            width: "100%",
            ...textStyleOverrides(block),
          }}
        >
          {block.text ?? ""}
        </div>
      );

    case "club-name":
      if (!state.board?.clubName) return null;
      return (
        <div
          style={{
            fontSize: block.fontSize ? customFontSize(block.fontSize) : "clamp(14px, 2.2cqw, 28px)",
            fontWeight: 700,
            color: accent,
            textAlign: "center",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            width: "100%",
            ...textStyleOverrides(block),
          }}
        >
          {state.board.clubName}
        </div>
      );

    case "club-logo":
      if (!state.board?.logoUrl) return null;
      return (
        <img
          src={state.board.logoUrl}
          alt=""
          style={{ width: "100%", height: "100%", objectFit: "contain", borderRadius: 10 }}
        />
      );

    case "payout-preview": {
      const entries = Object.entries(state.payoutPreview)
        .map(([place, amount]) => ({ place: Number(place), amount }))
        .sort((a, b) => a.place - b.place);
      if (!entries.length) return null;
      return (
        <div style={blockStyles.payoutStrip}>
          {entries.map((p) => (
            <div
              key={p.place}
              style={{
                ...blockStyles.payoutItem,
                ...(block.fontSize ? { fontSize: customFontSize(block.fontSize) } : {}),
                ...textStyleOverrides(block),
              }}
            >
              <span style={blockStyles.payoutPlace}>{p.place}.</span> {p.amount.toLocaleString("ru-RU")} ₽
            </div>
          ))}
        </div>
      );
    }

    case "knockout-ticker":
      if (!state.eliminations.length) return null;
      return (
        <div
          style={{
            ...blockStyles.ticker,
            ...(block.fontSize ? { fontSize: customFontSize(block.fontSize) } : {}),
            ...textStyleOverrides(block),
          }}
        >
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
                <div
                  key={s.seatNo ?? s.playerId}
                  style={{
                    ...blockStyles.seatRow,
                    ...(block.fontSize ? { fontSize: customFontSize(block.fontSize) } : {}),
                    ...textStyleOverrides(block),
                  }}
                >
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
            <div
              key={p.playerId}
              style={{
                ...blockStyles.participantRow,
                ...(block.fontSize ? { fontSize: customFontSize(block.fontSize) } : {}),
                ...textStyleOverrides(block),
              }}
            >
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
                ...(block.fontSize ? { fontSize: customFontSize(block.fontSize) } : {}),
                ...textStyleOverrides(block),
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
  payoutStrip: { display: "flex", gap: "1cqw", flexWrap: "wrap" as const, justifyContent: "center", width: "100%" },
  payoutItem: {
    fontSize: "clamp(10px, 1.3cqw, 18px)",
    color: "#8b98ab",
    background: "rgba(255,255,255,0.05)",
    padding: "0.4em 0.8em",
    borderRadius: 10,
  },
  payoutPlace: { color: "#f2f3f5", fontWeight: 700 },
  ticker: {
    display: "flex",
    gap: "1.2cqw",
    color: "#8b98ab",
    fontSize: "clamp(9px, 1.1cqw, 16px)",
    flexWrap: "wrap" as const,
    justifyContent: "center",
    width: "100%",
  },
  tickerItem: { opacity: 0.85 },
  tablesGrid: {
    display: "flex",
    gap: "1cqw",
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
  tableTitle: { fontSize: "clamp(10px, 1.3cqw, 16px)", fontWeight: 800, marginBottom: "0.4em", textTransform: "uppercase" as const },
  seatRow: { display: "flex", gap: "0.6em", fontSize: "clamp(9px, 1.1cqw, 14px)", color: "#d6dce3", padding: "0.15em 0" },
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
    fontSize: "clamp(9px, 1.2cqw, 15px)",
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
    fontSize: "clamp(9px, 1.2cqw, 15px)",
    color: "#d6dce3",
    padding: "0.2em 0.6em",
  },
};
