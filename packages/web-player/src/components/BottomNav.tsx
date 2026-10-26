import { Trophy, ScrollText, Home, Crown, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Tab = "home" | "tournaments" | "results" | "rating" | "profile";

const ITEMS: { id: Tab; icon: LucideIcon; label: string }[] = [
  { id: "tournaments", icon: Trophy, label: "Турниры" },
  { id: "results", icon: ScrollText, label: "Результаты" },
  { id: "home", icon: Home, label: "Главная" },
  { id: "rating", icon: Crown, label: "Рейтинг" },
  { id: "profile", icon: User, label: "Профиль" },
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
          <span className="icon">
            <item.icon size={22} strokeWidth={item.id === active ? 2.4 : 1.8} />
          </span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
