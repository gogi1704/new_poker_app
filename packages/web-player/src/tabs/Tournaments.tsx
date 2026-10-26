import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../lib/api.js";
import type { TournamentSummary } from "../lib/types.js";
import { formatDateShort, formatLabel, formatMoney } from "../lib/format.js";
import { useCountdown } from "../lib/useCountdown.js";

export default function Tournaments({ onOpen }: { onOpen: (id: string) => void }) {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [formatFilter, setFormatFilter] = useState<string | null>(null);

  useEffect(() => {
    apiGet<TournamentSummary[]>("/api/tournaments")
      .then(setTournaments)
      .finally(() => setLoading(false));
  }, []);

  const formats = useMemo(() => [...new Set(tournaments.map((t) => t.format))], [tournaments]);

  const visible = tournaments
    .filter((t) => (filter === "mine" ? t.isMine : true))
    .filter((t) => (formatFilter ? t.format === formatFilter : true));

  const stats = {
    total: tournaments.length,
    live: tournaments.filter((t) => t.status === "running").length,
    players: tournaments.reduce((sum, t) => sum + Number(t.seatsFilled), 0),
    mine: tournaments.filter((t) => t.isMine).length,
  };

  return (
    <div className="section">
      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ marginBottom: 10 }}>
          <strong>🏆 Турниры</strong>
        </div>
        <div className="stat-grid">
          <StatTile value={stats.total} label="Всего" />
          <StatTile value={stats.live} label="Live" />
          <StatTile value={stats.players} label="Игроков" />
          <StatTile value={stats.mine} label="Мои" />
        </div>
      </div>

      <div className="chip-row" style={{ marginBottom: 8 }}>
        <span className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
          Все
        </span>
        <span className={`chip ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")}>
          ⭐ Мои
        </span>
      </div>
      {formats.length > 1 && (
        <div className="chip-row" style={{ marginBottom: 14 }}>
          <span className={`chip ${!formatFilter ? "active" : ""}`} onClick={() => setFormatFilter(null)}>
            Все форматы
          </span>
          {formats.map((f) => (
            <span
              key={f}
              className={`chip ${formatFilter === f ? "active" : ""}`}
              onClick={() => setFormatFilter(f)}
            >
              {formatLabel(f)}
            </span>
          ))}
        </div>
      )}

      {loading && <div className="loading">Загрузка…</div>}
      {!loading && visible.length === 0 && <div className="empty">Турниров не найдено</div>}
      {visible.map((t) => (
        <TournamentCard key={t.id} tournament={t} onClick={() => onOpen(t.id)} />
      ))}
    </div>
  );
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-tile">
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}

function TournamentCard({ tournament, onClick }: { tournament: TournamentSummary; onClick: () => void }) {
  const cd = useCountdown(tournament.scheduledAt);
  const seatsFilled = Number(tournament.seatsFilled);
  const fillPercent = Math.min(100, Math.round((seatsFilled / tournament.maxSeats) * 100));

  return (
    <div className="tournament-card" onClick={onClick}>
      <div className="banner">
        <div className="tag">
          {formatLabel(tournament.format)} {tournament.isMine && "· ⭐ Я ЗАПИСАН"}
        </div>
        <div className="title">{tournament.name}</div>
        <div className="small muted" style={{ marginTop: 10 }}>
          {formatDateShort(tournament.scheduledAt)} ·{" "}
          {cd.isPast
            ? "идёт"
            : `${cd.days > 0 ? cd.days + "д " : ""}${String(cd.hours).padStart(2, "0")}:${String(cd.minutes).padStart(2, "0")}`}
        </div>
      </div>
      <div className="section" style={{ paddingTop: 10 }}>
        <div className="stat-grid" style={{ marginBottom: 10 }}>
          <StatTile value={Number(tournament.buyIn)} label="Взнос ₽" />
          <StatTile value={tournament.startingStack / 1000} label="Стек K" />
          <StatTile value={seatsFilled} label={`из ${tournament.maxSeats}`} />
        </div>
        <div className="progress-bar">
          <div className="fill" style={{ width: `${fillPercent}%` }} />
        </div>
      </div>
    </div>
  );
}
