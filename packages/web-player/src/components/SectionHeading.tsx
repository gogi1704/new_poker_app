export default function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="eyebrow">— {eyebrow}</div>
      <strong style={{ fontSize: 20 }}>{title}</strong>
    </div>
  );
}
