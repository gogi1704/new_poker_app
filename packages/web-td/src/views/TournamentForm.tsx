import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { apiGet, apiPost, apiPut } from "../lib/api.js";
import { confirmDialog } from "../lib/telegram.js";
import type { BlindLevel, TournamentFull } from "../lib/types.js";
import { formatDateTimeLocal } from "../lib/format.js";
import { STANDARD_LEVELS } from "../lib/standardLevels.js";
import BlindLevelsEditor from "./BlindLevelsEditor.js";

interface FormState {
  name: string;
  format: string;
  status: string;
  scheduledAt: string;
  buyIn: string;
  startingStack: string;
  maxSeats: string;
  lateRegUntilLevel: string;
  reentryAllowedUntilLevel: string;
  reentryPrice: string;
  addonPrice: string;
  addonStack: string;
  addonAvailableLevel: string;
  addonMaxCount: string;
  arriveBonusStack: string;
  knockoutPoints: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  format: "freezeout",
  status: "scheduled",
  scheduledAt: "",
  buyIn: "1000",
  startingStack: "20000",
  maxSeats: "40",
  lateRegUntilLevel: "",
  reentryAllowedUntilLevel: "",
  reentryPrice: "",
  addonPrice: "",
  addonStack: "",
  addonAvailableLevel: "",
  addonMaxCount: "",
  arriveBonusStack: "0",
  knockoutPoints: "50",
};

function toFormState(t: TournamentFull): FormState {
  return {
    name: t.name,
    format: t.format,
    status: t.status === "registering" ? "registering" : "scheduled",
    scheduledAt: formatDateTimeLocal(t.scheduledAt),
    buyIn: String(Number(t.buyIn)),
    startingStack: String(t.startingStack),
    maxSeats: String(t.maxSeats),
    lateRegUntilLevel: t.lateRegUntilLevel?.toString() ?? "",
    reentryAllowedUntilLevel: t.reentryAllowedUntilLevel?.toString() ?? "",
    reentryPrice: t.reentryPrice ? String(Number(t.reentryPrice)) : "",
    addonPrice: t.addonPrice ? String(Number(t.addonPrice)) : "",
    addonStack: t.addonStack?.toString() ?? "",
    addonAvailableLevel: t.addonAvailableLevel?.toString() ?? "",
    addonMaxCount: t.addonMaxCount?.toString() ?? "",
    arriveBonusStack: String(t.arriveBonusStack),
    knockoutPoints: String(t.rpsFormulaParams.knockoutPoints),
  };
}

function numOrNull(v: string): number | null {
  return v.trim() === "" ? null : Number(v);
}

export default function TournamentForm({
  tournamentId,
  onDone,
  onCancel,
}: {
  tournamentId?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [levels, setLevels] = useState<BlindLevel[]>(STANDARD_LEVELS);
  const [loading, setLoading] = useState(!!tournamentId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tournamentStatus, setTournamentStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!tournamentId) return;
    apiGet<TournamentFull>(`/api/td/tournaments/${tournamentId}`)
      .then((t) => {
        setForm(toFormState(t));
        setLevels(t.blindLevels);
        setTournamentStatus(t.status);
      })
      .catch((err) => setError(String((err as Error).message ?? err)))
      .finally(() => setLoading(false));
  }, [tournamentId]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      format: form.format,
      status: form.status,
      scheduledAt: new Date(form.scheduledAt).toISOString(),
      buyIn: Number(form.buyIn),
      startingStack: Number(form.startingStack),
      maxSeats: Number(form.maxSeats),
      lateRegUntilLevel: numOrNull(form.lateRegUntilLevel),
      reentryAllowedUntilLevel: numOrNull(form.reentryAllowedUntilLevel),
      reentryPrice: numOrNull(form.reentryPrice),
      addonPrice: numOrNull(form.addonPrice),
      addonStack: numOrNull(form.addonStack),
      addonAvailableLevel: numOrNull(form.addonAvailableLevel),
      addonMaxCount: numOrNull(form.addonMaxCount),
      arriveBonusStack: Number(form.arriveBonusStack || 0),
      rpsFormulaParams: { knockoutPoints: Number(form.knockoutPoints || 0) },
      blindLevels: levels,
    };

    try {
      if (tournamentId) {
        await apiPut(`/api/td/tournaments/${tournamentId}`, payload);
      } else {
        await apiPost("/api/td/tournaments", payload);
      }
      onDone();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancelTournament() {
    if (!tournamentId) return;
    const confirmed = await confirmDialog("Отменить этот турнир? Игроки перестанут видеть его в приложении.");
    if (!confirmed) return;
    setSaving(true);
    try {
      await apiPost(`/api/td/tournaments/${tournamentId}/cancel`);
      onDone();
    } catch (err) {
      setError(String((err as Error).message ?? err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="loading">Загрузка…</div>;

  const locked = tournamentStatus === "finished" || tournamentStatus === "running";

  return (
    <form className="section" onSubmit={handleSubmit}>
      <div className="row" style={{ marginBottom: 14 }}>
        <strong>{tournamentId ? "Редактировать турнир" : "Новый турнир"}</strong>
        <button className="btn btn-secondary" style={{ width: "auto", padding: "6px 12px" }} type="button" onClick={onCancel}>
          <X size={16} />
        </button>
      </div>

      {locked && (
        <div className="card small" style={{ marginBottom: 14, color: "var(--danger)" }}>
          Турнир {tournamentStatus === "finished" ? "завершён" : "уже идёт"} — редактирование недоступно.
        </div>
      )}

      <fieldset disabled={locked || saving} style={{ border: "none", padding: 0, margin: 0 }}>
        <div className="field">
          <label>Название</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} required />
        </div>

        <div className="field-grid">
          <div className="field">
            <label>Формат</label>
            <select value={form.format} onChange={(e) => set("format", e.target.value)}>
              <option value="freezeout">Freezeout</option>
              <option value="reentry">Re-entry</option>
              <option value="knockout">Knockout</option>
              <option value="reentry_knockout">Re-entry + KO</option>
            </select>
          </div>
          <div className="field">
            <label>Статус</label>
            <select value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="scheduled">Запланирован</option>
              <option value="registering">Регистрация открыта</option>
            </select>
          </div>
        </div>

        <div className="field">
          <label>Дата и время старта</label>
          <input
            type="datetime-local"
            value={form.scheduledAt}
            onChange={(e) => set("scheduledAt", e.target.value)}
            required
          />
        </div>

        <div className="field-grid">
          <div className="field">
            <label>Взнос, ₽</label>
            <input type="number" min="0" value={form.buyIn} onChange={(e) => set("buyIn", e.target.value)} required />
          </div>
          <div className="field">
            <label>Стартовый стек</label>
            <input
              type="number"
              min="1"
              value={form.startingStack}
              onChange={(e) => set("startingStack", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Макс. мест</label>
            <input
              type="number"
              min="2"
              value={form.maxSeats}
              onChange={(e) => set("maxSeats", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>Бонус за приход вовремя</label>
            <input
              type="number"
              min="0"
              value={form.arriveBonusStack}
              onChange={(e) => set("arriveBonusStack", e.target.value)}
            />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <strong className="small">🔁 Re-entry / Add-on (необязательно)</strong>
          <div className="field-grid" style={{ marginTop: 10 }}>
            <div className="field">
              <label>Re-entry до уровня</label>
              <input
                type="number"
                min="1"
                value={form.reentryAllowedUntilLevel}
                onChange={(e) => set("reentryAllowedUntilLevel", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Цена re-entry, ₽</label>
              <input
                type="number"
                min="0"
                value={form.reentryPrice}
                onChange={(e) => set("reentryPrice", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Поздняя регистрация до уровня</label>
              <input
                type="number"
                min="1"
                value={form.lateRegUntilLevel}
                onChange={(e) => set("lateRegUntilLevel", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Add-on доступен на уровне</label>
              <input
                type="number"
                min="1"
                value={form.addonAvailableLevel}
                onChange={(e) => set("addonAvailableLevel", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Цена add-on, ₽</label>
              <input
                type="number"
                min="0"
                value={form.addonPrice}
                onChange={(e) => set("addonPrice", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Стек от add-on</label>
              <input
                type="number"
                min="0"
                value={form.addonStack}
                onChange={(e) => set("addonStack", e.target.value)}
              />
            </div>
            <div className="field">
              <label>Макс. add-on на игрока</label>
              <input
                type="number"
                min="1"
                value={form.addonMaxCount}
                onChange={(e) => set("addonMaxCount", e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="field">
          <label>RPS за нокаут</label>
          <input
            type="number"
            min="0"
            style={{ maxWidth: 120 }}
            value={form.knockoutPoints}
            onChange={(e) => set("knockoutPoints", e.target.value)}
          />
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <BlindLevelsEditor levels={levels} onChange={setLevels} />
        </div>
      </fieldset>

      {error && (
        <div className="small" style={{ color: "var(--danger)", marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!locked && (
        <button className="btn btn-primary" type="submit" disabled={saving || levels.length === 0}>
          {saving ? "Сохраняем…" : tournamentId ? "Сохранить изменения" : "Создать турнир"}
        </button>
      )}

      {tournamentId && !locked && tournamentStatus !== "cancelled" && (
        <button
          className="btn btn-danger"
          type="button"
          style={{ marginTop: 10 }}
          disabled={saving}
          onClick={handleCancelTournament}
        >
          Отменить турнир
        </button>
      )}
    </form>
  );
}
