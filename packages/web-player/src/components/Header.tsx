import { Club } from "lucide-react";

export default function Header() {
  return (
    <div className="header">
      <div className="logo">
        <Club size={22} />
      </div>
      <div>
        <div className="club-name">МОЙ ПОКЕР КЛУБ</div>
        <div className="club-sub">POKER CLUB</div>
      </div>
    </div>
  );
}
