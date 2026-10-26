import { useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon } from "lucide-react";
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
  name: string;
  logoUrl: string | null;
  boardSettings: BoardSettingsShape;
}

const LOGO_SIZE = 160;

function fileToLogoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать файл"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Не удалось загрузить изображение"));
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = LOGO_SIZE;
        canvas.height = LOGO_SIZE;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export default function BoardSettings({ onClose }: { onClose: () => void }) {
  const [club, setClub] = useState<ClubResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiGet<ClubResponse>("/api/td/club").then(setClub).catch((err) => setError(String(err.message ?? err)));
  }, []);

  function patchSettings(patch: Partial<BoardSettingsShape>) {
    setClub((c) => (c ? { ...c, boardSettings: { ...c.boardSettings, ...patch } } : c));
  }

  async function handleLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !club) return;
    try {
      const logoUrl = await fileToLogoDataUrl(file);
      setClub({ ...club, logoUrl });
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ClubResponse>("/api/td/club", {
        name: club.name,
        logoUrl: club.logoUrl,
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

      <strong className="small muted">БРЕНДИНГ</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          {club.logoUrl ? (
            <img src={club.logoUrl} alt="logo" style={{ width: 72, height: 72, borderRadius: 16, objectFit: "cover" }} />
          ) : (
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 16,
                background: "var(--card-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
              }}
            >
              <ImageIcon size={28} color="var(--muted)" />
            </div>
          )}
          <button
            className="btn btn-secondary"
            style={{ width: "auto", marginTop: 10, padding: "8px 14px", fontSize: 13 }}
            onClick={() => fileInputRef.current?.click()}
          >
            Загрузить лого
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
        </div>

        <div className="field">
          <label>Название клуба</label>
          <input value={club.name} onChange={(e) => setClub({ ...club, name: e.target.value })} maxLength={60} />
        </div>

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
