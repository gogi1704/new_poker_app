import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";

const ELEMENT_ID = "td-qr-scanner-region";
const START_TIMEOUT_MS = 8000;

// Html5Qrcode.stop() throws SYNCHRONOUSLY ("Cannot stop, scanner is not
// running or paused") when called on a scanner that never actually started —
// e.g. after the camera permission was denied. A plain `.catch()` only
// handles an async rejection, not that synchronous throw, so calling stop()
// directly in an effect cleanup crashes the whole React tree the moment the
// user closes the scanner. Always go through this wrapper instead.
function safeStop(scanner: Html5Qrcode) {
  try {
    scanner.stop().catch(() => {});
  } catch {
    // Nothing was actually running — nothing to stop.
  }
}

export default function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let scanner: Html5Qrcode;

    try {
      scanner = new Html5Qrcode(ELEMENT_ID);
      scannerRef.current = scanner;
    } catch {
      setError("Не удалось открыть камеру в этом приложении.");
      return;
    }

    timeoutId = setTimeout(() => {
      setError("Камера не отвечает. Проверьте доступ к камере в настройках.");
    }, START_TIMEOUT_MS);

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 230 },
        (decodedText) => {
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          if (timeoutId) clearTimeout(timeoutId);
          safeStop(scanner);
          onScan(decodedText);
        },
        () => {
          // Per-frame "no QR found yet" — expected while aiming the camera, not an error.
        },
      )
      .then(() => {
        if (timeoutId) clearTimeout(timeoutId);
      })
      .catch(() => {
        if (timeoutId) clearTimeout(timeoutId);
        setError("Нет доступа к камере. Разрешите доступ к камере для этого приложения.");
      });

    return () => {
      stoppedRef.current = true;
      if (timeoutId) clearTimeout(timeoutId);
      safeStop(scanner);
    };
  }, [onScan]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <button
        className="btn btn-secondary"
        onClick={onClose}
        style={{
          position: "fixed",
          top: 16,
          right: 16,
          width: 40,
          height: 40,
          padding: 0,
          borderRadius: "50%",
          zIndex: 1001,
        }}
        aria-label="Закрыть"
      >
        <X size={18} />
      </button>

      <div style={{ width: "100%", maxWidth: 360 }}>
        {!error && <div id={ELEMENT_ID} style={{ borderRadius: 16, overflow: "hidden" }} />}
        <div className="small muted" style={{ textAlign: "center", marginTop: 14 }}>
          {error ?? "Наведите камеру на QR-код игрока"}
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={onClose}>
          {error ? "Закрыть" : "Отмена"}
        </button>
      </div>
    </div>
  );
}
