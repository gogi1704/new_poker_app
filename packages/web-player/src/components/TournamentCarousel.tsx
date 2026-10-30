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
  const [dragDeltaPct, setDragDeltaPct] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const suppressClick = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);

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
    const timer = setTimeout(() => {
      if (!draggingRef.current) advance(1);
    }, SLIDE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, tournaments.length]);

  function handleTouchStart(e: React.TouchEvent) {
    if (tournaments.length < 2) return;
    touchStartX.current = e.touches[0].clientX;
    draggingRef.current = true;
    setIsDragging(true);
    setAnimate(false);
    setDragDeltaPct(0);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || !viewportRef.current) return;
    const deltaPx = e.touches[0].clientX - touchStartX.current;
    const widthPx = viewportRef.current.offsetWidth || 1;
    const pct = Math.max(-100, Math.min(100, (deltaPx / widthPx) * 100));
    setDragDeltaPct(pct);
  }

  function handleTouchEnd(e: React.TouchEvent) {
    draggingRef.current = false;
    setIsDragging(false);
    if (touchStartX.current === null || tournaments.length < 2) {
      touchStartX.current = null;
      setAnimate(true);
      setDragDeltaPct(0);
      return;
    }
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    setAnimate(true);
    setDragDeltaPct(0);
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

  const dragFillFraction = Math.max(0, Math.min(1, -dragDeltaPct / 100));

  return (
    <div
      className="carousel-viewport"
      ref={viewportRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onClickCapture={handleClickCapture}
    >
      {tournaments.length > 1 && (
        <div className="carousel-progress">
          {tournaments.map((t, i) => {
            const isActive = i === index;
            const fillStyle = isActive && isDragging
              ? { width: `${dragFillFraction * 100}%`, animation: "none" as const }
              : isActive
                ? { animationDuration: `${SLIDE_MS}ms` }
                : undefined;
            return (
              <div key={t.id} className="carousel-segment">
                <div
                  key={isActive ? `active-${index}` : "idle"}
                  className={`carousel-segment-fill ${i < index ? "done" : isActive && !isDragging ? "active" : ""}`}
                  style={fillStyle}
                />
              </div>
            );
          })}
        </div>
      )}
      <div
        className="carousel-track"
        style={{
          transform: `translateX(calc(-${index * 100}% + ${dragDeltaPct}%))`,
          transition: animate ? undefined : "none",
        }}
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
