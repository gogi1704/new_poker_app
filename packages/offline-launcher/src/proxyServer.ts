import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import httpProxy from "http-proxy";
import { loadConfig } from "./config";

export const PROXY_PORT = 9000;

// Local nginx's bundle (docker-compose.local.yml, web-td service) — same
// static build as the cloud deployment, and the one target non-/api/ paths
// always go to.
const LOCAL_TARGET = "http://localhost:8080";
const CLOUD_TIMEOUT_MS = 5000;

// This is the ONE address the TD (and any other LAN device) should use
// instead of :8080 directly — see docs/OFFLINE.md and Phase 14 of the plan.
// It does not touch sync.ts's own pull/push calls, which keep talking
// directly to cloudApiUrl / localhost:8080 exactly as before; this is purely
// for browser/TD traffic.
//
// Known limitation, accepted rather than engineered around: if a POST's
// body has already started streaming toward the cloud target when the
// connection drops mid-request, the local retry below can't replay it (the
// request stream has already been partially consumed). In practice this
// mode's actual failures are "no route to the cloud at all" (DNS/connect
// refused/timeout), caught before any body bytes are sent — not a
// connection that drops mid-stream.
export function startProxyServer(isOnline: () => boolean): number {
  const proxy = httpProxy.createProxyServer();

  function proxyToLocal(req: IncomingMessage, res: ServerResponse): void {
    proxy.web(req, res, { target: LOCAL_TARGET, changeOrigin: true }, () => {
      if (!res.headersSent) {
        res.writeHead(502, { "Content-Type": "text/plain" });
        res.end("Локальный сервер недоступен");
      } else {
        res.end();
      }
    });
  }

  const server = createServer((req, res) => {
    const config = loadConfig();
    const isApi = req.url?.startsWith("/api/") ?? false;
    const tryCloudFirst = isApi && isOnline() && Boolean(config.cloudApiUrl);

    if (!tryCloudFirst) {
      proxyToLocal(req, res);
      return;
    }

    proxy.web(
      req,
      res,
      { target: config.cloudApiUrl!, changeOrigin: true, timeout: CLOUD_TIMEOUT_MS, proxyTimeout: CLOUD_TIMEOUT_MS },
      () => {
        // A connection-level failure to reach the cloud (refused/timeout/DNS)
        // — an ordinary 4xx/5xx application response never reaches this
        // callback, it's just passed through as a normal response. Only
        // retry locally if nothing has been written to the client yet.
        if (res.headersSent || res.writableEnded) return;
        proxyToLocal(req, res);
      },
    );
  });

  server.listen(PROXY_PORT);
  return PROXY_PORT;
}
