import { useId } from "react";

const THEMES: Record<string, { felt: string; feltDark: string; chipA: string; chipB: string; glyph: string }> = {
  freezeout: { felt: "#1f9657", feltDark: "#0a2316", chipA: "#34d680", chipB: "#0f3d26", glyph: "♠" },
  reentry: { felt: "#1a84bb", feltDark: "#07202e", chipA: "#45c2f5", chipB: "#0d2d3d", glyph: "♦" },
  knockout: { felt: "#bb2a40", feltDark: "#2a0a10", chipA: "#f0556b", chipB: "#4a0f16", glyph: "♣" },
  reentry_knockout: { felt: "#8730bb", feltDark: "#260a33", chipA: "#c572f0", chipB: "#331347", glyph: "♥" },
};

function ChipStack({
  cx,
  cy,
  rows,
  colorA,
  colorB,
}: {
  cx: number;
  cy: number;
  rows: number;
  colorA: string;
  colorB: string;
}) {
  return (
    <g>
      {Array.from({ length: rows }).map((_, i) => (
        <g key={i} transform={`translate(${cx},${cy - i * 9})`}>
          <ellipse cx="0" cy="0" rx="32" ry="13" fill={i % 2 === 0 ? colorA : colorB} stroke="#00000050" />
          <ellipse cx="0" cy="-3" rx="32" ry="13" fill="none" stroke="#ffffff35" strokeDasharray="5 5" />
        </g>
      ))}
    </g>
  );
}

export default function TournamentArt({ format }: { format: string }) {
  const t = THEMES[format] ?? THEMES.freezeout;
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = `${format.replace(/[^a-z]/gi, "")}-${uid}`;

  return (
    <svg className="tc-art-svg" viewBox="0 0 320 212" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`tcfelt-${id}`} cx="80%" cy="18%" r="115%">
          <stop offset="0%" stopColor={t.felt} />
          <stop offset="100%" stopColor={t.feltDark} />
        </radialGradient>
        <linearGradient id={`tcfade-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0.88" />
          <stop offset="24%" stopColor="#000" stopOpacity="0.6" />
          <stop offset="48%" stopColor="#000" stopOpacity="0.15" />
          <stop offset="72%" stopColor="#000" stopOpacity="0" />
          <stop offset="100%" stopColor="#000" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width="320" height="212" fill={`url(#tcfelt-${id})`} />
      <ChipStack cx={272} cy={202} rows={4} colorA={t.chipA} colorB={t.chipB} />
      <ChipStack cx={224} cy={210} rows={3} colorA={t.chipB} colorB={t.chipA} />
      <g transform="translate(215,106) rotate(-11)">
        <rect x="-35" y="-49" width="70" height="98" rx="9" fill="#f6efdd" stroke="#00000030" strokeWidth="1.5" />
        <text x="4" y="16" fontSize="56" textAnchor="middle" fill={t.feltDark} fontFamily="Georgia, serif">
          {t.glyph}
        </text>
        <text x="-24" y="-28" fontSize="13" textAnchor="middle" fill={t.feltDark} fontFamily="Georgia, serif">
          {t.glyph}
        </text>
      </g>
      <rect width="320" height="212" fill={`url(#tcfade-${id})`} />
    </svg>
  );
}
