import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { BlindLevel } from "../lib/types.js";
import { STANDARD_LEVELS } from "../lib/standardLevels.js";
import { apiGet, apiPost, apiDelete } from "../lib/api.js";

interface BlindTemplate {
  id: string;
  name: string;
  levels: BlindLevel[];
}

export default function BlindLevelsEditor({
  levels,
  onChange,
}: {
  levels: BlindLevel[];
  onChange: (next: BlindLevel[]) => void;
}) {
  const [templates, setTemplates] = useState<BlindTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [newTemplateName, setNewTemplateName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<BlindTemplate[]>("/api/td/blind-templates").then(setTemplates).catch(() => {});
  }, []);

  async function saveAsTemplate() {
    const name = newTemplateName.trim();
    if (!name || levels.length === 0) return;
    setSaving(true);
    try {
      const updated = await apiPost<BlindTemplate[]>("/api/td/blind-templates", { name, levels });
      setTemplates(updated);
      setNewTemplateName("");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTemplate(id: string) {
    const updated = await apiDelete<BlindTemplate[]>(`/api/td/blind-templates/${id}`);
    setTemplates(updated);
    if (selectedTemplateId === id) setSelectedTemplateId("");
  }
  function updateLevel(index: number, patch: Partial<BlindLevel>) {
    const next = levels.map((l, i) => (i === index ? { ...l, ...patch } : l));
    onChange(next);
  }

  function removeLevel(index: number) {
    const next = levels.filter((_, i) => i !== index).map((l, i) => ({ ...l, levelNumber: i + 1 }));
    onChange(next);
  }

  function addLevel() {
    const last = levels[levels.length - 1];
    onChange([
      ...levels,
      {
        levelNumber: levels.length + 1,
        smallBlind: last ? last.bigBlind : 25,
        bigBlind: last ? last.bigBlind * 2 : 50,
        ante: 0,
        durationMinutes: 15,
        isBreak: false,
      },
    ]);
  }

  function addBreak() {
    onChange([
      ...levels,
      { levelNumber: levels.length + 1, smallBlind: 0, bigBlind: 0, ante: 0, durationMinutes: 10, isBreak: true },
    ]);
  }

  return (
    <div>
      <div className="row" style={{ marginBottom: 10 }}>
        <strong className="small">Структура блайндов ({levels.length})</strong>
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          type="button"
          onClick={() => onChange(STANDARD_LEVELS)}
        >
          Заполнить стандартной (12 ур.)
        </button>
      </div>

      {templates.length > 0 && (
        <div className="row" style={{ gap: 8, marginBottom: 10 }}>
          <select
            value={selectedTemplateId}
            onChange={(e) => setSelectedTemplateId(e.target.value)}
            style={{ ...templateInputStyle, flex: 1 }}
          >
            <option value="">Свой шаблон…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.levels.length} ур.)
              </option>
            ))}
          </select>
          <button
            className="btn btn-secondary"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
            type="button"
            disabled={!selectedTemplateId}
            onClick={() => {
              const t = templates.find((x) => x.id === selectedTemplateId);
              if (t) onChange(t.levels);
            }}
          >
            Загрузить
          </button>
          <button
            className="icon-btn"
            type="button"
            disabled={!selectedTemplateId}
            onClick={() => selectedTemplateId && deleteTemplate(selectedTemplateId)}
            title="Удалить шаблон"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {levels.length > 0 && (
        <table className="blind-table">
          <thead>
            <tr>
              <th>#</th>
              <th>SB</th>
              <th>BB</th>
              <th>Ante</th>
              <th>Мин.</th>
              <th>Перерыв</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level, i) => (
              <tr key={i}>
                <td>{level.levelNumber}</td>
                <td>
                  <input
                    type="number"
                    value={level.smallBlind}
                    onChange={(e) => updateLevel(i, { smallBlind: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={level.bigBlind}
                    onChange={(e) => updateLevel(i, { bigBlind: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={level.ante}
                    onChange={(e) => updateLevel(i, { ante: Number(e.target.value) })}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    value={level.durationMinutes}
                    onChange={(e) => updateLevel(i, { durationMinutes: Number(e.target.value) })}
                  />
                </td>
                <td style={{ textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={level.isBreak}
                    onChange={(e) => updateLevel(i, { isBreak: e.target.checked })}
                  />
                </td>
                <td>
                  <button className="icon-btn" type="button" onClick={() => removeLevel(i)}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          type="button"
          onClick={addLevel}
        >
          + Уровень
        </button>
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          type="button"
          onClick={addBreak}
        >
          + Перерыв
        </button>
      </div>

      <div className="row" style={{ marginTop: 10, gap: 8 }}>
        <input
          value={newTemplateName}
          onChange={(e) => setNewTemplateName(e.target.value)}
          placeholder="Название шаблона…"
          style={{ ...templateInputStyle, flex: 1 }}
        />
        <button
          className="btn btn-secondary"
          style={{ width: "auto", padding: "6px 10px", fontSize: 12 }}
          type="button"
          disabled={saving || !newTemplateName.trim() || levels.length === 0}
          onClick={saveAsTemplate}
        >
          {saving ? "Сохраняем…" : "Сохранить как шаблон"}
        </button>
      </div>
    </div>
  );
}

const templateInputStyle = {
  padding: "8px 10px",
  borderRadius: 8,
  background: "var(--card-2)",
  border: "1px solid var(--border)",
  color: "var(--text)",
  fontSize: 13,
};
