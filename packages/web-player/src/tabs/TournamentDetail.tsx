import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../lib/api.js";
import type { TournamentDetail as TournamentDetailT } from "../lib/types.js";
import { formatDateTime, formatLabel, formatMoney } from "../lib/format.js";
import { useCountdown } from "../lib/useCountdown.js";
import Avatar from "../components/Avatar.js";

export default function TournamentDetail({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [tournament, setTournament] = useState<TournamentDetailT | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const load = () => apiGet<TournamentDetailT>(`/api/tournaments/${id}`).then(setTournament);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleRegister() {
    setSubmitting(true);
    setRegisterError(null);
    try {
      await apiPost(`/api/tournaments/${id}/register`, {});
      await load();
      onChanged?.();
    } catch (err) {
      setRegisterError(String((err as Error).message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnregister() {
    setSubmitting(true);
    setRegisterError(null);
    try {
      await apiPost(`/api/tournaments/${id}/unregister`, {});
      await load();
      onChanged?.();
    } catch (err) {
      setRegisterError(String((err as Error).message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ marginBottom: 10 }}>
          <span className="badge badge-gold">{tournament ? formatLabel(tournament.format) : "…"}</span>
          <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 12px" }} onClick={onClose}>
            ✕
          </button>
        </div>

        {!tournament ? (
          <div className="loading">Загрузка…</div>
        ) : (
          <>
            <h2 style={{ margin: "0 0 4px" }}>{tournament.name}</h2>
            <div className="muted small" style={{ marginBottom: 14 }}>
              {formatDateTime(tournament.scheduledAt)} МСК
            </div>

            <Countdown scheduledAt={tournament.scheduledAt} free={tournament.maxSeats - tournament.participants.length} />

            <div className="card" style={{ margin: "14px 0" }}>
              <div className="stat-grid">
                <Stat label="Взнос" value={formatMoney(tournament.buyIn)} />
                <Stat label="Стек" value={`${(tournament.startingStack / 1000).toFixed(0)}K`} />
                <Stat label="Мест" value={`${tournament.participants.length}/${tournament.maxSeats}`} />
                <Stat label="RPS" value={`+${tournament.rpsFormulaParams.knockoutPoints}/KO`} />
              </div>
            </div>

            {(tournament.reentryPrice || tournament.addonPrice || tournament.arriveBonusStack > 0) && (
              <div className="card" style={{ marginBottom: 14 }}>
                <strong className="small">🔁 Дополнительные опции</strong>
                <div className="row-list" style={{ marginTop: 8 }}>
                  {tournament.reentryPrice && (
                    <div className="row small">
                      <span className="muted">RE-ENTRY (до ур. {tournament.reentryAllowedUntilLevel})</span>
                      <span>{formatMoney(tournament.reentryPrice)}</span>
                    </div>
                  )}
                  {tournament.addonPrice && (
                    <div className="row small">
                      <span className="muted">ADD-ON (ур. {tournament.addonAvailableLevel})</span>
                      <span>{formatMoney(tournament.addonPrice)}</span>
                    </div>
                  )}
                  {tournament.arriveBonusStack > 0 && (
                    <div className="row small">
                      <span className="muted">Бонус за приход вовремя</span>
                      <span>+{tournament.arriveBonusStack.toLocaleString("ru-RU")}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="card" style={{ marginBottom: 14 }}>
              <strong className="small">👥 Участники ({tournament.participants.length})</strong>
              <div className="row-list" style={{ marginTop: 8 }}>
                {tournament.participants.length === 0 && <div className="muted small">Пока никто не записался</div>}
                {tournament.participants.map((p, i) => (
                  <div className="row-item" key={p.playerId}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="rank-medal">{i < 3 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                      <Avatar nickname={p.nickname} avatarUrl={p.avatarUrl} />
                      <span>{p.nickname}</span>
                    </div>
                    <span className="badge">{p.totalRps} RPS</span>
                  </div>
                ))}
              </div>
            </div>

            {tournament.myRegistration && tournament.myRegistration.status !== "cancelled" ? (
              <>
                <button className="btn btn-secondary" disabled={submitting}>
                  ✓ Вы записаны
                </button>
                <button
                  className="small muted"
                  style={{ display: "block", margin: "10px auto 0", background: "none", border: "none" }}
                  disabled={submitting}
                  onClick={handleUnregister}
                >
                  Отменить запись
                </button>
              </>
            ) : (
              <button
                className="btn btn-primary"
                disabled={submitting || tournament.participants.length >= tournament.maxSeats}
                onClick={handleRegister}
              >
                {submitting
                  ? "Записываем…"
                  : tournament.participants.length >= tournament.maxSeats
                    ? "Мест нет"
                    : "✍️ Записаться на турнир"}
              </button>
            )}
            {registerError && (
              <div className="small" style={{ textAlign: "center", marginTop: 8, color: "var(--danger)" }}>
                {registerError}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Countdown({ scheduledAt, free }: { scheduledAt: string; free: number }) {
  const cd = useCountdown(scheduledAt);
  return (
    <div className="card row">
      <div>
        <div className="muted small">ДО СТАРТА</div>
        <div style={{ fontWeight: 700, fontSize: 16 }}>
          {cd.isPast
            ? "Уже идёт"
            : `${cd.days > 0 ? cd.days + "д " : ""}${cd.hours}ч ${cd.minutes}м`}
        </div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div className="muted small">СВОБОДНО</div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "var(--accent)" }}>{Math.max(0, free)}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-tile">
      <div className="value" style={{ fontSize: 14 }}>
        {value}
      </div>
      <div className="label">{label}</div>
    </div>
  );
}
