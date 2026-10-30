import { useEffect, useMemo, useState } from "react";
import { Trophy, Activity, Users, Star, List, Calendar, type LucideIcon } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { TournamentDetail, TournamentSummary } from "../lib/types.js";
import { formatLabel } from "../lib/format.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";
import { setCachedTournamentDetail } from "../lib/tournamentDetailCache.js";
import TournamentCard from "../components/TournamentCard.js";

function groupByDate(list: TournamentSummary[]) {
  const groups = new Map<string, TournamentSummary[]>();
  for (const t of list) {
    const key = new Date(t.scheduledAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" });
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.entries()];
}

export default function Tournaments({ active, onOpen }: { active: boolean; onOpen: (id: string) => void }) {
  const [tournaments, setTournaments] = useState<TournamentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "mine">("all");
  const [formatFilter, setFormatFilter] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");

  function load() {
    return apiGet<TournamentSummary[]>("/api/tournaments").then((list) => {
      setTournaments(list);
      // Warm the detail cache (participants included) right after the list
      // lands, so opening any tournament card is instant instead of showing
      // its own "Загрузка…" while TournamentDetail fetches from scratch.
      for (const t of list) {
        apiGet<TournamentDetail>(`/api/tournaments/${t.id}`).then(setCachedTournamentDetail).catch(() => {});
      }
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);
  useRevalidateOnActive(active, load);

  const formats = useMemo(() => [...new Set(tournaments.map((t) => t.format))], [tournaments]);
  const formatCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tournaments) counts[t.format] = (counts[t.format] ?? 0) + 1;
    return counts;
  }, [tournaments]);

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
        <div className="row" style={{ gap: 14 }}>
          <div className="icon-badge th-icon">
            <Trophy size={28} strokeWidth={1.6} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="eyebrow" style={{ marginBottom: 2 }}>
              РАСПИСАНИЕ
            </div>
            <div className="th-title">Турниры</div>
          </div>
          <div className="th-count-badge">{stats.total}</div>
        </div>
        <div className="stat-grid" style={{ marginTop: 16 }}>
          <StatTile icon={Trophy} value={stats.total} label="Всего" />
          <StatTile icon={Activity} value={stats.live} label="Live" live={stats.live > 0} />
          <StatTile icon={Users} value={stats.players} label="Игроков" />
          <StatTile icon={Star} value={stats.mine} label="Мои" />
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ gap: 8 }}>
          <div className="chip-row" style={{ flex: 1 }}>
            <span className={`chip ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>
              Все
            </span>
            <span className={`chip ${filter === "mine" ? "active" : ""}`} onClick={() => setFilter("mine")}>
              <Star size={12} /> Мои
            </span>
          </div>
          <div className="view-toggle">
            <button
              type="button"
              className={`view-toggle-btn ${view === "list" ? "active" : ""}`}
              onClick={() => setView("list")}
              aria-label="Список"
            >
              <List size={16} />
            </button>
            <button
              type="button"
              className={`view-toggle-btn ${view === "calendar" ? "active" : ""}`}
              onClick={() => setView("calendar")}
              aria-label="По датам"
            >
              <Calendar size={16} />
            </button>
          </div>
        </div>
        {formats.length > 1 && (
          <div className="chip-row" style={{ marginTop: 10 }}>
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
                <span className="chip-count">{formatCounts[f]}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {loading && <div className="loading">Загрузка…</div>}
      {!loading && visible.length === 0 && <div className="empty">Турниров не найдено</div>}
      {view === "list"
        ? visible.map((t) => <TournamentCard key={t.id} tournament={t} onClick={() => onOpen(t.id)} />)
        : groupByDate(visible).map(([date, items]) => (
            <div key={date}>
              <div className="eyebrow" style={{ marginTop: 6 }}>
                {date}
              </div>
              {items.map((t) => (
                <TournamentCard key={t.id} tournament={t} onClick={() => onOpen(t.id)} />
              ))}
            </div>
          ))}
    </div>
  );
}

function StatTile({
  icon: Icon,
  value,
  label,
  live,
}: {
  icon?: LucideIcon;
  value: number;
  label: string;
  live?: boolean;
}) {
  return (
    <div className="stat-tile">
      {Icon && (
        <div className="icon">
          <Icon size={18} />
          {live && <span className="icon-dot" />}
        </div>
      )}
      <div className="value">{value}</div>
      <div className="label">{label}</div>
    </div>
  );
}
