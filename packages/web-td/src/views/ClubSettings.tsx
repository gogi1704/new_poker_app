import { useEffect, useRef, useState } from "react";
import { X, Image as ImageIcon } from "lucide-react";
import { apiGet, apiPut } from "../lib/api.js";

interface ClubResponse {
  id: string;
  name: string;
  logoUrl: string | null;
  hasAdminPassword: boolean;
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

export default function ClubSettings({ onClose }: { onClose: () => void }) {
  const [club, setClub] = useState<ClubResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newPassword, setNewPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ClubResponse>("/api/td/club").then(setClub).catch((err) => setError(String(err.message ?? err)));
  }, []);

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
      });
      setClub(updated);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  async function setPassword(password: string) {
    if (!club) return;
    setPasswordSaving(true);
    setPasswordMessage(null);
    try {
      const updated = await apiPut<ClubResponse>("/api/td/club", { password });
      setClub(updated);
      setNewPassword("");
      setPasswordMessage(password ? "Пароль сохранён." : "Вход по паролю отключён.");
    } catch (err) {
      setPasswordMessage(String((err as Error).message ?? err));
    } finally {
      setPasswordSaving(false);
    }
  }

  if (!club) return <div className="loading">Загрузка…</div>;

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Управление клубом</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <div className="card" style={{ marginBottom: 20 }}>
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
            Загрузить иконку клуба
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogo} />
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label>Название клуба</label>
          <input value={club.name} onChange={(e) => setClub({ ...club, name: e.target.value })} maxLength={60} />
        </div>
      </div>

      <div className="small muted" style={{ marginBottom: 14 }}>
        Название и иконка отображаются в мини-приложении игрока и на табло турнира. Цвет акцента, блоки табло и звук
        настраиваются отдельно, в «Настройке табло».
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={handleSave} style={{ marginBottom: 20 }}>
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>

      <div className="card">
        <div style={{ marginBottom: 10 }}>
          <strong>Вход в браузере</strong>
          <div className="small muted" style={{ marginTop: 4 }}>
            {club.hasAdminPassword
              ? "Пароль установлен — панель можно открыть в обычном браузере."
              : "Пароль не задан — панель открывается только внутри Telegram."}
          </div>
        </div>

        <div className="field" style={{ marginBottom: 10 }}>
          <label>{club.hasAdminPassword ? "Новый пароль" : "Задать пароль"}</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
        </div>

        {passwordMessage && (
          <div className="small" style={{ color: "var(--muted)", marginBottom: 10 }}>
            {passwordMessage}
          </div>
        )}

        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-primary"
            disabled={passwordSaving || !newPassword}
            onClick={() => setPassword(newPassword)}
          >
            {passwordSaving ? "Сохраняем…" : "Сохранить пароль"}
          </button>
          {club.hasAdminPassword && (
            <button
              className="btn btn-secondary"
              style={{ width: "auto" }}
              disabled={passwordSaving}
              onClick={() => setPassword("")}
            >
              Отключить
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
