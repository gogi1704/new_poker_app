import { Clock, Users, Zap } from "lucide-react";
import type { TournamentSummary } from "../lib/types.js";
import { formatLabel, formatMoney } from "../lib/format.js";
import TournamentArt from "./TournamentArt.js";

const STATUS_META: Record<string, { label: string; className: string }> = {
  running: { label: "LIVE", className: "status-pill-live" },
  paused: { label: "ПАУЗА", className: "status-pill-paused" },
  registering: { label: "РЕГИСТРАЦИЯ", className: "status-pill-reg" },
  scheduled: { label: "СКОРО", className: "status-pill-soon" },
};

function ticketDate(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("ru-RU", { weekday: "short" }).replace(".", "").toUpperCase();
  const day = d.getDate();
  const month = d.toLocaleDateString("ru-RU", { month: "short" }).replace(".", "").toUpperCase();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return { weekday, day, month, time };
}

export default function TournamentCard({
  tournament,
  onClick,
}: {
  tournament: TournamentSummary;
  onClick: () => void;
}) {
  const seatsFilled = Number(tournament.seatsFilled);
  const fillPercent = Math.min(100, Math.round((seatsFilled / tournament.maxSeats) * 100));
  const remaining = Math.max(0, tournament.maxSeats - seatsFilled);
  const { weekday, day, month, time } = ticketDate(tournament.scheduledAt);
  const status = STATUS_META[tournament.status] ?? {
    label: tournament.status.toUpperCase(),
    className: "status-pill-soon",
  };

  return (
    <div className="tournament-card" onClick={onClick}>
      <div className="tc-ticket">
        <div className="tc-date-stub">
          <div className="tc-eyebrow-line">АФИША</div>
          <div className="tc-weekday">{weekday}</div>
          <div className="tc-day">{day}</div>
          <div className="tc-month">{month}</div>
          <div className="tc-time">
            <Clock size={11} />
            {time}
          </div>
        </div>
        <div className="tc-art-panel">
          <TournamentArt format={tournament.format} />
          <div className="tc-art-content">
            <div className="tc-art-top">
              <span className="format-chip">{formatLabel(tournament.format)}</span>
              <div className="tc-art-badges">
                {tournament.isMine && <span className="format-chip format-chip-accent">★ Я</span>}
                <span className={`status-pill ${status.className}`}>{status.label}</span>
              </div>
            </div>
            <div className="tc-name">{tournament.name}</div>
          </div>
        </div>
      </div>

      <div className="tc-stats-grid">
        <div className="tc-stat">
          <div className="tc-stat-label">ВЗНОС</div>
          <div className="tc-stat-value">{formatMoney(tournament.buyIn)}</div>
        </div>
        <div className="tc-stat">
          <div className="tc-stat-label">СТЕК</div>
          <div className="tc-stat-value">
            {tournament.startingStack / 1000}
            <small>K</small>
          </div>
        </div>
        {tournament.reentryPrice && (
          <div className="tc-stat">
            <div className="tc-stat-label">RE</div>
            <div className="tc-stat-value">{formatMoney(tournament.reentryPrice)}</div>
          </div>
        )}
        <div className="tc-stat tc-stat-accent">
          <div className="tc-stat-label">
            <Zap size={11} /> KO
          </div>
          <div className="tc-stat-value">{tournament.rpsFormulaParams.knockoutPoints} RPS</div>
        </div>
      </div>

      <div className="tc-seats-row">
        <span className="tc-meta-item">
          <Users size={13} color="var(--accent)" />
          {seatsFilled} / {tournament.maxSeats}
        </span>
        <span className="tc-remaining">ОСТАЛОСЬ {remaining}</span>
      </div>

      <div className="progress-bar tc-progress">
        <div className="fill" style={{ width: `${fillPercent}%` }} />
      </div>

      <button type="button" className="tc-cta">
        <span className="tc-cta-dot" /> СМОТРЕТЬ
      </button>
    </div>
  );
}
