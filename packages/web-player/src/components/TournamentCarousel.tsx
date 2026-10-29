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
  const [animate, setAnimate] = useState(true);
  const touchStartX = useRef<number | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => {
    if (index >= tournaments.length) setIndex(0);
  }, [tournaments.length, index]);

  function advance(direction: 1 | -1) {
    setIndex((i) => {
      const next = (i + direction + tournaments.length) % tournaments.length;
      const wrapped = direction === 1 ? next < i : next > i;
      setAnimate(!wrapped);
      if (wrapped) {
        // Let the instant (no-transition) jump to the wrap target paint first,
        // then re-enable the transition so the *next* move slides normally.
        requestAnimationFrame(() => requestAnimationFrame(() => setAnimate(true)));
      }
      return next;
    });
  }

  useEffect(() => {
    if (tournaments.length < 2) return;
    const timer = setTimeout(() => advance(1), SLIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    advance(delta < 0 ? 1 : -1);
  }

  function handleClickCapture(e: React.MouseEvent) {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  }

  if (tournaments.length === 0) return null;

  return (
    <div
      className="carousel-viewport"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onClickCapture={handleClickCapture}
    >
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
      <div
        className="carousel-track"
        style={{ transform: `translateX(-${index * 100}%)`, transition: animate ? undefined : "none" }}
      >
        {tournaments.map((t) => (
          <div className="carousel-slide" key={t.id}>
            <TournamentCard tournament={t} onClick={() => onOpen(t.id)} />
          </div>
        ))}
      </div>
    </div>
  );
}
