const FORMAT_LABELS: Record<string, string> = {
  freezeout: "Freezeout",
  reentry: "Re-entry",
  knockout: "Knockout",
  reentry_knockout: "Re-entry + KO",
};

const STATUS_LABELS: Record<string, string> = {
  scheduled: "Запланирован",
  registering: "Регистрация открыта",
  running: "Идёт",
  paused: "Пауза",
  finished: "Завершён",
  cancelled: "Отменён",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format;
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function formatDateTimeLocal(iso: string): string {
  // yyyy-MM-ddThh:mm, for an <input type="datetime-local">
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateDisplay(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatMMSS(totalSeconds: number): string {
  const safe = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
