import { useEffect, useState } from "react";
import { QrCode, User, ChevronRight, type LucideIcon } from "lucide-react";
import { apiGet } from "../lib/api.js";
import type { ProfileResponse, TournamentSummary } from "../lib/types.js";
import { useRevalidateOnActive } from "../lib/useRevalidateOnActive.js";
import type { Tab } from "../components/BottomNav.js";
import UserPanel from "../components/UserPanel.js";
import TournamentCard from "../components/TournamentCard.js";

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
      {profile && <UserPanel profile={profile} />}

      <div className="quick-grid" style={{ marginBottom: 16 }}>
        <QuickCard icon={QrCode} title="Мой QR" subtitle="Для чек-ина" onClick={() => onNavigate("profile")} />
        <QuickCard icon={User} title="Профиль" subtitle="Карта, статистика" onClick={() => onNavigate("profile")} />
      </div>

      {nextTournament ? (
        <TournamentCard tournament={nextTournament} onClick={() => onOpenTournament(nextTournament.id)} />
      ) : (
        <div className="empty">Нет запланированных турниров</div>
      )}
    </div>
  );
}

function QuickCard({
  icon: Icon,
  title,
  subtitle,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  onClick: () => void;
}) {
  return (
    <div className="quick-card" onClick={onClick}>
      <div className="icon-badge">
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <button className="chevron-btn" onClick={onClick} tabIndex={-1} aria-hidden="true">
        <ChevronRight size={14} />
      </button>
      <div className="title">{title}</div>
      <div className="subtitle">{subtitle}</div>
    </div>
  );
}
