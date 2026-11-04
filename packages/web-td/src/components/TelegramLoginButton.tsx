import { useEffect, useRef } from "react";
import type { TelegramWidgetUser } from "../lib/api.js";

declare global {
  interface Window {
    __tdTelegramAuth?: (user: TelegramWidgetUser) => void;
  }
}

// Renders the official Telegram Login Widget (https://core.telegram.org/widgets/login).
// The bot's domain must be registered via @BotFather's /setdomain for this to work,
// and VITE_BOT_USERNAME must be set at build time — see .env.production.example.
export default function TelegramLoginButton({ onAuth }: { onAuth: (user: TelegramWidgetUser) => void }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const botUsername = import.meta.env.VITE_BOT_USERNAME as string | undefined;

  useEffect(() => {
    if (!botUsername || !containerRef.current) return;

    window.__tdTelegramAuth = onAuth;

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "__tdTelegramAuth(user)");
    containerRef.current.appendChild(script);

    return () => {
      delete window.__tdTelegramAuth;
    };
  }, [botUsername, onAuth]);

  if (!botUsername) {
    return (
      <div className="small muted" style={{ textAlign: "center" }}>
        Вход через браузер не настроен (VITE_BOT_USERNAME).
      </div>
    );
  }

  return <div ref={containerRef} />;
}
