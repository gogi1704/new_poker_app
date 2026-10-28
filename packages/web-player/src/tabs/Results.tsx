import { useEffect, useState } from "react";
import { Trophy, Calendar, Users, Coins, Swords, Crown, ChevronDown, TrendingUp } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { ResultDetail, ResultsListTournament, ResultsOverview } from "../lib/types.js";
import { formatDateShort, formatLabel, formatMoney } from "../lib/format.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";
import Avatar from "../components/Avatar.js";

export default function Results({ active }: { active: boolean }) {
  const [overview, setOverview] = useState<ResultsOverview | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function load() {
    return apiGet<ResultsOverview>("/api/results").then(setOverview);
  }

  useEffect(() => {
    load();
  }, []);
  useRevalidateOnActive(active, load);

  if (!overview) return <div className="loading">Загрузка…</div>;

  const filtered = overview.tournaments.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) ||
    (t.winner?.nickname.toLowerCase().includes(query.toLowerCase()) ?? false),
  );

  return (
    <div className="section">
      <div className="stat-grid" style={{ marginBottom: 14 }}>
        <div className="stat-tile">
          <div className="value">{overview.totalTournaments}</div>
          <div className="label">Турниров</div>
        </div>
        <div className="stat-tile">
          <div className="value">{overview.totalParticipants}</div>
          <div className="label">Участников</div>
        </div>
        <div className="stat-tile">
          <div className="value" style={{ fontSize: 13 }}>
            {overview.rpsLeader?.nickname ?? "—"}
          </div>
          <div className="label">Лидер RPS</div>
        </div>
      </div>

      <input
        className="card"
        style={{ width: "100%", marginBottom: 14, color: "var(--text)", background: "var(--card-2)" }}
        placeholder="Поиск по турниру или игроку…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {filtered.length === 0 && <div className="empty">Ничего не найдено</div>}
      {filtered.map((t) => (
        <ResultCard
          key={t.id}
          tournament={t}
          expanded={expandedId === t.id}
          onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
        />
      ))}
    </div>
  );
}

function ResultCard({
  tournament: t,
  expanded,
  onToggle,
}: {
  tournament: ResultsListTournament;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="rc-card">
      <div className="rc-head" onClick={onToggle}>
        <div className="icon-badge rc-icon">
          <Trophy size={26} strokeWidth={1.6} />
        </div>
        <div className="rc-head-text">
          <div className="rc-title">{t.name}</div>
          <div className="rc-chip-row">
            <span className="format-chip">{formatLabel(t.format)}</span>
          </div>
          <div className="rc-meta">
            <span className="rc-meta-item">
              <Calendar size={13} color="var(--accent)" />
              {formatDateShort(t.scheduledAt)}
            </span>
            <span className="rc-pipe">|</span>
            <span className="rc-meta-item">
              <Users size={13} color="var(--accent)" />
              {t.playersCount}
            </span>
          </div>
          <div className="rc-stats">
            <span className="rc-pipe">|</span>
            <span className="rc-stat-item">
              <Coins size={14} color="var(--accent)" />
              {formatMoney(t.buyIn)}
            </span>
            {t.format === "knockout" && t.totalKnockouts > 0 && (
              <>
                <span className="rc-pipe">|</span>
                <span className="rc-stat-item">
                  <Swords size={14} color="var(--accent)" />
                  {t.totalKnockouts} KO
                </span>
              </>
            )}
            {t.winner && (
              <>
                <span className="rc-pipe">|</span>
                <span className="rc-winner">
                  <Crown size={14} />
                  {t.winner.nickname}
                </span>
              </>
            )}
          </div>
        </div>
        <div className={`rc-chevron ${expanded ? "open" : ""}`}>
          <ChevronDown size={16} />
        </div>
      </div>
      {expanded && <ResultStandings tournamentId={t.id} />}
    </div>
  );
}

function ResultStandings({ tournamentId }: { tournamentId: string }) {
  const [detail, setDetail] = useState<ResultDetail | null>(null);

  useEffect(() => {
    apiGet<ResultDetail>(`/api/results/${tournamentId}`).then(setDetail);
  }, [tournamentId]);

  if (!detail) return <div className="loading">Загрузка…</div>;

  const ROMAN = ["I", "II", "III"];

  return (
    <div className="section" style={{ paddingTop: 0 }}>
      <div className="row-list">
        {detail.standings.map((s, i) => (
          <div className="standing-row" key={s.playerId}>
            <div className="row" style={{ gap: 10, justifyContent: "flex-start", minWidth: 0 }}>
              <span className={`standing-rank ${i === 0 ? "gold" : i < 3 ? "outline" : "plain"}`}>
                {i < 3 ? ROMAN[i] : s.place}
              </span>
              <Avatar nickname={s.nickname} avatarUrl={s.avatarUrl} />
              <div style={{ minWidth: 0 }}>
                <div className="standing-name">
                  {s.nickname}
                  {i === 0 && <Crown size={13} color="var(--accent)" />}
                </div>
                {s.knockoutsCount > 0 && (
                  <div className="small muted">
                    {s.knockoutsCount} KO · +{s.bountyPoints}
                  </div>
                )}
              </div>
            </div>
            <span className="standing-trend">
              <TrendingUp size={14} />+{s.rpsAwarded}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
