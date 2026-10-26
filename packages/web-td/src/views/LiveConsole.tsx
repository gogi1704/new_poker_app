import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import { useLiveState } from "../lib/useLiveState.js";
import { useTickingElapsed } from "../lib/useTickingElapsed.js";
import { formatMMSS, initials } from "../lib/format.js";
import { confirmDialog } from "../lib/telegram.js";
import QrScanner from "../components/QrScanner.js";
import { X, Tv } from "lucide-react";
import type { LiveState, LiveSeat, LiveTable } from "../lib/liveTypes.js";
import type { BlindLevel } from "../lib/types.js";

export default function LiveConsole({
  tournamentId,
  onClose,
  onPublish,
}: {
  tournamentId: string;
  onClose: () => void;
  onPublish: () => void;
}) {
  const { state, connected } = useLiveState(tournamentId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function action(path: string, body?: unknown) {
    setBusy(true);
    setError(null);
    try {
      await apiPost(`/api/td/tournaments/${tournamentId}${path}`, body ?? {});
      // No local state update needed — the SSE push triggered by the action
      // updates `state` for us.
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  if (!state) return <div className="loading">Подключаемся к турниру…</div>;

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <div>
          <strong>{state.tournament.name}</strong>
          <div className="small muted">{connected ? "🟢 live" : "🟡 переподключение…"}</div>
        </div>
        <div className="row" style={{ gap: 8, width: "auto" }}>
          {state.tournament.status === "running" && (
            <button
              className="btn btn-secondary"
              style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
              onClick={() => window.open(`/clock/${tournamentId}`, "_blank")}
            >
              <Tv size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
              Табло
            </button>
          )}
          <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {(state.tournament.status === "scheduled" || state.tournament.status === "registering") && (
        <CheckinPanel state={state} busy={busy} onAction={action} />
      )}

      {state.tournament.status === "running" && (
        <RunningConsole state={state} busy={busy} onAction={action} onPublish={onPublish} />
      )}

      {(state.tournament.status === "finished" || state.tournament.status === "cancelled") && (
        <div className="empty">Турнир {state.tournament.status === "finished" ? "завершён" : "отменён"}</div>
      )}
    </div>
  );
}

function CheckinPanel({
  state,
  busy,
  onAction,
}: {
  state: LiveState;
  busy: boolean;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  async function handleScan(token: string) {
    setScanning(false);
    setScanError(null);
    try {
      await onAction("/checkin-by-qr", { token });
    } catch (err) {
      setScanError(String((err as Error).message ?? err));
    }
  }

  return (
    <>
      {scanning && <QrScanner onScan={handleScan} onClose={() => setScanning(false)} />}

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row small muted">
          <span>Зарегистрировано: {state.checkinList.length}</span>
          <span>Чек-ин: {state.counts.checkedIn}</span>
        </div>
      </div>

      {scanError && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {scanError}
        </div>
      )}

      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button className="btn btn-secondary" disabled={busy} onClick={() => onAction("/checkin-all")}>
          ✓ Отметить всех
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => setScanning(true)}>
          📷 Сканировать QR
        </button>
      </div>

      <div className="row-list" style={{ marginBottom: 14 }}>
        {state.checkinList.map((p) => (
          <div className="row-item" key={p.playerId}>
            <span>{p.nickname}</span>
            <button
              className={`btn ${p.status === "checked_in" ? "btn-primary" : "btn-secondary"}`}
              style={{ width: "auto", padding: "6px 14px", fontSize: 12 }}
              disabled={busy}
              onClick={() => onAction("/checkin", { playerId: p.playerId, checkedIn: p.status !== "checked_in" })}
            >
              {p.status === "checked_in" ? "✓ Чек-ин" : "Отметить"}
            </button>
          </div>
        ))}
      </div>

      <button
        className="btn btn-primary"
        disabled={busy || state.counts.checkedIn < 2}
        onClick={() => onAction("/start")}
      >
        {state.counts.checkedIn < 2 ? "Нужно ≥2 игроков с чек-ином" : `▶ Начать турнир (${state.counts.checkedIn})`}
      </button>
    </>
  );
}

function RunningConsole({
  state,
  busy,
  onAction,
  onPublish,
}: {
  state: LiveState;
  busy: boolean;
  onAction: (path: string, body?: unknown) => Promise<void>;
  onPublish: () => void;
}) {
  const elapsed = useTickingElapsed(state.clock);
  const [eliminator, setEliminator] = useState<Record<string, string>>({});
  const allActive = state.tables.flatMap((t) => t.seats);

  const level = state.clock?.level;
  const remaining = level ? level.durationMinutes * 60 - elapsed : 0;

  async function handleUndoKnockout() {
    // eliminations is newest-first (see live.ts), so index 0 is the most recent.
    const last = state.eliminations[0];
    if (!last) return;
    const ok = await confirmDialog(`Отменить нокаут игрока ${last.nickname}? Он вернётся в игру.`);
    if (ok) await onAction("/undo-knockout");
  }

  return (
    <>
      {state.counts.active === 1 && (
        <button className="btn btn-primary" style={{ marginBottom: 14 }} onClick={onPublish}>
          🏆 Турнир завершён — опубликовать результаты
        </button>
      )}

      <div className="card" style={{ marginBottom: 14, textAlign: "center" }}>
        {level?.isBreak && <div className="badge badge-blue" style={{ marginBottom: 8 }}>ПЕРЕРЫВ</div>}
        <div style={{ fontSize: 40, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {formatMMSS(remaining)}
        </div>
        {level && !level.isBreak && (
          <div className="small muted" style={{ marginTop: 4 }}>
            Ур. {level.levelNumber}: {level.smallBlind}/{level.bigBlind}
            {level.ante > 0 && ` (ante ${level.ante})`}
            {state.clock?.nextLevel && !state.clock.nextLevel.isBreak && (
              <> → след. {state.clock.nextLevel.smallBlind}/{state.clock.nextLevel.bigBlind}</>
            )}
          </div>
        )}
        <div className="row" style={{ marginTop: 14, gap: 8 }}>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            disabled={busy}
            onClick={() => onAction("/clock/level", { direction: "prev" })}
          >
            ⏮ Уровень
          </button>
          <button
            className="btn btn-primary"
            style={{ fontSize: 12 }}
            disabled={busy}
            onClick={() => onAction(state.clock?.isPaused ? "/clock/resume" : "/clock/pause")}
          >
            {state.clock?.isPaused ? "▶ Resume" : "⏸ Pause"}
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            disabled={busy}
            onClick={() => onAction("/clock/level", { direction: "next" })}
          >
            Уровень ⏭
          </button>
        </div>
      </div>

      <LevelJumpAndAnnounce tournamentId={state.tournament.id} busy={busy} onAction={onAction} />

      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <StatTile value={state.counts.active} label="Активных" />
        <StatTile value={state.counts.eliminated} label="Выбыло" />
        <StatTile value={state.counts.tablesActive} label="Столов" />
        <StatTile value={state.counts.fieldSize} label="Всего" />
      </div>

      {state.tables.length > 1 && (
        <button
          className="btn btn-secondary"
          style={{ marginBottom: 14 }}
          disabled={busy}
          onClick={() => onAction("/rebalance")}
        >
          ⚖ Сбалансировать столы
        </button>
      )}

      <strong className="small muted">СТОЛЫ</strong>
      {state.tables.map((table) => (
        <div className="card" key={table.tableNo} style={{ marginTop: 10, marginBottom: 14 }}>
          <strong className="small">Стол {table.tableNo}</strong>
          <div className="row-list" style={{ marginTop: 8 }}>
            {table.seats.map((seat) => (
              <SeatRow
                key={seat.playerId}
                seat={seat}
                tables={state.tables}
                eliminator={eliminator[seat.playerId] ?? ""}
                onEliminatorChange={(v) => setEliminator((m) => ({ ...m, [seat.playerId]: v }))}
                eliminatorOptions={allActive.filter((p) => p.playerId !== seat.playerId)}
                busy={busy}
                onAction={onAction}
              />
            ))}
          </div>
        </div>
      ))}

      {(state.tournament.reentryPrice || state.tournament.addonPrice) && (
        <>
          <strong className="small muted">RE-ENTRY / ADD-ON</strong>
          <div className="card" style={{ marginTop: 10, marginBottom: 14 }}>
            <RebuyForm state={state} busy={busy} onAction={onAction} />
          </div>
        </>
      )}

      <div className="row" style={{ marginBottom: 6 }}>
        <strong className="small muted">ВЫБЫВШИЕ ({state.eliminations.length})</strong>
        {state.eliminations.length > 0 && (
          <button
            className="btn btn-secondary"
            style={{ width: "auto", padding: "4px 10px", fontSize: 11 }}
            disabled={busy}
            onClick={handleUndoKnockout}
          >
            ↩️ Отменить последний
          </button>
        )}
      </div>
      <div className="row-list" style={{ marginTop: 10 }}>
        {state.eliminations.map((e) => (
          <div className="row-item" key={`${e.playerId}-${e.at}`}>
            <span>
              {e.place}. {e.nickname}
            </span>
            <span className="small muted">{e.eliminatedByNickname ? `от ${e.eliminatedByNickname}` : ""}</span>
          </div>
        ))}
        {state.eliminations.length === 0 && <div className="small muted">Пока никто не выбыл</div>}
      </div>
    </>
  );
}

function LevelJumpAndAnnounce({
  tournamentId,
  busy,
  onAction,
}: {
  tournamentId: string;
  busy: boolean;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const [levels, setLevels] = useState<BlindLevel[]>([]);
  const [levelNumber, setLevelNumber] = useState("");
  const [announceText, setAnnounceText] = useState("");

  useEffect(() => {
    apiGet<{ blindLevels: BlindLevel[] }>(`/api/td/tournaments/${tournamentId}`).then((t) =>
      setLevels(t.blindLevels),
    );
  }, [tournamentId]);

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div className="row" style={{ gap: 8, marginBottom: 10 }}>
        <select
          value={levelNumber}
          onChange={(e) => setLevelNumber(e.target.value)}
          style={selectStyle}
        >
          <option value="">Перейти на уровень…</option>
          {levels.map((l) => (
            <option key={l.levelNumber} value={l.levelNumber}>
              Ур. {l.levelNumber} {l.isBreak ? "(перерыв)" : `${l.smallBlind}/${l.bigBlind}`}
            </option>
          ))}
        </select>
        <button
          className="btn btn-secondary"
          style={{ width: "auto", fontSize: 12 }}
          disabled={busy || !levelNumber}
          onClick={() => onAction("/clock/level", { levelNumber: Number(levelNumber) })}
        >
          Перейти
        </button>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <input
          value={announceText}
          onChange={(e) => setAnnounceText(e.target.value)}
          placeholder="Объявление на табло…"
          style={{ ...selectStyle, flex: 1 }}
        />
        <button
          className="btn btn-primary"
          style={{ width: "auto", fontSize: 12 }}
          disabled={busy || !announceText.trim()}
          onClick={() => {
            onAction("/announce", { text: announceText.trim() });
            setAnnounceText("");
          }}
        >
          📢 Отправить
        </button>
      </div>
    </div>
  );
}

const selectStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--card-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 13,
};

function SeatRow({
  seat,
  tables,
  eliminator,
  onEliminatorChange,
  eliminatorOptions,
  busy,
  onAction,
}: {
  seat: LiveSeat;
  tables: LiveTable[];
  eliminator: string;
  onEliminatorChange: (v: string) => void;
  eliminatorOptions: { playerId: string; nickname: string }[];
  busy: boolean;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const [stackInput, setStackInput] = useState(String(seat.currentStack ?? ""));
  const [moving, setMoving] = useState(false);
  const [target, setTarget] = useState("");

  useEffect(() => setStackInput(String(seat.currentStack ?? "")), [seat.currentStack]);

  function commitStack() {
    const value = Number(stackInput);
    if (!Number.isFinite(value) || value === seat.currentStack) return;
    onAction("/stack", { playerId: seat.playerId, currentStack: Math.max(0, Math.round(value)) });
  }

  const freeSeats = tables.flatMap((t) =>
    Array.from({ length: t.maxSeats }, (_, i) => i + 1)
      .filter((n) => n === seat.seatNo || !t.seats.some((s) => s.seatNo === n))
      .map((n) => ({ tableNo: t.tableNo, seatNo: n })),
  );

  return (
    <div className="row-item" style={{ flexWrap: "wrap" }}>
      <div className="row" style={{ gap: 8, flex: 1, minWidth: 160 }}>
        <span className="small muted">#{seat.seatNo}</span>
        <span>{initials(seat.nickname)}</span>
        <span>{seat.nickname}</span>
      </div>

      <div className="row" style={{ gap: 6, width: "auto" }}>
        <input
          value={stackInput}
          onChange={(e) => setStackInput(e.target.value)}
          onBlur={commitStack}
          onKeyDown={(e) => e.key === "Enter" && commitStack()}
          inputMode="numeric"
          title="Текущий стек"
          style={{ ...seatInputStyle, width: 70 }}
        />
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "4px 8px", fontSize: 11 }}
          disabled={busy}
          onClick={() => setMoving((v) => !v)}
        >
          ↔
        </button>
        <select
          value={eliminator}
          onChange={(e) => onEliminatorChange(e.target.value)}
          style={seatInputStyle}
        >
          <option value="">кто выбил?</option>
          {eliminatorOptions.map((p) => (
            <option key={p.playerId} value={p.playerId}>
              {p.nickname}
            </option>
          ))}
        </select>
        <button
          className="btn btn-danger"
          style={{ width: "auto", padding: "4px 10px", fontSize: 11 }}
          disabled={busy}
          onClick={() => onAction("/knockout", { eliminatedPlayerId: seat.playerId, eliminatedByPlayerId: eliminator || null })}
        >
          💀
        </button>
      </div>

      {moving && (
        <div className="row" style={{ gap: 6, width: "100%", marginTop: 6 }}>
          <select value={target} onChange={(e) => setTarget(e.target.value)} style={{ ...seatInputStyle, flex: 1 }}>
            <option value="">Куда пересадить?</option>
            {freeSeats.map((f) => (
              <option key={`${f.tableNo}-${f.seatNo}`} value={`${f.tableNo}-${f.seatNo}`}>
                Стол {f.tableNo}, место {f.seatNo}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            style={{ width: "auto", fontSize: 11 }}
            disabled={busy || !target}
            onClick={() => {
              const [tableNo, seatNo] = target.split("-").map(Number);
              onAction("/move-seat", { playerId: seat.playerId, tableNo, seatNo });
              setMoving(false);
              setTarget("");
            }}
          >
            Пересадить
          </button>
        </div>
      )}
    </div>
  );
}

const seatInputStyle = {
  fontSize: 11,
  padding: "4px 6px",
  borderRadius: 6,
  background: "var(--card-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
};

function RebuyForm({
  state,
  busy,
  onAction,
}: {
  state: LiveState;
  busy: boolean;
  onAction: (path: string, body?: unknown) => Promise<void>;
}) {
  const [playerId, setPlayerId] = useState("");
  const eliminatedPlayers = state.eliminations.map((e) => ({ playerId: e.playerId, nickname: e.nickname }));
  const activePlayers = state.tables.flatMap((t) => t.seats);

  return (
    <div>
      <select
        value={playerId}
        onChange={(e) => setPlayerId(e.target.value)}
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          background: "var(--card-2)",
          border: "1px solid var(--border)",
          color: "var(--text)",
          marginBottom: 10,
        }}
      >
        <option value="">Выберите игрока…</option>
        {state.tournament.reentryPrice && eliminatedPlayers.length > 0 && (
          <optgroup label="Re-entry (выбывшие)">
            {eliminatedPlayers.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.nickname}
              </option>
            ))}
          </optgroup>
        )}
        {state.tournament.addonPrice && (
          <optgroup label="Add-on (активные)">
            {activePlayers.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.nickname}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <div className="row" style={{ gap: 8 }}>
        {state.tournament.reentryPrice && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            disabled={busy || !playerId}
            onClick={() => onAction("/rebuy", { playerId, type: "reentry" })}
          >
            Re-entry ({Number(state.tournament.reentryPrice)}₽)
          </button>
        )}
        {state.tournament.addonPrice && (
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12 }}
            disabled={busy || !playerId}
            onClick={() => onAction("/rebuy", { playerId, type: "addon" })}
          >
            Add-on ({Number(state.tournament.addonPrice)}₽)
          </button>
        )}
      </div>
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <div className="value" style={{ fontSize: 18 }}>
        {value}
      </div>
      <div className="small muted">{label}</div>
    </div>
  );
}
