import { useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { apiPut } from "../lib/api.js";
import { AVATAR_PRESETS, renderPresetAvatar, fileToAvatarDataUrl } from "../lib/avatarPresets.js";
import Avatar from "./Avatar.js";

export default function ProfileEditor({
  nickname,
  avatarUrl,
  onSaved,
  onClose,
}: {
  nickname: string;
  avatarUrl: string | null;
  onSaved: (player: { nickname: string; avatarUrl: string | null }) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(nickname);
  const [preview, setPreview] = useState<string | null>(avatarUrl);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setPreview(await fileToAvatarDataUrl(file));
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Никнейм не может быть пустым");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { player } = await apiPut<{ player: { nickname: string; avatarUrl: string | null } }>("/api/profile", {
        nickname: trimmed,
        avatarUrl: preview,
      });
      onSaved(player);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle}>
      <div className="card" style={{ width: "100%", maxWidth: 420, maxHeight: "85vh", overflowY: "auto" }}>
        <div className="row" style={{ marginBottom: 16 }}>
          <strong>Редактировать профиль</strong>
          <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <Avatar nickname={name || "?"} avatarUrl={preview} size={88} fontSize={32} />
          <button
            className="btn btn-secondary"
            style={{ width: "auto", marginTop: 10, padding: "8px 14px", fontSize: 13 }}
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
            Загрузить фото
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        </div>

        <div className="small muted" style={{ marginBottom: 8 }}>
          ИЛИ ВЫБЕРИТЕ АВАТАР
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 20 }}>
          {AVATAR_PRESETS.map((p, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setPreview(renderPresetAvatar(p))}
              style={{
                width: "100%",
                aspectRatio: "1",
                borderRadius: "50%",
                border: "none",
                background: p.bg,
                fontSize: 22,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {p.emoji}
            </button>
          ))}
        </div>

        <div className="field">
          <label>Никнейм</label>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} />
        </div>

        {error && (
          <div className="small" style={{ color: "var(--danger)", margin: "10px 0" }}>
            {error}
          </div>
        )}

        <button className="btn btn-primary" style={{ marginTop: 10 }} disabled={saving} onClick={handleSave}>
          {saving ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};
