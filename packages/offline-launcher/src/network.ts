import { connect } from "node:net";

const PROBE_HOSTS = ["1.1.1.1", "8.8.8.8"];
const PROBE_PORT = 443;
const PROBE_TIMEOUT_MS = 3000;

// A bare TCP handshake to a well-known IP is enough to prove "there is a
// route to the internet" — no need for a full TLS/HTTP round trip to a
// specific site that might itself be down. Two independent providers
// (Cloudflare + Google) so one outage/geo-block doesn't look like "offline".
function probe(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port: PROBE_PORT, timeout: PROBE_TIMEOUT_MS });
    const finish = (result: boolean) => {
      socket.destroy();
      resolve(result);
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

export async function checkInternet(): Promise<boolean> {
  const results = await Promise.all(PROBE_HOSTS.map(probe));
  return results.some(Boolean);
}

export type NetworkStatus = "online" | "offline";

// Polls for connectivity and calls onChange only on an actual transition —
// except it stays silent on the very first check if that check finds we're
// already online, since that's the expected state and not worth announcing.
export function startNetworkWatcher(onChange: (status: NetworkStatus) => void, intervalMs = 15000): () => void {
  let lastStatus: NetworkStatus | null = null;
  let stopped = false;

  async function tick() {
    if (stopped) return;
    const online = await checkInternet();
    const status: NetworkStatus = online ? "online" : "offline";
    const isFirstCheck = lastStatus === null;
    const changed = status !== lastStatus;
    lastStatus = status;
    if (changed && !(isFirstCheck && status === "online")) onChange(status);
  }

  tick();
  const timer = setInterval(tick, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
