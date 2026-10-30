import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Crown, QrCode, Download } from "lucide-react";
import { apiGet } from "../lib/api.js";
import { exportMembershipCard, exportMembershipCardWithQr } from "../lib/exportCard.js";
import type { ClubInfo } from "./Header.js";

const REFRESH_MS = 8 * 60 * 1000; // token expires in 10m server-side — refresh before that

export default function MembershipCard({
  nickname,
  club,
  membership,
}: {
  nickname: string;
  club: ClubInfo | null;
  membership: { memberLevel: string; cardId: string };
}) {
  const [flipped, setFlipped] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrError, setQrError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const { token } = await apiGet<{ token: string }>("/api/profile/checkin-qr");
        if (cancelled || !canvasRef.current) return;
        await QRCode.toCanvas(canvasRef.current, token, {
          width: 300,
          margin: 1,
          color: { dark: "#2a1f10", light: "#f6efdd" },
        });
        setQrError(false);
      } catch {
        if (!cancelled) setQrError(true);
      }
    }

    refresh();
    const interval = setInterval(refresh, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const cardId = membership.cardId.slice(0, 8).toUpperCase();
  const cardIdSpaced = cardId.replace(/(.{4})/g, "$1 ").trim();
  const clubName = club?.name ?? "Мой Покер Клуб";

  function downloadBack(e: React.MouseEvent) {
    e.stopPropagation();
    exportMembershipCard({ clubName, memberLevel: membership.memberLevel, nickname, cardId: membership.cardId });
  }

  function downloadFront(e: React.MouseEvent) {
    e.stopPropagation();
    const qrDataUrl = canvasRef.current?.toDataURL("image/png");
    exportMembershipCardWithQr(
      { clubName, memberLevel: membership.memberLevel, nickname, cardId: membership.cardId },
      qrDataUrl,
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 6, justifyContent: "flex-start", marginBottom: 8 }}>
        <Crown size={14} color="var(--accent)" />
        <span className="eyebrow" style={{ margin: 0 }}>
          Карта постоянного игрока
        </span>
      </div>
      <div className={`mc-flip ${flipped ? "flipped" : ""}`} onClick={() => setFlipped((f) => !f)}>
        <div className="mc-inner">
          <div className="mc-face mc-front">
            <div className="mc-front-top">
              <div className="mc-qr-frame">
                <div className="mc-qr-corner tl" />
                <div className="mc-qr-corner tr" />
                <div className="mc-qr-corner bl" />
                <div className="mc-qr-corner br" />
                <div className="mc-qr-wrap">
                  {qrError ? (
                    <div className="small muted" style={{ padding: 8 }}>
                      Ошибка
                    </div>
                  ) : (
                    <canvas ref={canvasRef} style={{ width: "100%", height: "100%", borderRadius: 8 }} />
                  )}
                </div>
              </div>
              <div className="mc-front-info">
                <div className="row" style={{ gap: 8, justifyContent: "flex-start" }}>
                  {club?.logoUrl ? (
                    <img src={club.logoUrl} alt="" className="mc-club-logo" />
                  ) : (
                    <div className="mc-club-logo mc-club-logo-fallback">{clubName.slice(0, 1)}</div>
                  )}
                  <div style={{ minWidth: 0 }}>
                    <div className="mc-club-name">{clubName}</div>
                    <div className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {nickname}
                    </div>
                  </div>
                </div>
                <div className="eyebrow" style={{ marginTop: 14 }}>
                  Клубная карта
                </div>
                <div style={{ fontWeight: 700 }}>Покажите QR администратору</div>
                <div className="mc-card-id">{cardIdSpaced}</div>
              </div>
            </div>
            <div className="small muted mc-flip-hint">Нажмите, чтобы перевернуть</div>
          </div>

          <div className="mc-face mc-back">
            <div className="mc-chip" />
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="small muted">Уровень участника</div>
                <div className="mc-level">{membership.memberLevel}</div>
              </div>
              {club?.logoUrl ? (
                <img src={club.logoUrl} alt="" className="mc-club-logo mc-club-logo-round" />
              ) : (
                <div className="mc-club-logo mc-club-logo-fallback mc-club-logo-round">{clubName.slice(0, 1)}</div>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              <div style={{ color: "#fff" }}>{clubName}</div>
              <div className="mc-underline" />
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 6 }}>{nickname}</div>
            </div>
            <div className="mc-back-footer">
              <span className="small muted" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <QrCode size={13} /> Карта
              </span>
              <span className="small muted mc-card-id" style={{ marginTop: 0 }}>
                {cardIdSpaced}
              </span>
            </div>
            <div className="mc-back-actions">
              <button type="button" className="btn btn-secondary" onClick={downloadBack}>
                <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Скачать лицевую
              </button>
              <button type="button" className="btn btn-secondary" onClick={downloadFront}>
                <Download size={14} style={{ marginRight: 6, verticalAlign: -2 }} />
                Скачать с QR
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
