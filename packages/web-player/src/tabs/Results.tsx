import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";
import type { ResultDetail, ResultsOverview } from "../lib/types.js";
import { formatDateShort, formatLabel, formatMoney } from "../lib/format.js";
import Avatar from "../components/Avatar.js";

export default function Results() {
  const [overview, setOverview] = useState<ResultsOverview | null>(null);
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ResultsOverview>("/api/results").then(setOverview);
  }, []);

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
        <div key={t.id} className="tournament-card" style={{ cursor: "default" }}>
          <div
            className="section"
            style={{ cursor: "pointer" }}
            onClick={() => setExpandedId(expandedId === t.id ? null : t.id)}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{t.name}</div>
            <div className="row small muted" style={{ marginBottom: 6 }}>
              <span className="badge">{formatLabel(t.format)}</span>
              <span>{formatDateShort(t.scheduledAt)}</span>
            </div>
            <div className="row small">
              <span className="muted">
                👥 {t.playersCount} · {formatMoney(t.buyIn)}
                {t.format === "knockout" && ` · 💀 ${t.totalKnockouts} KO`}
              </span>
              {t.winner && (
                <span>
                  👑 {t.winner.nickname}
                </span>
              )}
            </div>
          </div>
          {expandedId === t.id && <ResultStandings tournamentId={t.id} />}
        </div>
      ))}
    </div>
  );
}

function ResultStandings({ tournamentId }: { tournamentId: string }) {
  const [detail, setDetail] = useState<ResultDetail | null>(null);

  useEffect(() => {
    apiGet<ResultDetail>(`/api/results/${tournamentId}`).then(setDetail);
  }, [tournamentId]);

  if (!detail) return <div className="loading">Загрузка…</div>;

  return (
    <div className="section" style={{ paddingTop: 0 }}>
      <div className="row-list">
        {detail.standings.map((s, i) => (
          <div className="row-item" key={s.playerId}>
            <div className="row" style={{ gap: 8 }}>
              <span className="rank-medal">{i < 3 ? ["🥇", "🥈", "🥉"][i] : s.place}</span>
              <Avatar nickname={s.nickname} avatarUrl={s.avatarUrl} />
              <div>
                <div className="small">{s.nickname}</div>
                {s.knockoutsCount > 0 && (
                  <div className="small muted">
                    💀 {s.knockoutsCount} +{s.bountyPoints}
                  </div>
                )}
              </div>
            </div>
            <span className="badge badge-gold">+{s.rpsAwarded}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
