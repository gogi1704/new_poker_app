const THEMES: Record<string, { felt: string; feltDark: string; chipA: string; chipB: string; glyph: string }> = {
  freezeout: { felt: "#1f4a38", feltDark: "#09120d", chipA: "#2f7a52", chipB: "#123023", glyph: "♠" },
  reentry: { felt: "#1b3a4a", feltDark: "#06131a", chipA: "#2f6a8c", chipB: "#10212b", glyph: "♦" },
  knockout: { felt: "#4a1f24", feltDark: "#120a0a", chipA: "#a33a3a", chipB: "#2a1012", glyph: "♣" },
  reentry_knockout: { felt: "#3a1f4a", feltDark: "#100819", chipA: "#7a4a9e", chipB: "#22132f", glyph: "♥" },
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
        <g key={i} transform={`translate(${cx},${cy - i * 7})`}>
          <ellipse cx="0" cy="0" rx="23" ry="9" fill={i % 2 === 0 ? colorA : colorB} stroke="#00000040" />
          <ellipse cx="0" cy="-2.2" rx="23" ry="9" fill="none" stroke="#ffffff26" strokeDasharray="4 4" />
        </g>
      ))}
    </g>
  );
}

export default function TournamentArt({ format }: { format: string }) {
  const t = THEMES[format] ?? THEMES.freezeout;
  const id = format.replace(/[^a-z]/gi, "");

  return (
    <svg className="tc-art-svg" viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id={`tcfelt-${id}`} cx="72%" cy="25%" r="95%">
          <stop offset="0%" stopColor={t.felt} />
          <stop offset="100%" stopColor={t.feltDark} />
        </radialGradient>
        <linearGradient id={`tcfade-${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#000" stopOpacity="0.92" />
          <stop offset="42%" stopColor="#000" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#000" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="320" height="200" fill={`url(#tcfelt-${id})`} />
      <ChipStack cx={286} cy={176} rows={3} colorA={t.chipA} colorB={t.chipB} />
      <ChipStack cx={250} cy={184} rows={2} colorA={t.chipB} colorB={t.chipA} />
      <g transform="translate(232,110) rotate(-12)">
        <rect x="-27" y="-37" width="58" height="82" rx="8" fill="#f4ecd8" stroke="#00000022" />
        <text x="2" y="12" fontSize="38" textAnchor="middle" fill={t.feltDark} fontFamily="Georgia, serif">
          {t.glyph}
        </text>
      </g>
      <rect width="320" height="200" fill={`url(#tcfade-${id})`} />
    </svg>
  );
}
