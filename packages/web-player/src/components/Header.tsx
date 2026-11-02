import "./DonPokerHeader.css";

export interface ClubInfo {
  name: string;
  logoUrl: string | null;
}

export default function Header({ club }: { club: ClubInfo | null }) {
  // A club without its own icon configured yet (Club Settings in the TD
  // panel) falls back to the default Don-Poker banner rather than showing a
  // blank/placeholder header.
  if (!club?.logoUrl) {
    return (
      <header className="header header--don-poker">
        <img
          className="don-poker-banner"
          src="/don-poker-logo.png"
          alt="Don-Poker — Poker Club"
          width={2117}
          height={743}
          fetchPriority="high"
        />
      </header>
    );
  }

  return (
    <header className="header header--don-poker">
      <div className="don-poker-brand">
        <img className="don-poker-icon" src={club.logoUrl} alt="" />
        <div>
          <div className="don-poker-name">{club.name}</div>
          <div className="don-poker-sub">POKER CLUB</div>
        </div>
      </div>
    </header>
  );
}
