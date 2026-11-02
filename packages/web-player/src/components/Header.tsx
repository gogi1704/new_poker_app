import "./DonPokerHeader.css";

export interface ClubInfo {
  name: string;
  logoUrl: string | null;
}

export default function Header(_props: { club: ClubInfo | null }) {
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
