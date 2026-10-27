import { useEffect, useState } from "react";
import { apiGet } from "../lib/api.js";
import type { ProfileResponse, TournamentSummary } from "../lib/types.js";
import { formatDateShort, formatMoney } from "../lib/format.js";
import { useCountdown } from "../lib/useCountdown.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";
import type { Tab } from "../components/BottomNav.js";
import Avatar from "../components/Avatar.js";

export default function Home({ active, onOpenTournament, onNavigate }: {
  active: boolean;
  onOpenTournament: (id: string) => void;
  onNavigate: (tab: Tab) => void;
}) {
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [nextTournament, setNextTournament] = useState<TournamentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    return Promise.all([
      apiGet<ProfileResponse>("/api/profile").catch(() => null),
      apiGet<TournamentSummary[]>("/api/tournaments"),
    ]).then(([p, tournaments]) => {
      setProfile(p);
      setNextTournament(tournaments[0] ?? null);
    });
  }

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, []);
  useRevalidateOnActive(active, load);

  if (loading) return <div className="loading">Загрузка…</div>;

  return (
    <div className="section">
      <div className="card row" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <Avatar nickname={profile?.player.nickname ?? "?"} avatarUrl={profile?.player.avatarUrl ?? null} size={48} fontSize={16} />
          <div>
            <div style={{ fontWeight: 700 }}>{profile?.player.nickname ?? "Гость"}</div>
            <div className="small muted">
              {profile?.rankProgress.current?.name ?? "Newbie"} · {profile?.stats.totalRps ?? 0} RPS
            </div>
          </div>
        </div>
        <span className="badge badge-gold">{profile?.rankProgress.current?.name ?? "NEWBIE"}</span>
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 16 }}>
        <button className="btn btn-secondary" onClick={() => onNavigate("profile")}>
          📷 Мой QR
        </button>
        <button className="btn btn-secondary" onClick={() => onNavigate("profile")}>
          🔍 Сканировать QR
        </button>
      </div>

      {nextTournament ? (
        <div className="tournament-card" onClick={() => onOpenTournament(nextTournament.id)}>
          <Banner tournament={nextTournament} />
        </div>
      ) : (
        <div className="empty">Нет запланированных турниров</div>
      )}
    </div>
  );
}

function Banner({ tournament }: { tournament: TournamentSummary }) {
  const cd = useCountdown(tournament.scheduledAt);
  return (
    <div className="banner">
      <div className="tag">АФИША · {formatDateShort(tournament.scheduledAt)}</div>
      <div className="title">{tournament.name}</div>
      <div className="small muted" style={{ marginTop: 10 }}>
        {cd.isPast
          ? "Турнир начался"
          : `До старта: ${cd.days > 0 ? cd.days + "д " : ""}${String(cd.hours).padStart(2, "0")}:${String(cd.minutes).padStart(2, "0")}:${String(cd.seconds).padStart(2, "0")}`}
      </div>
      <div className="small" style={{ marginTop: 6 }}>
        Взнос {formatMoney(tournament.buyIn)} · Стек {tournament.startingStack.toLocaleString("ru-RU")}
      </div>
    </div>
  );
}
