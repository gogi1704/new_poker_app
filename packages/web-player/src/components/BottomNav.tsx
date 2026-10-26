export type Tab = "home" | "tournaments" | "results" | "rating" | "profile";

const ITEMS: { id: Tab; icon: string; label: string }[] = [
  { id: "tournaments", icon: "🏆", label: "Турниры" },
  { id: "results", icon: "📜", label: "Результаты" },
  { id: "home", icon: "🏠", label: "Главная" },
  { id: "rating", icon: "👑", label: "Рейтинг" },
  { id: "profile", icon: "👤", label: "Профиль" },
];

export default function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav className="bottom-nav">
      {ITEMS.map((item) => (
        <button
          key={item.id}
          className={item.id === active ? "active" : ""}
          onClick={() => onChange(item.id)}
        >
          <span className="icon">{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
