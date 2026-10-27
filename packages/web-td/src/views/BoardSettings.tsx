import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiGet, apiPut } from "../lib/api.js";
import Toggle from "../components/Toggle.js";

interface BoardSettingsShape {
  showPayoutPreview: boolean;
  showKnockoutTicker: boolean;
  showChipLeader: boolean;
  accentColor: string;
  soundEnabled: boolean;
  soundVolume: number;
}

interface ClubResponse {
  id: string;
  boardSettings: BoardSettingsShape;
}

export default function BoardSettings({ onClose }: { onClose: () => void }) {
  const [club, setClub] = useState<ClubResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ClubResponse>("/api/td/club").then(setClub).catch((err) => setError(String(err.message ?? err)));
  }, []);

  function patchSettings(patch: Partial<BoardSettingsShape>) {
    setClub((c) => (c ? { ...c, boardSettings: { ...c.boardSettings, ...patch } } : c));
  }

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ClubResponse>("/api/td/club", {
        boardSettings: club.boardSettings,
      });
      setClub(updated);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (!club) return <div className="loading">Загрузка…</div>;

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Настройка табло</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <strong className="small muted">ВНЕШНИЙ ВИД ТАБЛО</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Акцентный цвет</label>
          <input
            type="color"
            value={club.boardSettings.accentColor}
            onChange={(e) => patchSettings({ accentColor: e.target.value })}
            style={{ width: 60, height: 36, padding: 2, background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 8 }}
          />
        </div>
      </div>

      <strong className="small muted">БЛОКИ НА ТАБЛО</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span>Лидер по фишкам</span>
          <Toggle checked={club.boardSettings.showChipLeader} onChange={(v) => patchSettings({ showChipLeader: v })} />
        </div>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span>Превью выплат</span>
          <Toggle
            checked={club.boardSettings.showPayoutPreview}
            onChange={(v) => patchSettings({ showPayoutPreview: v })}
          />
        </div>
        <div className="row small">
          <span>Лента выбывших</span>
          <Toggle
            checked={club.boardSettings.showKnockoutTicker}
            onChange={(v) => patchSettings({ showKnockoutTicker: v })}
          />
        </div>
      </div>

      <strong className="small muted">ЗВУК</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span>Звуковой сигнал</span>
          <Toggle checked={club.boardSettings.soundEnabled} onChange={(v) => patchSettings({ soundEnabled: v })} />
        </div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          Громкость
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={club.boardSettings.soundVolume}
          disabled={!club.boardSettings.soundEnabled}
          onChange={(e) => patchSettings({ soundVolume: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}
