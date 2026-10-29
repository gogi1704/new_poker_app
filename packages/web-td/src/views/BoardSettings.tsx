import { useEffect, useState } from "react";
import { X, Plus, Trash2, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { apiGet, apiPut } from "../lib/api.js";
import Toggle from "../components/Toggle.js";
import { BLOCK_LABELS } from "./boardBlocks.js";
import { BOARD_BLOCK_TYPES, type BoardBlockConfig, type BoardBlockType, type BoardBlockZone } from "../lib/liveTypes.js";

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

const ZONES: BoardBlockZone[] = ["top", "center", "bottom"];
const ZONE_LABELS: Record<BoardBlockZone, string> = { top: "Верх табло", center: "Центр табло", bottom: "Низ табло" };

export default function BoardSettings({ onClose }: { onClose: () => void }) {
  const [club, setClub] = useState<ClubResponse | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<ClubResponse>("/api/td/club").then(setClub).catch((err) => setError(String(err.message ?? err)));
  }, []);

  function patchSettings(patch: Partial<BoardSettingsShape>) {
    setClub((c) => (c ? { ...c, boardSettings: { ...c.boardSettings, ...patch } } : c));
  }

  function setLayout(next: BoardBlockConfig[]) {
    patchSettings({ layout: next });
  }

  async function handleSave() {
    if (!club) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await apiPut<ClubResponse>("/api/td/club", {
        boardSettings: club.boardSettings,
      });
      setClub(updated);
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (!club) return <div className="loading">Загрузка…</div>;

  const layout = club.boardSettings.layout;
  const placedTypes = new Set(layout.map((b) => b.type));
  const available = BOARD_BLOCK_TYPES.filter((t) => !placedTypes.has(t));

  function updateAt(index: number, patch: Partial<BoardBlockConfig>) {
    setLayout(layout.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  }

  function removeAt(index: number) {
    setLayout(layout.filter((_, i) => i !== index));
  }

  function addBlock(type: BoardBlockType) {
    setLayout([...layout, { type, zone: "bottom", size: 1 }]);
  }

  function moveZone(index: number, direction: 1 | -1) {
    const zoneIdx = ZONES.indexOf(layout[index].zone);
    const nextZone = ZONES[zoneIdx + direction];
    if (!nextZone) return;
    updateAt(index, { zone: nextZone });
  }

  function cycleSize(index: number) {
    updateAt(index, { size: layout[index].size === 1 ? 2 : 1 });
  }

  function reorderWithinZone(index: number, direction: 1 | -1) {
    const zone = layout[index].zone;
    const sameZoneIndices = layout.map((b, i) => (b.zone === zone ? i : -1)).filter((i) => i !== -1);
    const pos = sameZoneIndices.indexOf(index);
    const swapWith = sameZoneIndices[pos + direction];
    if (swapWith === undefined) return;
    const next = [...layout];
    [next[index], next[swapWith]] = [next[swapWith], next[index]];
    setLayout(next);
  }

  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>Настройка табло</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 10px" }} onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      <strong className="small muted">ВНЕШНИЙ ВИД ТАБЛО</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Акцентный цвет</label>
          <input
            type="color"
            value={club.boardSettings.accentColor}
            onChange={(e) => patchSettings({ accentColor: e.target.value })}
            style={{ width: 60, height: 36, padding: 2, background: "var(--card-2)", border: "1px solid var(--border)", borderRadius: 8 }}
          />
        </div>
      </div>

      <strong className="small muted">МАКЕТ ТАБЛО</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 14 }}>
        <div style={previewStyles.screen}>
          {ZONES.map((zone) => {
            const blocks = layout.filter((b) => b.zone === zone);
            return (
              <div key={zone} style={previewStyles.zoneRow}>
                {blocks.length === 0 ? (
                  <span style={previewStyles.emptyHint}>—</span>
                ) : (
                  blocks.map((b, i) => (
                    <div key={i} style={{ ...previewStyles.chip, flex: b.size }}>
                      {BLOCK_LABELS[b.type]}
                    </div>
                  ))
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        {ZONES.map((zone) => {
          const indices = layout.map((b, i) => i).filter((i) => layout[i].zone === zone);
          return (
            <div key={zone} style={{ marginBottom: 14 }}>
              <div className="small muted" style={{ marginBottom: 8 }}>
                {ZONE_LABELS[zone].toUpperCase()}
              </div>
              {indices.length === 0 && <div className="small muted">Пусто</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {indices.map((index) => {
                  const block = layout[index];
                  const zoneIdx = ZONES.indexOf(zone);
                  return (
                    <div key={index} className="card" style={blockRowStyles.row}>
                      <span style={blockRowStyles.label}>{BLOCK_LABELS[block.type]}</span>
                      <div style={blockRowStyles.controls}>
                        <IconButton title="Вверх по зоне" onClick={() => reorderWithinZone(index, -1)}>
                          <ArrowUp size={14} />
                        </IconButton>
                        <IconButton title="Вниз по зоне" onClick={() => reorderWithinZone(index, 1)}>
                          <ArrowDown size={14} />
                        </IconButton>
                        <IconButton title="В предыдущую зону" disabled={zoneIdx === 0} onClick={() => moveZone(index, -1)}>
                          <ChevronLeft size={14} />
                        </IconButton>
                        <IconButton
                          title="В следующую зону"
                          disabled={zoneIdx === ZONES.length - 1}
                          onClick={() => moveZone(index, 1)}
                        >
                          <ChevronRight size={14} />
                        </IconButton>
                        <IconButton title={block.size === 1 ? "Увеличить" : "Уменьшить"} onClick={() => cycleSize(index)}>
                          <Maximize2 size={14} />
                          <span style={{ fontSize: 10, marginLeft: 2 }}>{block.size}x</span>
                        </IconButton>
                        <IconButton title="Удалить" danger onClick={() => removeAt(index)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {available.length > 0 && (
        <>
          <strong className="small muted">ДОБАВИТЬ БЛОК</strong>
          <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {available.map((type) => (
                <button key={type} className="btn btn-secondary" style={addButtonStyles} onClick={() => addBlock(type)}>
                  <Plus size={13} style={{ marginRight: 5, verticalAlign: -2 }} />
                  {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <strong className="small muted">ЗВУК</strong>
      <div className="card" style={{ marginTop: 10, marginBottom: 20 }}>
        <div className="row small" style={{ marginBottom: 12 }}>
          <span>Звуковой сигнал</span>
          <Toggle checked={club.boardSettings.soundEnabled} onChange={(v) => patchSettings({ soundEnabled: v })} />
        </div>
        <div className="small muted" style={{ marginBottom: 6 }}>
          Громкость
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={club.boardSettings.soundVolume}
          disabled={!club.boardSettings.soundEnabled}
          onChange={(e) => patchSettings({ soundVolume: Number(e.target.value) })}
          style={{ width: "100%" }}
        />
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={handleSave}>
        {saving ? "Сохраняем…" : "Сохранить"}
      </button>
    </div>
  );
}

function IconButton({
  children,
  onClick,
  title,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        width: "auto",
        padding: "6px 8px",
        borderRadius: 8,
        border: "1px solid var(--border)",
        background: "var(--card-2)",
        color: disabled ? "var(--muted)" : danger ? "var(--danger)" : "var(--text)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

const previewStyles = {
  screen: {
    background: "#0b0f14",
    borderRadius: 10,
    padding: 12,
    display: "flex",
    flexDirection: "column" as const,
    gap: 8,
  },
  zoneRow: {
    display: "flex",
    gap: 6,
    minHeight: 24,
  },
  chip: {
    background: "rgba(77,163,255,0.15)",
    color: "#4da3ff",
    fontSize: 10,
    fontWeight: 700,
    textAlign: "center" as const,
    padding: "5px 4px",
    borderRadius: 6,
    overflow: "hidden" as const,
    whiteSpace: "nowrap" as const,
    textOverflow: "ellipsis" as const,
  },
  emptyHint: { fontSize: 10, color: "#3a4452" },
};

const blockRowStyles = {
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: 10 },
  label: { fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 },
  controls: { display: "flex", gap: 4, flexShrink: 0 },
};

const addButtonStyles = { width: "auto", padding: "8px 12px", fontSize: 12 };
