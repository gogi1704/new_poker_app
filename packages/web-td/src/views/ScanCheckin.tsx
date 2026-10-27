import { useState } from "react";
import { X, QrCode, CheckCircle2 } from "lucide-react";
import { apiPost } from "../lib/api.js";
import { formatDateDisplay, statusLabel, initials } from "../lib/format.js";
import QrScanner from "../components/QrScanner.js";

interface ScannedTournament {
  id: string;
  name: string;
  status: string;
  scheduledAt: string;
  myStatus: "none" | "registered" | "checked_in" | "active" | "eliminated" | "cancelled";
}

interface ScanResult {
  player: { id: string; nickname: string; avatarUrl: string | null };
  tournaments: ScannedTournament[];
}

export default function ScanCheckin({ onClose }: { onClose: () => void }) {
  const [scanning, setScanning] = useState(true);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleScan(token: string) {
    setScanning(false);
    setError(null);
    try {
      const data = await apiPost<ScanResult>("/api/td/scan", { token });
      setResult(data);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    }
  }

  function patchStatus(tournamentId: string, myStatus: ScannedTournament["myStatus"]) {
    setResult((r) =>
      r ? { ...r, tournaments: r.tournaments.map((t) => (t.id === tournamentId ? { ...t, myStatus } : t)) } : r,
    );
  }

  async function handleRegister(t: ScannedTournament) {
    if (!result) return;
    setBusyId(t.id);
    setError(null);
    try {
      await apiPost(`/api/td/tournaments/${t.id}/register-player`, { playerId: result.player.id });
      patchStatus(t.id, "registered");
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusyId(null);
    }
  }

  async function handleCheckin(t: ScannedTournament) {
    if (!result) return;
    setBusyId(t.id);
    setError(null);
    try {
      await apiPost(`/api/td/tournaments/${t.id}/checkin`, { playerId: result.player.id, checkedIn: true });
      patchStatus(t.id, "checked_in");
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setBusyId(null);
    }
  }

  function scanNext() {
    setResult(null);
    setError(null);
    setScanning(true);
  }

  return (
    <div className="section">
      {scanning && <QrScanner onScan={handleScan} onClose={onClose} />}

      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Стойка регистрации</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!result && !scanning && (
        <button className="btn btn-primary" onClick={scanNext}>
          <QrCode size={16} style={{ marginRight: 6, verticalAlign: -3 }} />
          Сканировать QR игрока
        </button>
      )}

      {result && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="row" style={{ gap: 10 }}>
              {result.player.avatarUrl ? (
                <img
                  src={result.player.avatarUrl}
                  alt=""
                  style={{ width: 44, height: 44, borderRadius: "50%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: "50%",
                    background: "var(--card-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    fontWeight: 700,
                    color: "var(--accent)",
                    flexShrink: 0,
                  }}
                >
                  {initials(result.player.nickname)}
                </div>
              )}
              <strong>{result.player.nickname}</strong>
            </div>
          </div>

          <strong className="small muted">ТУРНИРЫ</strong>
          <div className="row-list" style={{ marginTop: 10, marginBottom: 20 }}>
            {result.tournaments.length === 0 && <div className="empty">Нет открытых турниров</div>}
            {result.tournaments.map((t) => (
              <div className="row-item" key={t.id}>
                <div>
                  <div className="small">{t.name}</div>
                  <div className="small muted">
                    {formatDateDisplay(t.scheduledAt)} · {statusLabel(t.status)}
                  </div>
                </div>
                {(t.myStatus === "none" || t.myStatus === "cancelled") && (
                  <button
                    className="btn btn-primary"
                    style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                    disabled={busyId === t.id}
                    onClick={() => handleRegister(t)}
                  >
                    Зарегистрировать
                  </button>
                )}
                {t.myStatus === "registered" && (
                  <button
                    className="btn btn-secondary"
                    style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
                    disabled={busyId === t.id}
                    onClick={() => handleCheckin(t)}
                  >
                    Подтвердить присутствие
                  </button>
                )}
                {(t.myStatus === "checked_in" || t.myStatus === "active") && (
                  <span className="small muted" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <CheckCircle2 size={14} /> На месте
                  </span>
                )}
                {t.myStatus === "eliminated" && <span className="small muted">Выбыл</span>}
              </div>
            ))}
          </div>

          <button className="btn btn-secondary" onClick={scanNext}>
            Сканировать следующего
          </button>
        </>
      )}
    </div>
  );
}
