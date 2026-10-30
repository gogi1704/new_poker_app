// Two photographed backgrounds instead of procedural SVG art: blue felt for
// formats without a knockout/bounty component, green felt (with the
// target-chip, thematically a bounty) for formats that have one.
const IMAGE_BY_FORMAT: Record<string, string> = {
  freezeout: "/tournament-art/freezeout.webp",
  reentry: "/tournament-art/freezeout.webp",
  knockout: "/tournament-art/knockout.webp",
  reentry_knockout: "/tournament-art/knockout.webp",
};

export default function TournamentArt({ format }: { format: string }) {
  const src = IMAGE_BY_FORMAT[format] ?? IMAGE_BY_FORMAT.freezeout;

  return (
    <div className="tc-art-bg" aria-hidden="true">
      <img className="tc-art-img" src={src} alt="" />
      <div className="tc-art-fade" />
    </div>
  );
}
