import { useEffect, useState } from "react";
import { authenticate, setToken } from "./lib/api.js";
import Header, { type ClubInfo } from "./components/Header.js";
import BottomNav, { type Tab } from "./components/BottomNav.js";
import Home from "./tabs/Home.js";
import Tournaments from "./tabs/Tournaments.js";
import TournamentDetail from "./tabs/TournamentDetail.js";
import Results from "./tabs/Results.js";
import Rating from "./tabs/Rating.js";
import Profile from "./tabs/Profile.js";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready" }
  | { status: "deleted" };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [club, setClub] = useState<ClubInfo | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [openTournamentId, setOpenTournamentId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const initData = tg?.initData;
    if (!initData) {
      setAuth({ status: "error", message: "Открой это приложение через кнопку бота в Telegram." });
      return;
    }

    authenticate(initData)
      .then((data) => {
        setToken(data.token);
        setClub(data.club);
        setAuth({ status: "ready" });
      })
      .catch((err) => setAuth({ status: "error", message: String(err) }));
  }, []);

  if (auth.status === "loading") return <div className="loading">Входим…</div>;
  if (auth.status === "error") return <div className="loading">{auth.message}</div>;
  if (auth.status === "deleted") {
    return <div className="loading">Ваши данные удалены. Чтобы начать заново, откройте бота ещё раз.</div>;
  }

  return (
    <>
      <Header club={club} />
      {/* All tabs stay mounted and are just shown/hidden — each fetches its
          data once, so switching tabs afterward is instant instead of
          re-fetching (and flashing a loading state) on every click. */}
      <div style={{ display: tab === "home" ? "block" : "none" }}>
        <Home key={refreshKey} active={tab === "home"} onOpenTournament={setOpenTournamentId} onNavigate={setTab} />
      </div>
      <div style={{ display: tab === "tournaments" ? "block" : "none" }}>
        <Tournaments key={refreshKey} active={tab === "tournaments"} onOpen={setOpenTournamentId} />
      </div>
      <div style={{ display: tab === "results" ? "block" : "none" }}>
        <Results active={tab === "results"} />
      </div>
      <div style={{ display: tab === "rating" ? "block" : "none" }}>
        <Rating active={tab === "rating"} />
      </div>
      <div style={{ display: tab === "profile" ? "block" : "none" }}>
        <Profile
          key={refreshKey}
          active={tab === "profile"}
          club={club}
          onDeleted={() => setAuth({ status: "deleted" })}
        />
      </div>
      <BottomNav active={tab} onChange={setTab} />
      {openTournamentId && (
        <TournamentDetail
          id={openTournamentId}
          onClose={() => setOpenTournamentId(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}
