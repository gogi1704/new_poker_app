import { useEffect, useState } from "react";
import { X, Trash2, Plus, Save } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import { confirmDialog } from "../lib/telegram.js";

interface RankTier {
  id?: string;
  name: string;
  order: number;
  thresholdType: "rps" | "games";
  thresholdValue: number;
  badgeIcon: string | null;
}

interface Achievement {
  id?: string;
  key: string;
  name: string;
  thresholdType: "cashes" | "rps" | "streak" | "games";
  thresholdValue: number;
}

interface PlayerHit {
  id: string;
  telegramId: string;
  nickname: string;
}

const RANK_THRESHOLD_LABEL: Record<RankTier["thresholdType"], string> = { rps: "по очкам RPS", games: "по играм" };
const ACHIEVEMENT_THRESHOLD_LABEL: Record<Achievement["thresholdType"], string> = {
  cashes: "по призовым местам",
  rps: "по очкам RPS",
  streak: "по серии",
  games: "по играм",
};

export default function RatingSettings({ onClose }: { onClose: () => void }) {
  const [tiers, setTiers] = useState<RankTier[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [targetPlayer, setTargetPlayer] = useState<PlayerHit | null>(null);
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState("");
  const [adjustMessage, setAdjustMessage] = useState<string | null>(null);

  function load() {
    apiGet<RankTier[]>("/api/td/rank-tiers").then(setTiers).catch((err) => setError(String(err.message ?? err)));
    apiGet<Achievement[]>("/api/td/achievements")
      .then(setAchievements)
      .catch((err) => setError(String(err.message ?? err)));
  }

  useEffect(load, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      apiGet<PlayerHit[]>(`/api/td/players/search?q=${encodeURIComponent(query.trim())}`)
        .then(setHits)
        .catch(() => setHits([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  function updateTier(i: number, patch: Partial<RankTier>) {
    setTiers((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function saveTier(i: number) {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiPost<RankTier>("/api/td/rank-tiers", tiers[i]);
      setTiers((rows) => rows.map((r, idx) => (idx === i ? saved : r)));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteTier(i: number) {
    const row = tiers[i];
    if (!row.id) {
      setTiers((rows) => rows.filter((_, idx) => idx !== i));
      return;
    }
    const ok = await confirmDialog(`Удалить ранг «${row.name}»?`);
    if (!ok) return;
    setBusy(true);
    try {
      await apiDelete(`/api/td/rank-tiers/${row.id}`);
      setTiers((rows) => rows.filter((_, idx) => idx !== i));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  function updateAchievement(i: number, patch: Partial<Achievement>) {
    setAchievements((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function saveAchievement(i: number) {
    setBusy(true);
    setError(null);
    try {
      const saved = await apiPost<Achievement>("/api/td/achievements", achievements[i]);
      setAchievements((rows) => rows.map((r, idx) => (idx === i ? saved : r)));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function deleteAchievement(i: number) {
    const row = achievements[i];
    if (!row.id) {
      setAchievements((rows) => rows.filter((_, idx) => idx !== i));
      return;
    }
    const ok = await confirmDialog(`Удалить достижение «${row.name}»?`);
    if (!ok) return;
    setBusy(true);
    try {
      await apiDelete(`/api/td/achievements/${row.id}`);
      setAchievements((rows) => rows.filter((_, idx) => idx !== i));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function submitAdjust() {
    if (!targetPlayer || !delta.trim() || !reason.trim()) return;
    setBusy(true);
    setError(null);
    setAdjustMessage(null);
    try {
      await apiPost(`/api/td/players/${targetPlayer.id}/rps-adjust`, { delta: Number(delta), reason: reason.trim() });
      setAdjustMessage(`Готово: ${targetPlayer.nickname} ${Number(delta) >= 0 ? "+" : ""}${delta} RPS.`);
      setTargetPlayer(null);
      setQuery("");
      setDelta("");
      setReason("");
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Настройки рейтинга</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <strong className="small muted">РАНГИ</strong>
      <div className="row-list" style={{ margin: "10px 0 14px" }}>
        {tiers.map((tier, i) => (
          <div className="card" key={tier.id ?? `new-${i}`} style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                value={tier.name}
                onChange={(e) => updateTier(i, { name: e.target.value })}
                placeholder="Название"
                style={{ flex: 1, minWidth: 100 }}
              />
              <input
                type="number"
                value={tier.order}
                onChange={(e) => updateTier(i, { order: Number(e.target.value) })}
                placeholder="Порядок"
                style={{ width: 70 }}
              />
              <select
                value={tier.thresholdType}
                onChange={(e) => updateTier(i, { thresholdType: e.target.value as RankTier["thresholdType"] })}
              >
                <option value="rps">{RANK_THRESHOLD_LABEL.rps}</option>
                <option value="games">{RANK_THRESHOLD_LABEL.games}</option>
              </select>
              <input
                type="number"
                value={tier.thresholdValue}
                onChange={(e) => updateTier(i, { thresholdValue: Number(e.target.value) })}
                placeholder="Порог"
                style={{ width: 80 }}
              />
              <input
                value={tier.badgeIcon ?? ""}
                onChange={(e) => updateTier(i, { badgeIcon: e.target.value || null })}
                placeholder="Значок"
                style={{ width: 70 }}
              />
              <button
                className="btn btn-secondary"
                style={{ width: "auto", padding: "4px 10px" }}
                disabled={busy}
                onClick={() => saveTier(i)}
              >
                <Save size={13} />
              </button>
              <button
                className="btn btn-danger"
                style={{ width: "auto", padding: "4px 10px" }}
                disabled={busy}
                onClick={() => deleteTier(i)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn btn-secondary"
          style={{ width: "auto" }}
          onClick={() =>
            setTiers((rows) => [
              ...rows,
              { name: "", order: rows.length + 1, thresholdType: "rps", thresholdValue: 0, badgeIcon: null },
            ])
          }
        >
          <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Добавить ранг
        </button>
      </div>

      <strong className="small muted">ДОСТИЖЕНИЯ</strong>
      <div className="row-list" style={{ margin: "10px 0 14px" }}>
        {achievements.map((a, i) => (
          <div className="card" key={a.id ?? `new-${i}`} style={{ marginBottom: 8 }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <input
                value={a.key}
                onChange={(e) => updateAchievement(i, { key: e.target.value })}
                placeholder="Ключ (латиница)"
                style={{ width: 120 }}
                disabled={!!a.id}
              />
              <input
                value={a.name}
                onChange={(e) => updateAchievement(i, { name: e.target.value })}
                placeholder="Название"
                style={{ flex: 1, minWidth: 100 }}
              />
              <select
                value={a.thresholdType}
                onChange={(e) => updateAchievement(i, { thresholdType: e.target.value as Achievement["thresholdType"] })}
              >
                <option value="cashes">{ACHIEVEMENT_THRESHOLD_LABEL.cashes}</option>
                <option value="rps">{ACHIEVEMENT_THRESHOLD_LABEL.rps}</option>
                <option value="streak">{ACHIEVEMENT_THRESHOLD_LABEL.streak}</option>
                <option value="games">{ACHIEVEMENT_THRESHOLD_LABEL.games}</option>
              </select>
              <input
                type="number"
                value={a.thresholdValue}
                onChange={(e) => updateAchievement(i, { thresholdValue: Number(e.target.value) })}
                placeholder="Порог"
                style={{ width: 80 }}
              />
              <button
                className="btn btn-secondary"
                style={{ width: "auto", padding: "4px 10px" }}
                disabled={busy}
                onClick={() => saveAchievement(i)}
              >
                <Save size={13} />
              </button>
              <button
                className="btn btn-danger"
                style={{ width: "auto", padding: "4px 10px" }}
                disabled={busy}
                onClick={() => deleteAchievement(i)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn btn-secondary"
          style={{ width: "auto" }}
          onClick={() =>
            setAchievements((rows) => [...rows, { key: "", name: "", thresholdType: "rps", thresholdValue: 0 }])
          }
        >
          <Plus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
          Добавить достижение
        </button>
      </div>

      <strong className="small muted">НАЧИСЛИТЬ / СПИСАТЬ ОЧКИ</strong>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Игрок</label>
          {targetPlayer ? (
            <div className="row" style={{ gap: 8 }}>
              <span>{targetPlayer.nickname}</span>
              <button className="btn btn-secondary" style={{ width: "auto", fontSize: 11 }} onClick={() => setTargetPlayer(null)}>
                Сменить
              </button>
            </div>
          ) : (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить ник…" />
          )}
        </div>

        {!targetPlayer && hits.length > 0 && (
          <div className="row-list" style={{ marginBottom: 14 }}>
            {hits.map((p) => (
              <div className="row-item" key={p.id}>
                <span>{p.nickname}</span>
                <button
                  className="btn btn-secondary"
                  style={{ width: "auto", padding: "4px 12px", fontSize: 12 }}
                  onClick={() => {
                    setTargetPlayer(p);
                    setHits([]);
                  }}
                >
                  Выбрать
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="row" style={{ gap: 14 }}>
          <div className="field">
            <label>Δ очков (может быть отрицательным)</label>
            <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} style={{ maxWidth: 120 }} />
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Причина</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Например: исправление после спора" />
          </div>
        </div>

        {adjustMessage && <div className="small" style={{ color: "var(--success, #4caf50)", marginBottom: 8 }}>{adjustMessage}</div>}

        <button
          className="btn btn-primary"
          style={{ width: "auto" }}
          disabled={busy || !targetPlayer || !delta.trim() || !reason.trim()}
          onClick={submitAdjust}
        >
          Применить
        </button>
      </div>
    </div>
  );
}
