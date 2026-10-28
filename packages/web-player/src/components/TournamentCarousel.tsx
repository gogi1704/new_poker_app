import { useEffect, useRef, useState } from "react";
import type { TournamentSummary } from "../lib/types.js";
import TournamentCard from "./TournamentCard.js";

const SLIDE_MS = 6000;
const SWIPE_THRESHOLD = 40;

export default function TournamentCarousel({
  tournaments,
  onOpen,
}: {
  tournaments: TournamentSummary[];
  onOpen: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (index >= tournaments.length) setIndex(0);
  }, [tournaments.length, index]);

  useEffect(() => {
    if (tournaments.length < 2) return;
    const timer = setTimeout(() => {
      setIndex((i) => (i + 1) % tournaments.length);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
  }, [index, tournaments.length]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || tournaments.length < 2) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) < SWIPE_THRESHOLD) return;
    suppressClick.current = true;
    setIndex((i) => (delta < 0 ? (i + 1) % tournaments.length : (i - 1 + tournaments.length) % tournaments.length));
  }

  function handleClickCapture(e: React.MouseEvent) {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  }

  const current = tournaments[index];
  if (!current) return null;

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd} onClickCapture={handleClickCapture}>
      {tournaments.length > 1 && (
        <div className="carousel-progress">
          {tournaments.map((t, i) => (
            <div key={t.id} className="carousel-segment">
              <div
                key={i === index ? `active-${index}` : "idle"}
                className={`carousel-segment-fill ${i < index ? "done" : i === index ? "active" : ""}`}
                style={i === index ? { animationDuration: `${SLIDE_MS}ms` } : undefined}
              />
            </div>
          ))}
        </div>
      )}
      <TournamentCard tournament={current} onClick={() => onOpen(current.id)} />
    </div>
  );
}
