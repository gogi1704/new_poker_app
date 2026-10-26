import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";

interface StandingRow {
  playerId: string;
  nickname: string;
  place: number;
  knockoutsCount: number;
  bountyPoints: number;
  rpsAwarded: number;
}

interface PreviewResponse {
  ready: boolean;
  fieldSize?: number;
  prizePool?: number;
  rows?: StandingRow[];
  suggestedPayouts?: Record<number, number>;
}

export default function PublishResults({
  tournamentId,
  onDone,
  onCancel,
}: {
  tournamentId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [payouts, setPayouts] = useState<Record<string, number>>({});
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PreviewResponse>(`/api/td/tournaments/${tournamentId}/standings-preview`).then((p) => {
      setPreview(p);
      if (p.ready && p.rows && p.suggestedPayouts) {
        const byPlayer: Record<string, number> = {};
        for (const row of p.rows) {
          byPlayer[row.playerId] = p.suggestedPayouts[row.place] ?? 0;
        }
        setPayouts(byPlayer);
      }
    });
  }, [tournamentId]);

  async function handlePublish() {
    setPublishing(true);
    setError(null);
    try {
      await apiPost(`/api/td/tournaments/${tournamentId}/publish`, { payouts });
      onDone();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setPublishing(false);
    }
  }

  if (!preview) return <div className="loading">Загрузка…</div>;

  if (!preview.ready) {
    return (
      <div className="section">
        <div className="empty">
          Турнир ещё не завершён — должен остаться ровно один активный игрок.
          <div style={{ marginTop: 14 }}>
            <button className="btn btn-secondary" onClick={onCancel}>
              Назад
            </button>
          </div>
        </div>
      </div>
    );
  }

  const totalPayout = Object.values(payouts).reduce((a, b) => a + (b || 0), 0);

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Публикация результатов</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={onCancel}>
          ✕
        </button>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row small muted">
          <span>Игроков: {preview.fieldSize}</span>
          <span>Призовой фонд: {preview.prizePool?.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div className="row small muted" style={{ marginTop: 6 }}>
          <span>Распределено</span>
          <span style={{ color: totalPayout > (preview.prizePool ?? 0) ? "var(--danger)" : "var(--text)" }}>
            {totalPayout.toLocaleString("ru-RU")} ₽
          </span>
        </div>
      </div>

      <div className="row-list" style={{ marginBottom: 14 }}>
        {preview.rows?.map((row) => (
          <div className="row-item" key={row.playerId}>
            <div>
              <div>
                {row.place}. {row.nickname}
              </div>
              <div className="small muted">
                {row.knockoutsCount > 0 && `💀 ${row.knockoutsCount} (+${row.bountyPoints}) · `}
                RPS +{row.rpsAwarded}
              </div>
            </div>
            <input
              type="number"
              min="0"
              value={payouts[row.playerId] ?? 0}
              onChange={(e) => setPayouts((p) => ({ ...p, [row.playerId]: Number(e.target.value) }))}
              style={{
                width: 100,
                padding: 8,
                borderRadius: 8,
                background: "var(--card-2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                textAlign: "right",
              }}
            />
          </div>
        ))}
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <button className="btn btn-primary" disabled={publishing} onClick={handlePublish}>
        {publishing ? "Публикуем…" : "🏆 Опубликовать результаты"}
      </button>
    </div>
  );
}
