import type { BlindLevel } from "../lib/types.js";
import { STANDARD_LEVELS } from "../lib/standardLevels.js";

export default function BlindLevelsEditor({
  levels,
  onChange,
}: {
  levels: BlindLevel[];
  onChange: (next: BlindLevel[]) => void;
}) {
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
                    ✕
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
    </div>
  );
}
