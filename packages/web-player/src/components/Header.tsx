import { Club } from "lucide-react";

export interface ClubInfo {
  name: string;
  logoUrl: string | null;
}

export default function Header({ club }: { club: ClubInfo | null }) {
  return (
    <div className="header">
      <div className="logo">
        {club?.logoUrl ? (
          <img src={club.logoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }} />
        ) : (
          <Club size={22} />
        )}
      </div>
      <div>
        <div className="club-name">{club?.name ?? "МОЙ ПОКЕР КЛУБ"}</div>
        <div className="club-sub">POKER CLUB</div>
      </div>
    </div>
  );
}
