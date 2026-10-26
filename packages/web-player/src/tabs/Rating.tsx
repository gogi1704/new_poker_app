import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";
import type { RatingResponse } from "../lib/types.js";
import Avatar from "../components/Avatar.js";

export default function Rating() {
  const [data, setData] = useState<RatingResponse | null>(null);

  useEffect(() => {
    apiGet<RatingResponse>("/api/rating").then(setData);
  }, []);

  if (!data) return <div className="loading">Загрузка…</div>;

  return (
    <div className="section">
      <div style={{ marginBottom: 6, fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>
        — PROGRESS
      </div>
      <strong>Ранги</strong>
      <div className="chip-row" style={{ margin: "10px 0 20px" }}>
        {data.rankTiers.map((tier) => (
          <div
            key={tier.id}
            style={{
              flexShrink: 0,
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--card-2)",
              border: "2px solid var(--border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              textAlign: "center",
              padding: 4,
            }}
            title={tier.name}
          >
            {tier.name}
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 6, fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>
        — LEADERBOARD
      </div>
      <strong>Пьедестал</strong>
      <div className="row" style={{ alignItems: "flex-end", gap: 10, margin: "14px 0 20px" }}>
        {data.podium[1] && <Podium row={data.podium[1]} place={2} />}
        {data.podium[0] && <Podium row={data.podium[0]} place={1} big />}
        {data.podium[2] && <Podium row={data.podium[2]} place={3} />}
      </div>

      <div style={{ marginBottom: 6, fontSize: 11, color: "var(--muted)", letterSpacing: "0.04em" }}>
        — STANDINGS
      </div>
      <strong>Таблица рейтинга</strong>
      <div className="row-list" style={{ marginTop: 10, marginBottom: 20 }}>
        {data.standings.map((row) => (
          <div className="row-item" key={row.playerId}>
            <div className="row" style={{ gap: 10 }}>
              <span className="rank-medal">{row.rank}</span>
              <Avatar nickname={row.nickname} avatarUrl={row.avatarUrl} />
              <div>
                <div className="small">{row.nickname}</div>
                <div className="small muted">{row.gamesPlayed} игр</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="small">{row.wins} побед</div>
              <strong style={{ color: "var(--accent)" }}>{row.totalRps} RPS</strong>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Podium({ row, place, big }: { row: RatingResponse["podium"][number]; place: number; big?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <Avatar
        nickname={row.nickname}
        avatarUrl={row.avatarUrl}
        size={big ? 56 : 44}
        fontSize={big ? 18 : 14}
        style={{ margin: "0 auto 6px", border: big ? "2px solid var(--accent)" : "1px solid var(--border)" }}
      />
      <div className="small" style={{ fontWeight: 700 }}>
        {place}
      </div>
      <div className="small">{row.nickname}</div>
      <div className="small muted">{row.totalRps} RPS</div>
    </div>
  );
}
