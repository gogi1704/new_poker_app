import { useEffect, useState } from "react";
import { Square, Copy, Archive, ArchiveRestore, Trash2 } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import { confirmDialog } from "../lib/telegram.js";
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
  const [showArchived, setShowArchived] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    apiGet<TournamentListItem[]>(`/api/td/tournaments${showArchived ? "?includeArchived=true" : ""}`)
      .then(setTournaments)
      .catch((err) => setError(String((err as Error).message ?? err)));
  }

  useEffect(load, [showArchived]);

  async function action(id: string, run: () => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await run();
      load();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleStop(t: TournamentListItem) {
    const ok = await confirmDialog(
      t.status === "running"
        ? `Остановить турнир «${t.name}»? Он сейчас идёт — игроки потеряют доступ к живой консоли.`
        : `Отменить турнир «${t.name}»?`,
    );
    if (ok) action(t.id, () => apiPost(`/api/td/tournaments/${t.id}/cancel`));
  }

  async function handleDuplicate(t: TournamentListItem) {
    setBusyId(t.id);
    setError(null);
    try {
      const { id } = await apiPost<{ id: string }>(`/api/td/tournaments/${t.id}/duplicate`);
      onEdit(id);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(t: TournamentListItem) {
    const extra = t.status === "running" ? " Турнир ещё идёт!" : "";
    const ok = await confirmDialog(`Удалить турнир «${t.name}» безвозвратно?${extra} Это нельзя отменить.`);
    if (ok) action(t.id, () => apiDelete(`/api/td/tournaments/${t.id}`));
  }

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Турниры</strong>
        <button className="btn btn-primary" style={{ width: "auto", padding: "8px 16px" }} onClick={onCreate}>
          + Новый турнир
        </button>
      </div>

      <label className="row small muted" style={{ marginBottom: 14, cursor: "pointer" }}>
        <span>Показывать архивные</span>
        <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
      </label>

      {error && <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>{error}</div>}
      {!tournaments && !error && <div className="loading">Загрузка…</div>}
      {tournaments?.length === 0 && <div className="empty">Турниров пока нет — создайте первый</div>}

      {tournaments?.map((t) => (
        <div key={t.id} className="tournament-row" style={{ opacity: t.archived ? 0.6 : 1 }}>
          <div onClick={() => onEdit(t.id)} style={{ cursor: "pointer" }}>
            <div className="row">
              <span className="name">{t.name}</span>
              <span className={`badge badge-status-${t.status}`}>
                {statusLabel(t.status)}
                {t.archived && " · архив"}
              </span>
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {formatDateDisplay(t.scheduledAt)} · {formatLabel(t.format)} · {Number(t.buyIn)} ₽ · {t.maxSeats} мест
            </div>
          </div>

          <div className="row" style={{ marginTop: 10, gap: 6, flexWrap: "wrap" }}>
            {LIVE_ELIGIBLE.has(t.status) && (
              <button
                className="btn btn-primary"
                style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                onClick={() => onOpenLive(t.id)}
              >
                🎮 Консоль
              </button>
            )}
            {(t.status === "scheduled" || t.status === "registering" || t.status === "running") && (
              <button
                className="btn btn-secondary"
                style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
                disabled={busyId === t.id}
                onClick={() => handleStop(t)}
                title="Остановить"
              >
                <Square size={13} />
              </button>
            )}
            <button
              className="btn btn-secondary"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              disabled={busyId === t.id}
              onClick={() => handleDuplicate(t)}
              title="Создать как заготовку"
            >
              <Copy size={13} />
            </button>
            <button
              className="btn btn-secondary"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              disabled={busyId === t.id}
              onClick={() =>
                action(t.id, () => apiPost(`/api/td/tournaments/${t.id}/${t.archived ? "unarchive" : "archive"}`))
              }
              title={t.archived ? "Вернуть из архива" : "В архив"}
            >
              {t.archived ? <ArchiveRestore size={13} /> : <Archive size={13} />}
            </button>
            <button
              className="btn btn-danger"
              style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
              disabled={busyId === t.id}
              onClick={() => handleDelete(t)}
              title="Удалить"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
