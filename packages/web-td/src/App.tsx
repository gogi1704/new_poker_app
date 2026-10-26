import { useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { authenticate, setToken, apiGet } from "./lib/api.js";
import TournamentList from "./views/TournamentList.js";
import TournamentForm from "./views/TournamentForm.js";
import LiveConsole from "./views/LiveConsole.js";
import PublishResults from "./views/PublishResults.js";

type AuthState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; club: { id: string; name: string }; role: string };

type View =
  | { name: "list" }
  | { name: "create" }
  | { name: "edit"; id: string }
  | { name: "live"; id: string }
  | { name: "publish"; id: string };

export default function App() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [view, setView] = useState<View>({ name: "list" });
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();

    const initData = tg?.initData;
    if (!initData) {
      setAuth({ status: "error", message: "Откройте панель через команду /td в боте клуба." });
      return;
    }

    authenticate(initData)
      .then((data) => {
        setToken(data.token);
        return apiGet<{ club: { id: string; name: string }; staff: { role: string } }>("/api/td/me");
      })
      .then((me) => setAuth({ status: "ready", club: me.club, role: me.staff.role }))
      .catch((err) => setAuth({ status: "error", message: String((err as Error).message ?? err) }));
  }, []);

  if (auth.status === "loading") return <div className="loading">Входим…</div>;
  if (auth.status === "error") return <div className="loading">{auth.message}</div>;

  function closeToList() {
    setView({ name: "list" });
    setRefreshKey((k) => k + 1);
  }

  return (
    <>
      <div className="header">
        <div>
          <div className="title row" style={{ gap: 8, width: "auto" }}>
            <Settings size={18} /> {auth.club.name}
          </div>
          <div className="sub">TD-панель · роль: {auth.role}</div>
        </div>
      </div>

      {view.name === "list" && (
        <TournamentList
          key={refreshKey}
          onCreate={() => setView({ name: "create" })}
          onEdit={(id) => setView({ name: "edit", id })}
          onOpenLive={(id) => setView({ name: "live", id })}
        />
      )}
      {view.name === "create" && <TournamentForm onDone={closeToList} onCancel={closeToList} />}
      {view.name === "edit" && <TournamentForm tournamentId={view.id} onDone={closeToList} onCancel={closeToList} />}
      {view.name === "live" && (
        <LiveConsole
          tournamentId={view.id}
          onClose={closeToList}
          onPublish={() => setView({ name: "publish", id: view.id })}
        />
      )}
      {view.name === "publish" && (
        <PublishResults tournamentId={view.id} onDone={closeToList} onCancel={() => setView({ name: "live", id: view.id })} />
      )}
    </>
  );
}
