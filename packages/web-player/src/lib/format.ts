const FORMAT_LABELS: Record<string, string> = {
  freezeout: "FREEZEOUT",
  reentry: "RE-ENTRY",
  knockout: "KNOCKOUT",
  reentry_knockout: "RE-ENTRY + KO",
};

export function formatLabel(format: string): string {
  return FORMAT_LABELS[format] ?? format.toUpperCase();
}

export function formatMoney(value: string | number): string {
  return `${Math.round(Number(value)).toLocaleString("ru-RU")} ₽`;
}

export function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", year: "numeric" });
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
}

export function initials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}
