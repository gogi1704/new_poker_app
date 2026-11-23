import { useEffect, useState } from "react";
import { authenticate, getToken, magicLinkLogin, setSessionExpiredHandler, setToken } from "./lib/api.js";
import Header, { type ClubInfo } from "./components/Header.js";
import LoadingScreen from "./components/LoadingScreen.js";
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
    // Only the stored-session fast path below skips re-validating the token
    // up front, so an expired one otherwise only surfaces as a 401 on
    // whichever tab happens to fetch first — this sends the whole app back
    // to the login screen instead of that tab silently rendering empty.
    setSessionExpiredHandler(() =>
      setAuth({
        status: "error",
        message: "Сессия истекла. Открой приложение через кнопку бота в Telegram ещё раз.",
      }),
    );
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const initData = tg?.initData;
    if (initData) {
      authenticate(initData)
        .then((data) => {
          setToken(data.token);
          setClub(data.club);
          setAuth({ status: "ready" });
          const deepLinkId = new URLSearchParams(window.location.search).get("tournament");
          if (deepLinkId) setOpenTournamentId(deepLinkId);
        })
        .catch((err) => setAuth({ status: "error", message: String(err) }));
      return;
    }

    // Standalone site, opened outside Telegram's WebView (see "🌐 Открыть
    // сайт" button in packages/bot/src/commands/start.ts): a fresh visit
    // from that link carries a one-time ?login= ticket; a later revisit
    // reuses the still-valid stored session instead (see lib/api.ts
    // getToken/setToken — same persistence pattern web-td uses for its own
    // browser login).
    const loginToken = new URLSearchParams(window.location.search).get("login");
    if (loginToken) {
      magicLinkLogin(loginToken)
        .then((data) => {
          setToken(data.token);
          setClub(data.club);
          setAuth({ status: "ready" });
          // Never leave the one-time ticket sitting in the address bar.
          window.history.replaceState({}, "", window.location.pathname);
        })
        .catch((err) => setAuth({ status: "error", message: String((err as Error).message ?? err) }));
      return;
    }

    if (getToken()) {
      setAuth({ status: "ready" });
      return;
    }

    setAuth({
      status: "error",
      message: "Открой это приложение через кнопку бота в Telegram (или ссылку «Открыть сайт» из /start).",
    });
  }, []);

  if (auth.status === "loading") return <LoadingScreen text="ВХОДИМ…" />;
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
