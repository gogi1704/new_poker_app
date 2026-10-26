import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { apiGet } from "../lib/api.js";

const REFRESH_MS = 8 * 60 * 1000; // token expires in 10m server-side — refresh before that

export default function CheckinQr() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const { token } = await apiGet<{ token: string }>("/api/profile/checkin-qr");
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, token, { width: 220, margin: 1 });
        setError(false);
      } catch {
        if (!cancelled) setError(true);
      }
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="card" style={{ textAlign: "center", padding: 16 }}>
      <div className="small muted" style={{ marginBottom: 10 }}>
        QR ДЛЯ ЧЕК-ИНА
      </div>
      {error ? (
        <div className="small muted">Не удалось загрузить код — откройте вкладку ещё раз</div>
      ) : (
        <canvas ref={canvasRef} style={{ borderRadius: 12, maxWidth: "100%" }} />
      )}
      <div className="small muted" style={{ marginTop: 10 }}>
        Покажите организатору на входе
      </div>
    </div>
  );
}
