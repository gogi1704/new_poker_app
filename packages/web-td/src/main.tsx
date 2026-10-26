import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.js";
import ClockDisplay from "./views/ClockDisplay.js";
import "./styles.css";

// No router needed for two routes: a plain path check. /clock/:id is public
// (opened directly on a club TV, never through Telegram), everything else
// goes through the normal staff app.
const clockMatch = window.location.pathname.match(/^\/clock\/([^/]+)/);

createRoot(document.getElementById("root")!).render(
  <StrictMode>{clockMatch ? <ClockDisplay tournamentId={clockMatch[1]} /> : <App />}</StrictMode>,
);
