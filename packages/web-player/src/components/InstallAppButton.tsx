import { useEffect, useState } from "react";
import { Download } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export default function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(isStandalone());
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (installed) return;
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, [installed]);

  if (installed) return null;
  if (!deferredPrompt && !isIos()) return null;

  async function handleClick() {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") setInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    setShowIosHint(true);
  }

  return (
    <div className="row small" style={{ marginBottom: 12, flexWrap: "wrap" }}>
      <span className="row" style={{ gap: 6, width: "auto" }}>
        <Download size={16} /> Установить приложение
      </span>
      <button
        className="btn btn-secondary"
        style={{ width: "auto", padding: "6px 12px", fontSize: 12 }}
        onClick={handleClick}
      >
        Установить
      </button>
      {showIosHint && (
        <div className="small muted" style={{ width: "100%", marginTop: 8 }}>
          Нажмите «Поделиться» внизу браузера и выберите «На экран «Домой»».
        </div>
      )}
    </div>
  );
}
