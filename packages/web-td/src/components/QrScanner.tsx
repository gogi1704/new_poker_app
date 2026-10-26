import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

const ELEMENT_ID = "td-qr-scanner-region";

export default function QrScanner({ onScan, onClose }: { onScan: (text: string) => void; onClose: () => void }) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(ELEMENT_ID);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 230 },
        (decodedText) => {
          if (stoppedRef.current) return;
          stoppedRef.current = true;
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {
          // Per-frame "no QR found yet" — expected while aiming the camera, not an error.
        },
      )
      .catch(() => {
        // Camera unavailable/denied — the modal stays open with its own message below.
      });

    return () => {
      stoppedRef.current = true;
      scanner.stop().catch(() => {});
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
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div id={ELEMENT_ID} style={{ borderRadius: 16, overflow: "hidden" }} />
        <div className="small muted" style={{ textAlign: "center", marginTop: 14 }}>
          Наведите камеру на QR-код игрока
        </div>
        <button className="btn btn-secondary" style={{ marginTop: 14 }} onClick={onClose}>
          Отмена
        </button>
      </div>
    </div>
  );
}
