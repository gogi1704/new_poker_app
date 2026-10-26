import { useEffect, useState } from "react";
import { X, Trash2, UserPlus } from "lucide-react";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";
import { confirmDialog } from "../lib/telegram.js";
import { initials } from "../lib/format.js";

interface StaffRow {
  telegramId: string;
  role: "owner" | "td" | "floor";
  nickname: string | null;
  avatarUrl: string | null;
}

interface PlayerHit {
  id: string;
  telegramId: string;
  nickname: string;
  avatarUrl: string | null;
}

const ROLE_LABEL: Record<StaffRow["role"], string> = { owner: "Владелец", td: "TD", floor: "Floor" };

export default function StaffSettings({ onClose }: { onClose: () => void }) {
  const [staff, setStaff] = useState<StaffRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlayerHit[]>([]);
  const [manualId, setManualId] = useState("");
  const [role, setRole] = useState<StaffRow["role"]>("floor");

  function load() {
    apiGet<StaffRow[]>("/api/td/staff").then(setStaff).catch((err) => setError(String(err.message ?? err)));
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

  async function grant(telegramId: string) {
    setBusy(true);
    setError(null);
    try {
      await apiPost("/api/td/staff", { telegramId, role });
      setQuery("");
      setHits([]);
      setManualId("");
      load();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(row: StaffRow) {
    const ok = await confirmDialog(
      `Убрать доступ у ${row.nickname ?? row.telegramId}? Если это вы сами — вы потеряете доступ к панели.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      await apiDelete(`/api/td/staff/${row.telegramId}`);
      load();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Доступы к панели</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <strong className="small muted">ТЕКУЩИЙ СОСТАВ</strong>
      <div className="row-list" style={{ margin: "10px 0 20px" }}>
        {staff === null && <div className="small muted">Загрузка…</div>}
        {staff?.map((row) => (
          <div className="row-item" key={row.telegramId}>
            <div className="row" style={{ gap: 8, width: "auto" }}>
              <div className="avatar" style={{ width: 28, height: 28, fontSize: 11 }}>
                {initials(row.nickname ?? row.telegramId)}
              </div>
              <span>{row.nickname ?? `ID ${row.telegramId}`}</span>
              <span className="badge">{ROLE_LABEL[row.role]}</span>
            </div>
            <button
              className="btn btn-danger"
              style={{ width: "auto", padding: "4px 10px", fontSize: 11 }}
              disabled={busy}
              onClick={() => revoke(row)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
        {staff?.length === 0 && <div className="small muted">Пока никого нет</div>}
      </div>

      <strong className="small muted">ВЫДАТЬ ДОСТУП</strong>
      <div className="card" style={{ marginTop: 10 }}>
        <div className="field">
          <label>Найти по никнейму</label>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Начните вводить ник…" />
        </div>

        {hits.length > 0 && (
          <div className="row-list" style={{ marginBottom: 14 }}>
            {hits.map((p) => (
              <div className="row-item" key={p.id}>
                <span>{p.nickname}</span>
                <button
                  className="btn btn-secondary"
                  style={{ width: "auto", padding: "4px 12px", fontSize: 12 }}
                  disabled={busy}
                  onClick={() => grant(p.telegramId)}
                >
                  <UserPlus size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
                  Выдать
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="field">
          <label>Роль для выдачи</label>
          <select value={role} onChange={(e) => setRole(e.target.value as StaffRow["role"])}>
            <option value="floor">Floor</option>
            <option value="td">TD</option>
            <option value="owner">Владелец</option>
          </select>
        </div>

        <div className="small muted" style={{ marginBottom: 6 }}>
          Если человек ещё не открывал бота — найти по нику нельзя, впишите его Telegram ID вручную:
        </div>
        <div className="row" style={{ gap: 8 }}>
          <input
            value={manualId}
            onChange={(e) => setManualId(e.target.value)}
            placeholder="Telegram ID"
            style={{
              flex: 1,
              padding: 10,
              borderRadius: 10,
              background: "var(--card-2)",
              border: "1px solid var(--border)",
              color: "var(--text)",
            }}
          />
          <button
            className="btn btn-primary"
            style={{ width: "auto", fontSize: 12 }}
            disabled={busy || !manualId.trim()}
            onClick={() => grant(manualId.trim())}
          >
            Выдать
          </button>
        </div>
      </div>
    </div>
  );
}
