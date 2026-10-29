import { Resvg } from "@resvg/resvg-js";

const FORMAT_LABELS: Record<string, string> = {
  freezeout: "FREEZEOUT",
  reentry: "RE-ENTRY",
  knockout: "KNOCKOUT",
  reentry_knockout: "RE-ENTRY + KO",
};

const THEMES: Record<string, { felt: string; feltDark: string; chipA: string; chipB: string; glyph: string }> = {
  freezeout: { felt: "#1f9657", feltDark: "#0a2316", chipA: "#34d680", chipB: "#0f3d26", glyph: "♠" },
  reentry: { felt: "#1a84bb", feltDark: "#07202e", chipA: "#45c2f5", chipB: "#0d2d3d", glyph: "♦" },
  knockout: { felt: "#bb2a40", feltDark: "#2a0a10", chipA: "#f0556b", chipB: "#4a0f16", glyph: "♣" },
  reentry_knockout: { felt: "#8730bb", feltDark: "#260a33", chipA: "#c572f0", chipB: "#331347", glyph: "♥" },
};

const WEEKDAYS = ["ВС", "ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ"];
const MONTHS = [
  "ЯНВ",
  "ФЕВ",
  "МАР",
  "АПР",
  "МАЙ",
  "ИЮН",
  "ИЮЛ",
  "АВГ",
  "СЕН",
  "ОКТ",
  "НОЯ",
  "ДЕК",
];

export interface TournamentCardInput {
  name: string;
  format: string;
  scheduledAt: Date;
  buyIn: string | number;
  startingStack: number;
  maxSeats: number;
  seatsFilled: number;
  knockoutPoints: number;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLines(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = next;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    if (last.length > maxChars) lines[maxLines - 1] = `${last.slice(0, maxChars - 1)}…`;
  }
  return lines;
}

function formatMoney(v: string | number): string {
  return `${Math.round(Number(v)).toLocaleString("ru-RU")} ₽`;
}

export function renderTournamentCardPng(input: TournamentCardInput): Buffer {
  const theme = THEMES[input.format] ?? THEMES.freezeout;
  const width = 900;
  const height = 620;
  const stubW = 190;
  const ticketH = 360;
  const d = input.scheduledAt;
  const weekday = WEEKDAYS[d.getDay()];
  const day = d.getDate();
  const month = MONTHS[d.getMonth()];
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  const titleLines = wrapLines(input.name.toUpperCase(), 16, 2);
  const remaining = Math.max(0, input.maxSeats - input.seatsFilled);
  const fillPercent = Math.min(100, Math.round((input.seatsFilled / input.maxSeats) * 100));

  const artX = stubW;
  const artW = width - 48 - stubW;

  const titleSvg = titleLines
    .map(
      (line, i) =>
        `<text x="${artX + 28}" y="${ticketH - 40 - (titleLines.length - 1 - i) * 52}" font-size="42" font-weight="700" fill="${i === 0 ? "#ffffff" : "#ffffffb0"}" font-family="DejaVu Sans, sans-serif">${escapeXml(line)}</text>`,
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="cardbg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#201b10"/>
      <stop offset="100%" stop-color="#100d07"/>
    </linearGradient>
    <radialGradient id="felt" cx="80%" cy="18%" r="115%">
      <stop offset="0%" stop-color="${theme.felt}"/>
      <stop offset="100%" stop-color="${theme.feltDark}"/>
    </radialGradient>
    <linearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#000000" stop-opacity="0.88"/>
      <stop offset="24%" stop-color="#000000" stop-opacity="0.6"/>
      <stop offset="48%" stop-color="#000000" stop-opacity="0.15"/>
      <stop offset="72%" stop-color="#000000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#e8c37a"/>
      <stop offset="100%" stop-color="#8c6a2f"/>
    </linearGradient>
  </defs>

  <rect width="${width}" height="${height}" rx="28" fill="url(#cardbg)" stroke="#8c6a2f88" stroke-width="2"/>

  <!-- date stub -->
  <rect x="24" y="24" width="${stubW - 24}" height="${ticketH - 24}" rx="16" fill="#1a1a1a"/>
  <line x1="56" y1="60" x2="90" y2="60" stroke="#8c6a2f" stroke-width="3"/>
  <text x="56" y="88" font-size="16" font-weight="700" letter-spacing="2" fill="#c9a24a" font-family="DejaVu Sans, sans-serif">АФИША</text>
  <text x="56" y="122" font-size="22" font-weight="700" fill="#f2f3f5" font-family="DejaVu Sans, sans-serif">${weekday}</text>
  <text x="56" y="205" font-size="78" font-weight="700" fill="#ffffff" font-family="DejaVu Sans, sans-serif">${day}</text>
  <text x="56" y="238" font-size="18" font-weight="700" letter-spacing="1" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif">${month}</text>
  <circle cx="62" cy="268" r="7" fill="none" stroke="#9aa0ab" stroke-width="1.5"/>
  <line x1="62" y1="268" x2="62" y2="263" stroke="#9aa0ab" stroke-width="1.5"/>
  <line x1="62" y1="268" x2="66" y2="269" stroke="#9aa0ab" stroke-width="1.5"/>
  <text x="76" y="273" font-size="16" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif">${time}</text>

  <!-- art panel -->
  <clipPath id="artclip"><rect x="${artX}" y="24" width="${artW}" height="${ticketH - 24}" rx="16"/></clipPath>
  <g clip-path="url(#artclip)">
    <rect x="${artX}" y="24" width="${artW}" height="${ticketH - 24}" fill="url(#felt)"/>
    <g opacity="0.95">
      <ellipse cx="${artX + artW - 70}" cy="${ticketH - 10}" rx="38" ry="15" fill="${theme.chipA}" stroke="#00000050"/>
      <ellipse cx="${artX + artW - 70}" cy="${ticketH - 28}" rx="38" ry="15" fill="${theme.chipB}" stroke="#00000050"/>
      <ellipse cx="${artX + artW - 130}" cy="${ticketH + 2}" rx="38" ry="15" fill="${theme.chipB}" stroke="#00000050"/>
      <ellipse cx="${artX + artW - 130}" cy="${ticketH - 16}" rx="38" ry="15" fill="${theme.chipA}" stroke="#00000050"/>
    </g>
    <g transform="translate(${artX + artW - 170},${ticketH - 140}) rotate(-11)">
      <rect x="-42" y="-58" width="84" height="116" rx="11" fill="#f6efdd" stroke="#00000030" stroke-width="2"/>
      <text x="4" y="20" font-size="66" text-anchor="middle" fill="${theme.feltDark}" font-family="DejaVu Sans, sans-serif">${theme.glyph}</text>
    </g>
    <rect x="${artX}" y="24" width="${artW}" height="${ticketH - 24}" fill="url(#fade)"/>
  </g>

  <!-- format chip -->
  <rect x="${artX + 28}" y="48" width="${90 + FORMAT_LABELS[input.format]?.length * 10 || 160}" height="38" rx="19" fill="#0a0a0a99" stroke="#e8c37a8c" stroke-width="1.5"/>
  <text x="${artX + 28 + 18}" y="73" font-size="16" font-weight="700" letter-spacing="1" fill="#e8c37a" font-family="DejaVu Sans, sans-serif">${escapeXml(FORMAT_LABELS[input.format] ?? input.format.toUpperCase())}</text>

  ${titleSvg}

  <!-- stats strip -->
  <text x="48" y="${ticketH + 52}" font-size="14" font-weight="700" letter-spacing="1" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif">ВЗНОС</text>
  <text x="48" y="${ticketH + 82}" font-size="26" font-weight="700" fill="#ffffff" font-family="DejaVu Sans, sans-serif">${escapeXml(formatMoney(input.buyIn))}</text>

  <text x="248" y="${ticketH + 52}" font-size="14" font-weight="700" letter-spacing="1" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif">СТЕК</text>
  <text x="248" y="${ticketH + 82}" font-size="26" font-weight="700" fill="#ffffff" font-family="DejaVu Sans, sans-serif">${Math.round(input.startingStack / 1000)}K</text>

  <path d="M452 ${ticketH + 38} L459 ${ticketH + 38} L455 ${ticketH + 44} L460 ${ticketH + 44} L450 ${ticketH + 54} L453 ${ticketH + 46} L448 ${ticketH + 46} Z" fill="#c9a24a"/>
  <text x="465" y="${ticketH + 52}" font-size="14" font-weight="700" letter-spacing="1" fill="#c9a24a" font-family="DejaVu Sans, sans-serif">KO</text>
  <text x="448" y="${ticketH + 82}" font-size="26" font-weight="700" fill="#e8c37a" font-family="DejaVu Sans, sans-serif">${input.knockoutPoints} RPS</text>

  <!-- seats -->
  <text x="48" y="${ticketH + 140}" font-size="18" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif">${input.seatsFilled} / ${input.maxSeats} мест</text>
  <text x="${width - 48}" y="${ticketH + 140}" font-size="16" font-weight="700" letter-spacing="1" fill="#9aa0ab" font-family="DejaVu Sans, sans-serif" text-anchor="end">ОСТАЛОСЬ ${remaining}</text>

  <rect x="48" y="${ticketH + 160}" width="${width - 96}" height="10" rx="5" fill="#ffffff1f"/>
  <rect x="48" y="${ticketH + 160}" width="${((width - 96) * fillPercent) / 100}" height="10" rx="5" fill="url(#gold)"/>
</svg>`;

  const resvg = new Resvg(svg, {
    font: { loadSystemFonts: true, defaultFontFamily: "DejaVu Sans" },
    background: "rgba(0,0,0,0)",
  });
  return resvg.render().asPng();
}
