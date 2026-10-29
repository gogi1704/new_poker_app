import { useEffect, useState } from "react";
import {
  Sprout,
  Fish,
  Repeat2,
  Swords,
  BadgeCheck,
  Crown,
  Award,
  Hexagon,
  Lock,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { RatingResponse, ProfileResponse, RankTier } from "../lib/types.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";
import Avatar from "../components/Avatar.js";
import SectionHeading from "../components/SectionHeading.js";

const ROMAN = ["I", "II", "III"];

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

function tierValue(tier: RankTier, stats: ProfileResponse["stats"]): number {
  return tier.thresholdType === "games" ? stats.gamesPlayed : stats.totalRps;
}

export default function Rating({ active }: { active: boolean }) {
  const [data, setData] = useState<RatingResponse | null>(null);
  const [myStats, setMyStats] = useState<ProfileResponse["stats"] | null>(null);
  const [selectedTier, setSelectedTier] = useState<RankTier | null>(null);

  function load() {
    return Promise.all([
      apiGet<RatingResponse>("/api/rating").then(setData),
      apiGet<ProfileResponse>("/api/profile")
        .then((p) => setMyStats(p.stats))
        .catch(() => {}),
    ]);
  }

  useEffect(() => {
    load();
  }, []);
  useRevalidateOnActive(active, load);

  if (!data) return <div className="loading">Загрузка…</div>;

  const unlockedCount = myStats
    ? data.rankTiers.filter((t) => tierValue(t, myStats) >= t.thresholdValue).length
    : 0;

  return (
    <div className="section">
      {selectedTier && (
        <RankTierModal
          tier={selectedTier}
          myValue={myStats ? tierValue(selectedTier, myStats) : 0}
          onClose={() => setSelectedTier(null)}
        />
      )}

      <SectionHeading eyebrow="PROGRESS" title="Ранги" />
      <div className="row small muted" style={{ marginBottom: 10 }}>
        <span>Статусы</span>
        <span>
          {unlockedCount}/{data.rankTiers.length}
        </span>
      </div>
      <div className="chip-row" style={{ margin: "0 0 20px", gap: 14 }}>
        {data.rankTiers.map((tier) => {
          const Icon = tierIcon(tier.name);
          const value = myStats ? tierValue(tier, myStats) : 0;
          const unlocked = value >= tier.thresholdValue;
          return (
            <div
              key={tier.id}
              style={{ flexShrink: 0, textAlign: "center", width: 60 }}
              onClick={() => setSelectedTier(tier)}
            >
              <div className={`tier-circle ${unlocked ? "" : "locked"}`}>
                <Icon size={24} color={unlocked ? "var(--accent)" : "var(--muted)"} strokeWidth={1.8} />
                {!unlocked && (
                  <div className="tier-lock-badge">
                    <Lock size={10} />
                  </div>
                )}
              </div>
              <div className="small muted" style={{ fontSize: 10 }}>
                {tier.name}
              </div>
            </div>
          );
        })}
      </div>

      <SectionHeading eyebrow="LEADERBOARD" title="Пьедестал" />
      <div className="podium-row">
        {data.podium[1] && <Podium row={data.podium[1]} place={2} />}
        {data.podium[0] && <Podium row={data.podium[0]} place={1} big />}
        {data.podium[2] && <Podium row={data.podium[2]} place={3} />}
      </div>

      <SectionHeading eyebrow="STANDINGS" title="Таблица рейтинга" />
      <div className="row-list" style={{ marginBottom: 20 }}>
        {data.standings.map((row) => (
          <div className="standing-row" key={row.playerId}>
            <div className="row" style={{ gap: 12, justifyContent: "flex-start", minWidth: 0 }}>
              <span className={`standing-rank ${row.rank === 1 ? "gold" : row.rank <= 3 ? "outline" : "plain"}`}>
                {row.rank <= 3 ? ROMAN[row.rank - 1] : row.rank}
              </span>
              <Avatar
                nickname={row.nickname}
                avatarUrl={row.avatarUrl}
                size={52}
                style={{ marginLeft: row.rank <= 3 ? -16 : 0, zIndex: 2, border: "2px solid var(--bg)" }}
              />
              <div style={{ minWidth: 0 }}>
                <div className="standing-name">
                  {row.nickname}
                  {row.rank === 1 && <Crown size={15} color="var(--accent)" />}
                </div>
                <div className="small muted">
                  {row.gamesPlayed} игр · {row.wins} побед
                </div>
              </div>
            </div>
            <span className="standing-trend">
              <Zap size={16} />
              {row.totalRps} RPS
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Podium({ row, place, big }: { row: RatingResponse["podium"][number]; place: number; big?: boolean }) {
  return (
    <div className={`podium-card ${place === 1 ? "first" : ""}`}>
      <div className="podium-avatar-wrap">
        <div className="avatar-ring">
          <Avatar
            nickname={row.nickname}
            avatarUrl={row.avatarUrl}
            size={big ? 64 : 52}
            fontSize={big ? 22 : 16}
          />
        </div>
        <div className="podium-rank-badge">{place}</div>
      </div>
      <div className="nickname">{row.nickname}</div>
      <div className="rps">
        <Hexagon size={12} />
        {row.totalRps}
      </div>
    </div>
  );
}

function RankTierModal({
  tier,
  myValue,
  onClose,
}: {
  tier: RankTier;
  myValue: number;
  onClose: () => void;
}) {
  const Icon = tierIcon(tier.name);
  const unlocked = myValue >= tier.thresholdValue;
  const percent = Math.min(100, Math.round((myValue / tier.thresholdValue) * 100));
  const unitLabel = tier.thresholdType === "games" ? "игр" : "RPS";

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div className="tier-circle" style={{ width: 72, height: 72, margin: "0 auto 12px", cursor: "default" }}>
            <Icon size={32} color="var(--accent)" strokeWidth={1.8} />
          </div>
          <strong style={{ fontSize: 20 }}>{tier.name}</strong>
        </div>
        <div className="small muted" style={{ textAlign: "center", marginBottom: 14 }}>
          {unlocked
            ? "Ранг получен!"
            : tier.thresholdType === "games"
              ? `Сыграйте ${tier.thresholdValue} игр, чтобы получить этот ранг`
              : `Наберите ${tier.thresholdValue} RPS, чтобы получить этот ранг`}
        </div>
        <div className="progress-bar">
          <div className="fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="small muted" style={{ textAlign: "center", marginTop: 8 }}>
          {Math.min(myValue, tier.thresholdValue)} / {tier.thresholdValue} {unitLabel} · {percent}%
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 18 }} onClick={onClose}>
          Закрыть
        </button>
      </div>
    </div>
  );
}
