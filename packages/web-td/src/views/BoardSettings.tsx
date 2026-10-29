import { useEffect, useRef, useState } from "react";
import { X, Plus, Trash2, Volume2 } from "lucide-react";
import { apiGet, apiPut } from "../lib/api.js";
import Toggle from "../components/Toggle.js";
import { BLOCK_LABELS } from "./boardBlocks.js";
import { BOARD_BLOCK_TYPES, type BoardBlockConfig, type BoardBlockType } from "../lib/liveTypes.js";

interface BoardSettingsShape {
  accentColor: string;
  soundEnabled: boolean;
  soundVolume: number;
  layout: BoardBlockConfig[];
}

interface ClubResponse {
  id: string;
  boardSettings: BoardSettingsShape;
}

const MIN_SIZE = 5;

function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `b${Date.now()}${Math.random()}`;
}

export default function BoardSettings({ onClose }: { onClose: () => void }) {
  const [club, setClub] = useState<ClubResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPalette, setShowPalette] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    apiGet<ClubResponse>("/api/td/club").then(setClub).catch((err) => setError(String(err.message ?? err)));
  }, []);

  function patchSettings(patch: Partial<BoardSettingsShape>) {
    setClub((c) => (c ? { ...c, boardSettings: { ...c.boardSettings, ...patch } } : c));
  }

  function setLayout(next: BoardBlockConfig[]) {
    patchSettings({ layout: next });
  }

  function updateBlock(id: string, patch: Partial<BoardBlockConfig>) {
    setClub((c) => {
      if (!c) return c;
      return {
        ...c,
        boardSettings: {
          ...c.boardSettings,
          layout: c.boardSettings.layout.map((b) => (b.id === id ? { ...b, ...patch } : b)),
        },
      };
    });
  }

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ClubResponse>("/api/td/club", { boardSettings: club.boardSettings });
      setClub(updated);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (!club) {
    return (
      <div style={overlayStyles.wrap}>
        <div className="loading">Загрузка…</div>
      </div>
    );
  }

  const layout = club.boardSettings.layout;
  const placedTypes = new Set(layout.map((b) => b.type));
  const available = BOARD_BLOCK_TYPES.filter((t) => t === "custom-text" || !placedTypes.has(t));
  const selected = layout.find((b) => b.id === selectedId) ?? null;

  function addBlock(type: BoardBlockType) {
    const block: BoardBlockConfig = {
      id: newId(),
      type,
      x: 30,
      y: 30,
      width: 30,
      height: 20,
      ...(type === "custom-text" ? { text: "Текст", fontSize: 32 } : {}),
    };
    setLayout([...layout, block]);
    setSelectedId(block.id);
    setShowPalette(false);
  }

  function removeBlock(id: string) {
    setLayout(layout.filter((b) => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <div style={overlayStyles.wrap}>
      <div style={overlayStyles.topBar}>
        <strong style={{ fontSize: 14 }}>Настройка табло</strong>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {error && <span style={{ color: "var(--danger)", fontSize: 12 }}>{error}</span>}
          <button className="btn btn-secondary" style={overlayStyles.smallBtn} onClick={() => setShowPalette((v) => !v)}>
            <Plus size={14} style={{ marginRight: 4, verticalAlign: -2 }} />
            Блок
          </button>
          <button className="btn btn-primary" style={overlayStyles.smallBtn} disabled={saving} onClick={handleSave}>
            {saving ? "Сохраняем…" : "Сохранить"}
          </button>
          <button className="btn btn-secondary" style={{ ...overlayStyles.smallBtn, width: "auto", padding: "6px 8px" }} onClick={onClose}>
            <X size={14} />
          </button>
        </div>
      </div>

      {showPalette && (
        <div style={overlayStyles.palette}>
          {available.map((type) => (
            <button key={type} className="btn btn-secondary" style={overlayStyles.paletteBtn} onClick={() => addBlock(type)}>
              {BLOCK_LABELS[type]}
            </button>
          ))}
        </div>
      )}

      <div style={overlayStyles.stage}>
        <div ref={canvasRef} style={overlayStyles.canvas} onPointerDown={() => setSelectedId(null)}>
          {layout.map((block) => (
            <CanvasBlock
              key={block.id}
              block={block}
              canvasRef={canvasRef}
              selected={block.id === selectedId}
              onSelect={() => setSelectedId(block.id)}
              onUpdate={(patch) => updateBlock(block.id, patch)}
              onRemove={() => removeBlock(block.id)}
            />
          ))}
        </div>
      </div>

      {selected && (
        <div style={overlayStyles.inspector}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <strong className="small">{BLOCK_LABELS[selected.type]}</strong>
            <button className="btn btn-secondary" style={overlayStyles.smallBtn} onClick={() => removeBlock(selected.id)}>
              <Trash2 size={13} style={{ marginRight: 4, verticalAlign: -2 }} />
              Удалить
            </button>
          </div>
          {selected.type === "custom-text" && (
            <>
              <input
                style={overlayStyles.textInput}
                value={selected.text ?? ""}
                placeholder="Текст надписи"
                onChange={(e) => updateBlock(selected.id, { text: e.target.value })}
              />
              <div className="small muted" style={{ marginTop: 8, marginBottom: 4 }}>
                Размер шрифта: {selected.fontSize ?? 32}px
              </div>
              <input
                type="range"
                min={10}
                max={160}
                value={selected.fontSize ?? 32}
                onChange={(e) => updateBlock(selected.id, { fontSize: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </>
          )}
          <div className="small muted" style={{ marginTop: 8 }}>
            Перетащите блок за тело, чтобы переместить, за правый нижний угол — чтобы изменить размер.
          </div>
        </div>
      )}

      <div style={overlayStyles.footer}>
        <div className="row" style={{ marginBottom: 8 }}>
          <span className="small">Акцентный цвет</span>
          <input
            type="color"
            value={club.boardSettings.accentColor}
            onChange={(e) => patchSettings({ accentColor: e.target.value })}
            style={{ width: 44, height: 28, padding: 1, background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 6 }}
          />
        </div>
        <div className="row">
          <span className="small" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Volume2 size={14} /> Звук
          </span>
          <Toggle checked={club.boardSettings.soundEnabled} onChange={(v) => patchSettings({ soundEnabled: v })} />
        </div>
      </div>
    </div>
  );
}

function CanvasBlock({
  block,
  canvasRef,
  selected,
  onSelect,
  onUpdate,
  onRemove,
}: {
  block: BoardBlockConfig;
  canvasRef: React.RefObject<HTMLDivElement>;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: Partial<BoardBlockConfig>) => void;
  onRemove: () => void;
}) {
  const dragState = useRef<{ mode: "move" | "resize"; startX: number; startY: number; block: BoardBlockConfig } | null>(
    null,
  );

  function handlePointerDown(e: React.PointerEvent, mode: "move" | "resize") {
    e.stopPropagation();
    e.preventDefault();
    onSelect();
    // Set BEFORE attempting capture: setPointerCapture can throw (no active
    // pointer with this id, which happens with some synthetic/replayed
    // events) and the drag should still work via normal bubbling either way.
    dragState.current = { mode, startX: e.clientX, startY: e.clientY, block };
    try {
      (e.target as Element).setPointerCapture(e.pointerId);
    } catch {
      // Capture is just a nice-to-have for tracking the pointer outside the
      // element's bounds — harmless to skip.
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const drag = dragState.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100;

    if (drag.mode === "move") {
      const x = Math.max(0, Math.min(100 - drag.block.width, drag.block.x + dxPct));
      const y = Math.max(0, Math.min(100 - drag.block.height, drag.block.y + dyPct));
      onUpdate({ x, y });
    } else {
      const width = Math.max(MIN_SIZE, Math.min(100 - drag.block.x, drag.block.width + dxPct));
      const height = Math.max(MIN_SIZE, Math.min(100 - drag.block.y, drag.block.height + dyPct));
      onUpdate({ width, height });
    }
  }

  function handlePointerUp(e: React.PointerEvent) {
    try {
      (e.target as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Nothing was captured — nothing to release.
    }
    dragState.current = null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: `${block.x}%`,
        top: `${block.y}%`,
        width: `${block.width}%`,
        height: `${block.height}%`,
        border: selected ? "2px solid #4da3ff" : "1px dashed rgba(255,255,255,0.3)",
        background: "rgba(77,163,255,0.08)",
        borderRadius: 6,
        touchAction: "none",
        cursor: "move",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
      onPointerDown={(e) => handlePointerDown(e, "move")}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <span
        style={{
          fontSize: "clamp(9px, 1.4vw, 13px)",
          color: "#cfe3fb",
          fontWeight: 700,
          textAlign: "center",
          padding: 4,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {block.type === "custom-text" ? block.text || "Текст" : BLOCK_LABELS[block.type]}
      </span>
      {selected && (
        <>
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            style={{
              position: "absolute",
              top: 2,
              right: 2,
              width: 18,
              height: 18,
              borderRadius: "50%",
              border: "none",
              background: "#ff6b6b",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <X size={11} />
          </button>
          <div
            onPointerDown={(e) => handlePointerDown(e, "resize")}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            style={{
              position: "absolute",
              bottom: 0,
              right: 0,
              width: 16,
              height: 16,
              background: "#4da3ff",
              cursor: "nwse-resize",
              borderTopLeftRadius: 4,
            }}
          />
        </>
      )}
    </div>
  );
}

const overlayStyles = {
  wrap: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 1000,
    background: "#05070a",
    display: "flex",
    flexDirection: "column" as const,
  },
  topBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  smallBtn: { width: "auto", padding: "6px 10px", fontSize: 12 },
  palette: {
    display: "flex",
    flexWrap: "wrap" as const,
    gap: 8,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    flexShrink: 0,
  },
  paletteBtn: { width: "auto", padding: "7px 12px", fontSize: 12 },
  stage: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 0,
    padding: 12,
  },
  canvas: {
    position: "relative" as const,
    width: "min(100%, calc((100vh - 220px) * 16 / 9))",
    aspectRatio: "16 / 9",
    background: "#0b0f14",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden" as const,
    touchAction: "none" as const,
  },
  inspector: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
  textInput: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 10,
    background: "var(--card-2)",
    border: "1px solid var(--border)",
    color: "var(--text)",
    fontSize: 14,
  },
  footer: {
    padding: "10px 14px",
    borderTop: "1px solid var(--border)",
    flexShrink: 0,
  },
};
