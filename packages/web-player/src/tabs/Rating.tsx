import { useEffect, useState } from "react";
import { Sprout, Fish, Repeat2, Swords, BadgeCheck, Crown, Award, type LucideIcon } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { RatingResponse } from "../lib/types.js";
import Avatar from "../components/Avatar.js";

const TIER_ICONS: Record<string, LucideIcon> = {
  Newbie: Sprout,
  Fish: Fish,
  Grinder: Repeat2,
  Shark: Swords,
  Pro: BadgeCheck,
  Legend: Crown,
};

function tierIcon(name: string): LucideIcon {
  return TIER_ICONS[name] ?? Award;
}

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
      <div className="chip-row" style={{ margin: "10px 0 20px", gap: 14 }}>
        {data.rankTiers.map((tier) => {
          const Icon = tierIcon(tier.name);
          return (
            <div key={tier.id} style={{ flexShrink: 0, textAlign: "center", width: 60 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  margin: "0 auto 6px",
                }}
              >
                <Icon size={24} color="var(--accent)" strokeWidth={1.8} />
              </div>
              <div className="small muted" style={{ fontSize: 10 }}>
                {tier.name}
              </div>
            </div>
          );
        })}
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
