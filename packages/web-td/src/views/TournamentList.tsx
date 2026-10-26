import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";
import type { TournamentListItem } from "../lib/types.js";
import { formatDateDisplay, formatLabel, statusLabel } from "../lib/format.js";

const LIVE_ELIGIBLE = new Set(["scheduled", "registering", "running"]);

export default function TournamentList({
  onCreate,
  onEdit,
  onOpenLive,
}: {
  onCreate: () => void;
  onEdit: (id: string) => void;
  onOpenLive: (id: string) => void;
}) {
  const [tournaments, setTournaments] = useState<TournamentListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<TournamentListItem[]>("/api/td/tournaments")
      .then(setTournaments)
      .catch((err) => setError(String((err as Error).message ?? err)));
  }, []);

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Турниры</strong>
        <button className="btn btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={onCreate}>
          + Новый турнир
        </button>
      </div>

      {error && <div className="small" style={{ color: "var(--danger)" }}>{error}</div>}
      {!tournaments && !error && <div className="loading">Загрузка…</div>}
      {tournaments?.length === 0 && <div className="empty">Турниров пока нет — создайте первый</div>}

      {tournaments?.map((t) => (
        <div key={t.id} className="tournament-row" onClick={() => onEdit(t.id)}>
          <div className="row">
            <span className="name">{t.name}</span>
            <span className={`badge badge-status-${t.status}`}>{statusLabel(t.status)}</span>
          </div>
          <div className="row" style={{ marginTop: 6, alignItems: "flex-end" }}>
            <div className="small muted">
              {formatDateDisplay(t.scheduledAt)} · {formatLabel(t.format)} · {Number(t.buyIn)} ₽ · {t.maxSeats} мест
            </div>
            {LIVE_ELIGIBLE.has(t.status) && (
              <button
                className="btn btn-primary"
                style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenLive(t.id);
                }}
              >
                🎮 Консоль
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
