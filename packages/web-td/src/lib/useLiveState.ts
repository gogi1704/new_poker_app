import { useEffect, useRef, useState } from "react";
import type { LiveState } from "./liveTypes.js";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3001";

export function useLiveState(tournamentId: string | null) {
  const [state, setState] = useState<LiveState | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!tournamentId) return;
    setState(null);
    setConnected(false);

    // EventSource reconnects on its own after a drop (standard SSE behaviour),
    // so we don't need manual retry logic here.
    const es = new EventSource(`${API_BASE_URL}/api/tournaments/${tournamentId}/stream`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = (e) => setState(JSON.parse(e.data));

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [tournamentId]);

  return { state, connected };
}
